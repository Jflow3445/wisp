import crypto from "node:crypto";
import { AutomationMarket, MarketEnrollmentStatus, WaitlistLaunchEmailStatus } from "@prisma/client";
import { writeAudit } from "@/lib/control-plane";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { automationMarketLabel, isWaitlistEnrollmentStatus } from "@/lib/market-access";

const QUEUE_MIN_MINUTES = 5;
const QUEUE_MAX_MINUTES = 120;
const RETRY_DELAY_MINUTES = 30;
const MAX_SEND_ATTEMPTS = 5;

function randomQueueDelayMinutes() {
  return crypto.randomInt(QUEUE_MIN_MINUTES, QUEUE_MAX_MINUTES + 1);
}

export async function ensureMarketEnrollment(input: {
  userId: string;
  market: AutomationMarket;
  planId?: string | null;
  status?: MarketEnrollmentStatus;
  annualPrepaySelected?: boolean;
}) {
  return prisma.marketEnrollment.upsert({
    where: {
      userId_market: {
        userId: input.userId,
        market: input.market,
      },
    },
    update: {
      planId: input.planId ?? undefined,
      status: input.status ?? undefined,
      annualPrepaySelected:
        typeof input.annualPrepaySelected === "boolean" ? input.annualPrepaySelected : undefined,
    },
    create: {
      userId: input.userId,
      market: input.market,
      planId: input.planId ?? null,
      status: input.status ?? MarketEnrollmentStatus.WAITLIST_PENDING,
      annualPrepaySelected: Boolean(input.annualPrepaySelected),
    },
  });
}

export async function scheduleWaitlistLaunchEmailsForMarket(input: {
  market: AutomationMarket;
  actorId: string;
}) {
  if (input.market !== AutomationMarket.FOREX) return { market: input.market, unlocked: 0, queued: 0, skipped: 0 };
  const now = new Date();
  const enrollments = await prisma.marketEnrollment.findMany({
    where: {
      market: input.market,
      status: {
        in: [
          MarketEnrollmentStatus.WAITLIST_PENDING,
          MarketEnrollmentStatus.WAITLIST,
          MarketEnrollmentStatus.WAITLIST_PREPAID,
        ],
      },
    },
    orderBy: [{ joinedAt: "asc" }],
    select: {
      id: true,
      userId: true,
      status: true,
      launchEmailSentAt: true,
    },
  });

  if (!enrollments.length) {
    return {
      market: input.market,
      unlocked: 0,
      queued: 0,
      skipped: 0,
    };
  }

  let unlockCount = 0;
  let queued = 0;
  let skipped = 0;
  let scheduleCursor = now.getTime();

  await prisma.$transaction(async (tx) => {
    for (const enrollment of enrollments) {
      const nextStatus =
        enrollment.status === MarketEnrollmentStatus.WAITLIST_PREPAID
          ? MarketEnrollmentStatus.ACTIVE
          : MarketEnrollmentStatus.RELEASED;

      await tx.marketEnrollment.update({
        where: { id: enrollment.id },
        data: {
          status: nextStatus,
          unlockedAt: now,
        },
      });
      unlockCount += 1;

      if (enrollment.launchEmailSentAt) {
        skipped += 1;
        continue;
      }

      scheduleCursor += randomQueueDelayMinutes() * 60_000;
      const scheduledFor = new Date(scheduleCursor);

      await tx.waitlistLaunchEmail.upsert({
        where: {
          enrollmentId: enrollment.id,
        },
        update: {
          userId: enrollment.userId,
          market: input.market,
          status: WaitlistLaunchEmailStatus.PENDING,
          scheduledFor,
          sentAt: null,
          attempts: 0,
          lastError: null,
        },
        create: {
          enrollmentId: enrollment.id,
          userId: enrollment.userId,
          market: input.market,
          status: WaitlistLaunchEmailStatus.PENDING,
          scheduledFor,
        },
      });
      await tx.marketEnrollment.update({
        where: { id: enrollment.id },
        data: {
          launchEmailQueuedAt: now,
        },
      });
      queued += 1;
    }
  });

  await writeAudit({
    actorType: "ADMIN",
    actorId: input.actorId,
    eventType: "WAITLIST_LAUNCH_EMAILS_QUEUED",
    entityType: "WAITLIST_MARKET",
    entityId: input.market,
    metadata: {
      market: input.market,
      unlocked: unlockCount,
      queued,
      skipped,
      queued_at: now.toISOString(),
    },
  });

  return {
    market: input.market,
    unlocked: unlockCount,
    queued,
    skipped,
  };
}

