import crypto from "node:crypto";
import { Prisma, SubscriptionStatus, UserTradeState } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { runMarketingAutomationSweep } from "@/lib/marketing";
import { notifyAdmins, notifyUser } from "@/lib/notifications";
import { getUserOnboardingState, onboardingRoutes } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/site";

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

const VISITOR_COOKIE_NAME = "nister_vid";
const SESSION_COOKIE_NAME = "nister_sid";
export const PRICING_EXPERIMENT_KEY = "pricing_offer_v1";

export type PricingExperimentVariant = "control" | "trust_offer_boost";

type ConversionEventInput = {
  userId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  eventName: string;
  pagePath?: string | null;
  referrer?: string | null;
  experimentKey?: string | null;
  variantKey?: string | null;
  valueUsdCents?: number | null;
  metadata?: Prisma.JsonValue;
};

type VisitorContext = {
  visitorId: string;
  sessionId: string;
  referrer: string | null;
};

function sanitizeIdentifier(value: string | null | undefined, fallbackPrefix: string) {
  const trimmed = (value || "").trim();
  if (/^[a-zA-Z0-9_-]{8,96}$/.test(trimmed)) {
    return trimmed;
  }
  const random = crypto.randomBytes(12).toString("hex");
  return `${fallbackPrefix}_${random}`;
}

function sanitizePath(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  return trimmed.slice(0, 191);
}

function toPercentBucket(seed: string) {
  const hex = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 8);
  const bucket = Number.parseInt(hex, 16);
  if (!Number.isFinite(bucket)) {
    return 0;
  }
  return bucket % 100;
}

async function resolveVisitorContext(explicitVisitorId?: string | null, explicitSessionId?: string | null): Promise<VisitorContext> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieVisitor = cookieStore.get(VISITOR_COOKIE_NAME)?.value || null;
  const cookieSession = cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
  const fallbackSeed = [
    headerStore.get("user-agent") || "",
    headerStore.get("x-forwarded-for") || "",
    headerStore.get("accept-language") || "",
  ].join("|");
  const fallbackVisitor = `fb_${crypto.createHash("sha256").update(fallbackSeed).digest("hex").slice(0, 24)}`;

  return {
    visitorId: sanitizeIdentifier(explicitVisitorId || cookieVisitor || fallbackVisitor, "vid"),
    sessionId: sanitizeIdentifier(explicitSessionId || cookieSession || null, "sid"),
    referrer: (headerStore.get("referer") || "").trim().slice(0, 191) || null,
  };
}

function isSubscriptionActive(status: SubscriptionStatus | null | undefined, expiresAt: Date | null | undefined) {
  if (status !== SubscriptionStatus.ACTIVE) {
    return false;
  }
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

export async function getVisitorContext() {
  return resolveVisitorContext();
}

export async function captureConversionEvent(input: ConversionEventInput) {
  if (!hasDatabaseConfig) {
    return;
  }

  const visitor = await resolveVisitorContext(input.visitorId, input.sessionId);
  const metadataJson =
    typeof input.metadata === "undefined"
      ? undefined
      : input.metadata === null
        ? Prisma.DbNull
        : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue);
  await prisma.conversionEvent.create({
    data: {
      userId: input.userId || null,
      visitorId: visitor.visitorId,
      sessionId: visitor.sessionId,
      eventName: input.eventName.trim().slice(0, 80),
      pagePath: sanitizePath(input.pagePath),
      referrer: (input.referrer || visitor.referrer || "").trim().slice(0, 191) || null,
      experimentKey: (input.experimentKey || "").trim().slice(0, 80) || null,
      variantKey: (input.variantKey || "").trim().slice(0, 80) || null,
      valueUsdCents:
        typeof input.valueUsdCents === "number" && Number.isFinite(input.valueUsdCents)
          ? Math.max(0, Math.round(input.valueUsdCents))
          : null,
      metadataJson,
    },
  });
}

export async function captureConversionEventSafe(input: ConversionEventInput) {
  try {
    await captureConversionEvent(input);
  } catch {
    // Conversion capture should never block user-facing flows.
  }
}

