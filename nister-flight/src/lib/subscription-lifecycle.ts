import { hasUnpaidPlanSelectionMismatch } from "@/lib/plan-selection";
import {
  ExecutionSessionStatus,
  SubscriptionStatus,
  UserAccountState,
  UserFundsState,
  UserTradeState,
} from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { calculateReferralAmounts } from "@/lib/referrals";

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

const LOW_BALANCE_TITLE = "Subscription credit low for upcoming renewal";
const EXPIRED_TITLE = "Subscription expired due to low billing credit";
const RENEWED_TITLE = "Subscription renewed from billing credit";

type LifecycleResult =
  | { status: "noop" }
  | {
      status: "renewed";
      planName: string;
      chargedCents: number;
      balanceCents: number;
      expiresAt: Date;
    }
  | {
      status: "expired";
      planName: string;
      dueCents: number;
      balanceCents: number;
    }
  | {
      status: "reminder";
      planName: string;
      dueCents: number;
      balanceCents: number;
      expiresAt: Date;
    };

type WalletChargeEligibilityInput = {
  status: SubscriptionStatus;
  expiresAt: Date | null;
  chargeCents: number;
  balanceCents: number;
  nowMs?: number;
};

type SweepSubscriptionLifecycleInput = {
  now?: Date;
  limit?: number;
  dryRun?: boolean;
};

type SweepSubscriptionLifecycleResult = {
  dryRun: boolean;
  scanned: number;
  renewed: number;
  expired: number;
  reminders: number;
  noop: number;
  hasMore: boolean;
};

const SUBSCRIPTION_LIFECYCLE_SWEEP_LIMIT = 50;
const SUBSCRIPTION_LIFECYCLE_SWEEP_MAX = 200;
const REMINDER_WINDOW_MS = 72 * 60 * 60 * 1000;

function plus30Days(from = new Date()) {
  return new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
}

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function monthlyChargeCents(input: {
  monthlyPriceCents: number;
  referredById: string | null;
  referralEnabled: boolean;
  referralDiscountBps: number;
  recurringAddonChargeCents: number;
}) {
  const safeBase = Math.max(0, Math.round(input.monthlyPriceCents || 0));
  const safeAddonCharge = Math.max(0, Math.round(input.recurringAddonChargeCents || 0));
  if (!safeBase && !safeAddonCharge) {
    return 0;
  }

  const discountBps = input.referralEnabled && Boolean(input.referredById) ? input.referralDiscountBps : 0;
  if (!discountBps) {
    return safeBase + safeAddonCharge;
  }

  return calculateReferralAmounts(safeBase, discountBps, 0).finalCents + safeAddonCharge;
}

function parseAddonSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((row) => (typeof row === "string" ? row.trim() : ""))
    .filter(Boolean)
    .slice(0, 24);
}

function isSubscriptionDueForWalletCharge(input: {
  status: SubscriptionStatus;
  expiresAt: Date | null;
  nowMs: number;
}) {
  if (input.status === SubscriptionStatus.CANCELED) return false;
  if (input.status === SubscriptionStatus.PAST_DUE || input.status === SubscriptionStatus.EXPIRED) {
    return true;
  }
  if (input.expiresAt) {
    return input.expiresAt.getTime() <= input.nowMs;
  }
  return input.status === SubscriptionStatus.INACTIVE || input.status === SubscriptionStatus.PENDING;
}

function evaluateWalletChargeEligibility(input: WalletChargeEligibilityInput) {
  const chargeCents = Math.max(0, Math.round(input.chargeCents || 0));
  const balanceCents = Math.max(0, Math.round(input.balanceCents || 0));
  const due = isSubscriptionDueForWalletCharge({
    status: input.status,
    expiresAt: input.expiresAt,
    nowMs: input.nowMs ?? Date.now(),
  });

  return {
    due,
    eligible: due && chargeCents > 0 && balanceCents >= chargeCents,
    chargeCents,
    balanceCents,
  };
}