export async function runWaitlistLaunchEmailSweep(source: "manual" | "internal", limit = 1) {
  const now = new Date();
  const jobs = await prisma.waitlistLaunchEmail.findMany({
    where: {
      market: AutomationMarket.FOREX,
      status: WaitlistLaunchEmailStatus.PENDING,
      scheduledFor: {
        lte: now,
      },
      enrollment: {
        status: {
          in: [MarketEnrollmentStatus.RELEASED, MarketEnrollmentStatus.ACTIVE],
        },
      },
      user: {
        emailVerifiedAt: {
          not: null,
        },
      },
    },
    include: {
      enrollment: {
        select: {
          id: true,
          status: true,
          market: true,
          annualPrepayPaidAt: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [{ scheduledFor: "asc" }],
    take: Math.max(1, Math.min(20, Math.trunc(limit))),
  });

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const marketName = automationMarketLabel(job.market);
      const paymentNote =
        job.enrollment.status === MarketEnrollmentStatus.ACTIVE || Boolean(job.enrollment.annualPrepayPaidAt)
          ? "Your annual prepay is already credited."
          : "Complete subscription checkout to activate your account.";

      await notifyUser(job.userId, {
        title: `${marketName} automation is now available`,
        message: `${marketName} automation has moved from waitlist to open access. ${paymentNote}`,
        href: "/dashboard/billing",
        email: {
          subject: `${marketName} automation is now live on Nister AI`,
          text:
            `Hi ${job.user.name},\n\n` +
            `${marketName} automation is now available.\n` +
            `${paymentNote}\n\n` +
            `Open your dashboard: https://nisterai.com/dashboard/billing\n\n` +
            `Nister AI`,
        },
      });

      await prisma.$transaction([
        prisma.waitlistLaunchEmail.update({
          where: { id: job.id },
          data: {
            status: WaitlistLaunchEmailStatus.SENT,
            sentAt: now,
            attempts: { increment: 1 },
            lastError: null,
          },
        }),
        prisma.marketEnrollment.update({
          where: { id: job.enrollmentId },
          data: {
            launchEmailSentAt: now,
          },
        }),
      ]);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 180) : "Unknown waitlist send error";
      const attempts = job.attempts + 1;
      await prisma.waitlistLaunchEmail.update({
        where: { id: job.id },
        data: {
          attempts,
          status: attempts >= MAX_SEND_ATTEMPTS ? WaitlistLaunchEmailStatus.FAILED : WaitlistLaunchEmailStatus.PENDING,
          scheduledFor:
            attempts >= MAX_SEND_ATTEMPTS
              ? job.scheduledFor
              : new Date(Date.now() + RETRY_DELAY_MINUTES * 60_000),
          lastError: message,
        },
      });
      failed += 1;
    }
  }

  await writeAudit({
    actorType: "SYSTEM",
    actorId: `waitlist-launch-sweep:${source}`,
    eventType: "WAITLIST_LAUNCH_SWEEP_COMPLETED",
    entityType: "WAITLIST",
    entityId: "GLOBAL",
    metadata: {
      source,
      scanned: jobs.length,
      sent,
      failed,
      ran_at: now.toISOString(),
    },
  });

  return {
    scanned: jobs.length,
    sent,
    failed,
  };
}

export function waitlistEnrollmentBlocksAutomation(status: MarketEnrollmentStatus | null | undefined) {
  if (!status) {
    return false;
  }
  return isWaitlistEnrollmentStatus(status);
}