export async function resolvePricingExperimentVariant(input: {
  userId?: string | null;
  pagePath?: string;
}): Promise<{
  experimentKey: string;
  variant: PricingExperimentVariant;
  inRollout: boolean;
  visitorId: string;
}> {
  const settings = await getPlatformSettings();
  const visitor = await resolveVisitorContext();
  const rollout = Math.max(0, Math.min(100, Math.round(settings.experimentPricingRolloutPct)));
  if (!settings.experimentPricingEnabled || rollout <= 0) {
    return {
      experimentKey: PRICING_EXPERIMENT_KEY,
      variant: "control",
      inRollout: false,
      visitorId: visitor.visitorId,
    };
  }

  let assignedVariant: PricingExperimentVariant | null = null;
  if (hasDatabaseConfig) {
    try {
      const existing = await prisma.experimentAssignment.findUnique({
        where: {
          visitorId_experimentKey: {
            visitorId: visitor.visitorId,
            experimentKey: PRICING_EXPERIMENT_KEY,
          },
        },
        select: {
          variantKey: true,
        },
      });
      if (existing?.variantKey === "trust_offer_boost" || existing?.variantKey === "control") {
        assignedVariant = existing.variantKey;
      }
    } catch {
      // Fall back to deterministic assignment below.
    }
  }

  const assignmentSeed = input.userId || visitor.visitorId;
  const bucket = toPercentBucket(`${PRICING_EXPERIMENT_KEY}:${assignmentSeed}`);
  const inRollout = bucket < rollout;
  const computedVariant: PricingExperimentVariant = inRollout && bucket % 2 === 1 ? "trust_offer_boost" : "control";
  const variant = assignedVariant || computedVariant;

  if (hasDatabaseConfig && !assignedVariant) {
    try {
      await prisma.experimentAssignment.upsert({
        where: {
          visitorId_experimentKey: {
            visitorId: visitor.visitorId,
            experimentKey: PRICING_EXPERIMENT_KEY,
          },
        },
        update: {
          userId: input.userId || undefined,
          variantKey: variant,
        },
        create: {
          userId: input.userId || undefined,
          visitorId: visitor.visitorId,
          experimentKey: PRICING_EXPERIMENT_KEY,
          variantKey: variant,
        },
      });
    } catch {
      // Assignment persistence is best-effort.
    }
  }

  await captureConversionEventSafe({
    userId: input.userId || null,
    visitorId: visitor.visitorId,
    sessionId: visitor.sessionId,
    eventName: "experiment_exposure",
    pagePath: input.pagePath || "/pricing",
    experimentKey: PRICING_EXPERIMENT_KEY,
    variantKey: variant,
    metadata: {
      rollout_pct: rollout,
      in_rollout: inRollout,
    },
  });

  return {
    experimentKey: PRICING_EXPERIMENT_KEY,
    variant,
    inRollout,
    visitorId: visitor.visitorId,
  };
}

export async function trackOnboardingActivity(input: {
  userId: string;
  stage: string;
  pagePath: string;
  metadata?: Prisma.JsonValue;
}) {
  if (!hasDatabaseConfig) {
    return;
  }

  const now = new Date();
  const stage = input.stage.slice(0, 80);
  const existing = await prisma.onboardingRecoveryState.findUnique({
    where: { userId: input.userId },
    select: {
      id: true,
      currentStage: true,
    },
  });

  if (!existing) {
    await prisma.onboardingRecoveryState.create({
      data: {
        userId: input.userId,
        currentStage: stage,
        lastActivityAt: now,
        reminderCount: 0,
        stageReminderCount: 0,
        stageEnteredAt: now,
      },
    });
  } else {
    const stageChanged = existing.currentStage !== stage;
    await prisma.onboardingRecoveryState.update({
      where: { id: existing.id },
      data: {
        currentStage: stage,
        lastActivityAt: now,
        completedAt: null,
        ...(stageChanged
          ? {
              stageReminderCount: 0,
              stageEnteredAt: now,
              lastReminderAt: null,
            }
          : {}),
      },
    });
  }

  await captureConversionEventSafe({
    userId: input.userId,
    eventName: "onboarding_stage_seen",
    pagePath: input.pagePath,
    metadata: {
      stage: input.stage,
      ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? input.metadata
        : {}),
    },
  });
}

export async function markOnboardingComplete(userId: string) {
  if (!hasDatabaseConfig) {
    return;
  }
  await prisma.onboardingRecoveryState.upsert({
    where: { userId },
    update: {
      completedAt: new Date(),
    },
    create: {
      userId,
      currentStage: "complete",
      lastActivityAt: new Date(),
      completedAt: new Date(),
    },
  });
  await captureConversionEventSafe({
    userId,
    eventName: "onboarding_completed",
    pagePath: onboardingRoutes.dashboard,
  });
}

export type RecoverySweepResult = {
  enabled: boolean;
  scanned: number;
  reminded: number;
  escalated: number;
  resolved: number;
  skipped: number;
  marketingSequenceSent: number;
  marketingBlastSent: number;
  marketingBlastFailed: number;
  marketingBlastSkipped: number;
};