async function hasRecentNotice(userId: string, title: string, withinHours: number) {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  const count = await prisma.notification.count({
    where: {
      userId,
      title,
      createdAt: { gte: cutoff },
    },
  });
  return count > 0;
}

async function notifyLifecycle(input: {
  userId: string;
  title: string;
  message: string;
  subject: string;
  href?: string;
  dedupeHours?: number;
}) {
  const dedupeHours = input.dedupeHours ?? 24;
  if (dedupeHours > 0) {
    const seen = await hasRecentNotice(input.userId, input.title, dedupeHours);
    if (seen) {
      return;
    }
  }

  await notifyUser(input.userId, {
    title: input.title,
    message: input.message,
    href: input.href || "/dashboard/billing",
    email: {
      subject: input.subject,
    },
  });
}

export async function reconcileUserSubscriptionLifecycle(userId: string): Promise<LifecycleResult> {
  if (!hasDatabaseConfig) {
    return { status: "noop" };
  }

  const settings = await prisma.platformSetting.findUnique({
    where: { id: 1 },
    select: {
      referralEnabled: true,
      referralDiscountBps: true,
    },
  });

  const snapshot = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      referredById: true,
      marketEnrollments: { where: { market: "FOREX" }, select: { planId: true } },
      subscription: {
        include: {
          plan: {
            select: {
              name: true,
              monthlyPriceCents: true,
            },
          },
        },
      },
      tradingProfile: {
        select: {
          availableFundsUsdCents: true,
        },
      },
    },
  });

  if (!snapshot?.subscription || !snapshot.tradingProfile) {
    return { status: "noop" };
  }

  if (snapshot.subscription.status === SubscriptionStatus.CANCELED) return { status: "noop" };

  if (hasUnpaidPlanSelectionMismatch({ subscriptionPlanId: snapshot.subscription.planId, selectedPlanId: snapshot.marketEnrollments[0]?.planId, status: snapshot.subscription.status, expiresAt: snapshot.subscription.expiresAt })) return { status: "noop" };

  const activeAddonSlugs = parseAddonSlugs(snapshot.subscription.activeAddonSlugs);
  let recurringAddonChargeCents = 0;
  if (activeAddonSlugs.length) {
    const recurringAddons = await prisma.offerAddon.findMany({
      where: {
        active: true,
        billing: "RECURRING",
        slug: { in: activeAddonSlugs },
      },
      select: {
        priceUsdCents: true,
      },
    });
    recurringAddonChargeCents = recurringAddons.reduce((sum, item) => sum + Math.max(0, item.priceUsdCents), 0);
  }

  const chargeCents = monthlyChargeCents({
    monthlyPriceCents: snapshot.subscription.plan.monthlyPriceCents,
    referredById: snapshot.referredById,
    referralEnabled: Boolean(settings?.referralEnabled),
    referralDiscountBps: settings?.referralDiscountBps ?? 0,
    recurringAddonChargeCents,
  });

  const now = Date.now();
  const expiresAt = snapshot.subscription.expiresAt;
  const balanceCents = snapshot.tradingProfile.availableFundsUsdCents ?? 0;
  const eligibility = evaluateWalletChargeEligibility({
    status: snapshot.subscription.status,
    expiresAt,
    chargeCents,
    balanceCents,
    nowMs: now,
  });

  if (!eligibility.due && expiresAt) {
    const msToExpiry = expiresAt.getTime() - now;
    const reminderWindowMs = 72 * 60 * 60 * 1000;
    if (msToExpiry <= reminderWindowMs && chargeCents > 0 && balanceCents < chargeCents) {
      const result: LifecycleResult = {
        status: "reminder",
        planName: snapshot.subscription.plan.name,
        dueCents: chargeCents,
        balanceCents,
        expiresAt,
      };
      await notifyLifecycle({
        userId,
        title: LOW_BALANCE_TITLE,
        message: `Your ${result.planName} plan renews soon. Subscription credit ${formatUsd(result.balanceCents)} is below required ${formatUsd(result.dueCents)}. Top up subscription credit to avoid service suspension. Trading capital is separate from subscription credit.`,
        subject: "Top up required before subscription renewal",
        href: "/dashboard/billing",
        dedupeHours: 24,
      });
      return result;
    }
    return { status: "noop" };
  }

  if (chargeCents <= 0) {
    return { status: "noop" };
  }

  const expectedPlanId = snapshot.subscription.planId;
  const expectedPlanPrice = snapshot.subscription.plan.monthlyPriceCents;
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        marketEnrollments: { where: { market: "FOREX" }, select: { planId: true } },
        subscription: {
          include: {
            plan: {
              select: {
                name: true,
                monthlyPriceCents: true,
              },
            },
          },
        },
        tradingProfile: {
          select: {
            accountState: true,
            availableFundsUsdCents: true,
          },
        },
      },
    });

    if (!user?.subscription || !user.tradingProfile) {
      return { status: "noop" } as LifecycleResult;
    }

    if (user.subscription.planId !== expectedPlanId || user.subscription.plan.monthlyPriceCents !== expectedPlanPrice) return { status: "noop" } as LifecycleResult;
    if (hasUnpaidPlanSelectionMismatch({ subscriptionPlanId: user.subscription.planId, selectedPlanId: user.marketEnrollments[0]?.planId, status: user.subscription.status, expiresAt: user.subscription.expiresAt })) return { status: "noop" } as LifecycleResult;

    const txNow = Date.now();
    const txExpiresAt = user.subscription.expiresAt;
    const txEligibility = evaluateWalletChargeEligibility({
      status: user.subscription.status,
      expiresAt: txExpiresAt,
      chargeCents,
      balanceCents: user.tradingProfile.availableFundsUsdCents ?? 0,
      nowMs: txNow,
    });

    if (!txEligibility.due) {
      return { status: "noop" } as LifecycleResult;
    }

    const currentBalance = user.tradingProfile.availableFundsUsdCents ?? 0;
    if (currentBalance >= chargeCents) {
      const newBalance = currentBalance - chargeCents;
      const renewalStart = new Date();
      const renewedUntil = plus30Days(renewalStart);

      await tx.subscription.update({
        where: { id: user.subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          startedAt: user.subscription.startedAt || renewalStart,
          expiresAt: renewedUntil,
        },
      });

      await tx.userTradingProfile.update({
        where: { userId },
        data: {
          availableFundsUsdCents: newBalance,
          fundsState: newBalance > 0 ? UserFundsState.FUNDED : UserFundsState.UNFUNDED,
          tradeState: UserTradeState.READY,
          accountState:
            user.tradingProfile.accountState === UserAccountState.SUSPENDED ||
            user.tradingProfile.accountState === UserAccountState.CLOSED
              ? user.tradingProfile.accountState
              : UserAccountState.ACTIVE,
        },
      });

      return {
        status: "renewed",
        planName: user.subscription.plan.name,
        chargedCents: chargeCents,
        balanceCents: newBalance,
        expiresAt: renewedUntil,
      } as LifecycleResult;
    }

    const effectiveExpiryAt =
      txExpiresAt && txExpiresAt.getTime() <= txNow ? txExpiresAt : new Date(txNow);

    await tx.subscription.update({
      where: { id: user.subscription.id },
      data: {
        status: SubscriptionStatus.EXPIRED,
        expiresAt: effectiveExpiryAt,
      },
    });

    await tx.userTradingProfile.update({
      where: { userId },
      data: {
        fundsState: currentBalance > 0 ? UserFundsState.RESTRICTED : UserFundsState.UNFUNDED,
        tradeState: UserTradeState.STOPPED,
        autotradeEnabled: false,
        accountState:
          user.tradingProfile.accountState === UserAccountState.SUSPENDED ||
          user.tradingProfile.accountState === UserAccountState.CLOSED
            ? user.tradingProfile.accountState
            : UserAccountState.LIMITED,
      },
    });

    await tx.executionSession.updateMany({
      where: {
        userId,
        status: ExecutionSessionStatus.ACTIVE,
      },
      data: {
        status: ExecutionSessionStatus.BLOCKED,
        endedAt: new Date(),
      },
    });

    return {
      status: "expired",
      planName: user.subscription.plan.name,
      dueCents: chargeCents,
      balanceCents: currentBalance,
    } as LifecycleResult;
  });

  if (result.status === "renewed") {
    await notifyLifecycle({
      userId,
      title: RENEWED_TITLE,
      message: `${formatUsd(result.chargedCents)} was deducted from your Nister billing credit for ${result.planName}. New credit: ${formatUsd(result.balanceCents)}. Next renewal: ${result.expiresAt.toLocaleDateString()}.`,
      subject: "Subscription renewed successfully",
      href: "/dashboard/billing",
      dedupeHours: 1,
    });
  }

  if (result.status === "expired") {
    await notifyLifecycle({
      userId,
      title: EXPIRED_TITLE,
      message: `Your subscription credit ${formatUsd(result.balanceCents)} is below required renewal amount ${formatUsd(result.dueCents)}. Nister AI stopped new commands. Existing broker positions still need your monitoring. Top up subscription credit to renew.`,
      subject: "Subscription expired: billing credit top-up required",
      href: "/dashboard/billing",
      dedupeHours: 24,
    });
  }

  return result;
}

export async function sweepSubscriptionLifecycle(
  input: SweepSubscriptionLifecycleInput = {},
): Promise<SweepSubscriptionLifecycleResult> {
  if (!hasDatabaseConfig) {
    return {
      dryRun: Boolean(input.dryRun),
      scanned: 0,
      renewed: 0,
      expired: 0,
      reminders: 0,
      noop: 0,
      hasMore: false,
    };
  }

  const now = input.now ?? new Date();
  const reminderCutoff = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const limit = Math.max(
    1,
    Math.min(
      SUBSCRIPTION_LIFECYCLE_SWEEP_MAX,
      Math.trunc(input.limit ?? SUBSCRIPTION_LIFECYCLE_SWEEP_LIMIT),
    ),
  );

  const candidates = await prisma.subscription.findMany({
    where: {
      OR: [
        {
          status: {
            in: [
              SubscriptionStatus.INACTIVE,
              SubscriptionStatus.PENDING,
              SubscriptionStatus.PAST_DUE,
              SubscriptionStatus.EXPIRED,
            ],
          },
        },
        {
          expiresAt: {
            lte: reminderCutoff,
          },
        },
      ],
    },
    select: {
      userId: true,
    },
    orderBy: [
      {
        expiresAt: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    take: limit + 1,
  });

  const hasMore = candidates.length > limit;
  const userIds = candidates.slice(0, limit).map((candidate) => candidate.userId);
  if (!userIds.length) {
    return {
      dryRun: Boolean(input.dryRun),
      scanned: 0,
      renewed: 0,
      expired: 0,
      reminders: 0,
      noop: 0,
      hasMore,
    };
  }

  if (input.dryRun) {
    return {
      dryRun: true,
      scanned: userIds.length,
      renewed: 0,
      expired: 0,
      reminders: 0,
      noop: 0,
      hasMore,
    };
  }

  const summary: SweepSubscriptionLifecycleResult = {
    dryRun: false,
    scanned: 0,
    renewed: 0,
    expired: 0,
    reminders: 0,
    noop: 0,
    hasMore,
  };

  for (const userId of userIds) {
    const result = await reconcileUserSubscriptionLifecycle(userId);
    summary.scanned += 1;
    if (result.status === "renewed") {
      summary.renewed += 1;
      continue;
    }
    if (result.status === "expired") {
      summary.expired += 1;
      continue;
    }
    if (result.status === "reminder") {
      summary.reminders += 1;
      continue;
    }
    summary.noop += 1;
  }

  return summary;
}

export const __test = {
  evaluateWalletChargeEligibility,
};