export async function runOnboardingRecoverySweep(source: "manual" | "internal" = "manual"): Promise<RecoverySweepResult> {
  if (!hasDatabaseConfig) {
    return {
      enabled: false,
      scanned: 0,
      reminded: 0,
      escalated: 0,
      resolved: 0,
      skipped: 0,
      marketingSequenceSent: 0,
      marketingBlastSent: 0,
      marketingBlastFailed: 0,
      marketingBlastSkipped: 0,
    };
  }

  const settings = await getPlatformSettings();
  const abandonmentEnabled = settings.abandonmentRecoveryEnabled;

  const now = new Date();
  const reminderCutoff = new Date(now.getTime() - settings.abandonmentReminderDelayMins * 60_000);
  const escalationCutoff = new Date(now.getTime() - settings.abandonmentEscalationDelayMins * 60_000);
  const dedupeEscalationCutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  const states = abandonmentEnabled
    ? await prisma.onboardingRecoveryState.findMany({
        where: {
          completedAt: null,
          lastActivityAt: {
            lte: reminderCutoff,
          },
        },
        orderBy: [{ lastActivityAt: "asc" }],
        take: 500,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              subscription: {
                select: {
                  status: true,
                  expiresAt: true,
                },
              },
              tradingProfile: {
                select: {
                  tradeState: true,
                  autotradeEnabled: true,
                },
              },
            },
          },
        },
      })
    : [];

  const result: RecoverySweepResult = {
    enabled: abandonmentEnabled,
    scanned: 0,
    reminded: 0,
    escalated: 0,
    resolved: 0,
    skipped: 0,
    marketingSequenceSent: 0,
    marketingBlastSent: 0,
    marketingBlastFailed: 0,
    marketingBlastSkipped: 0,
  };

  for (const state of states) {
    result.scanned += 1;
    const user = state.user;
    const finished =
      isSubscriptionActive(user.subscription?.status, user.subscription?.expiresAt) &&
      user.tradingProfile?.tradeState === UserTradeState.LIVE &&
      user.tradingProfile.autotradeEnabled;
    if (finished) {
      await prisma.onboardingRecoveryState.update({
        where: { id: state.id },
        data: {
          completedAt: now,
        },
      });
      result.resolved += 1;
      continue;
    }

    const reminderDue =
      state.stageReminderCount < settings.abandonmentMaxReminders &&
      (!state.lastReminderAt || state.lastReminderAt.getTime() <= reminderCutoff.getTime());
    const escalationDue =
      state.lastActivityAt.getTime() <= escalationCutoff.getTime() &&
      (!state.escalatedAt || state.escalatedAt.getTime() <= dedupeEscalationCutoff.getTime());

    let nextRoute: string = onboardingRoutes.checkpoint;
    try {
      const onboarding = await getUserOnboardingState(user.id);
      nextRoute = onboarding.nextRoute;
    } catch {
      // Keep fallback route when onboarding snapshot is unavailable.
    }

    if (reminderDue) {
      await notifyUser(user.id, {
        title: "Resume your setup",
        message: "Your onboarding is paused. Continue from your setup checkpoint to finish activation.",
        href: nextRoute,
        email: {
          subject: "Your setup is waiting for you",
        },
      });

      await prisma.onboardingRecoveryState.update({
        where: { id: state.id },
        data: {
          reminderCount: { increment: 1 },
          stageReminderCount: { increment: 1 },
          lastReminderAt: now,
        },
      });

      await captureConversionEventSafe({
        userId: user.id,
        eventName: "abandonment_reminder_sent",
        pagePath: nextRoute,
        metadata: {
          stage: state.currentStage,
          reminder_count: state.stageReminderCount + 1,
          source,
        },
      });
      result.reminded += 1;
    }

    if (escalationDue) {
      await notifyAdmins({
        title: "Onboarding abandonment escalation",
        message: `${user.name} has been inactive in onboarding for an extended window and may need sales/support intervention.`,
        href: "/admin/users",
      });
      await prisma.onboardingRecoveryState.update({
        where: { id: state.id },
        data: {
          escalatedAt: now,
        },
      });
      await captureConversionEventSafe({
        userId: user.id,
        eventName: "abandonment_escalated",
        pagePath: "/admin/users",
        metadata: {
          stage: state.currentStage,
          source,
        },
      });
      result.escalated += 1;
    }

    if (!reminderDue && !escalationDue) {
      result.skipped += 1;
    }
  }

  try {
    const marketing = await runMarketingAutomationSweep();
    result.marketingSequenceSent = marketing.sequenceRemindersSent;
    result.marketingBlastSent = marketing.blastRecipientsSent;
    result.marketingBlastFailed = marketing.blastRecipientsFailed;
    result.marketingBlastSkipped = marketing.blastRecipientsSkipped;
  } catch {
    // keep abandonment sweep stable if marketing automation fails
  }

  return result;
}
