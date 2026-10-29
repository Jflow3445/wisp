import crypto from "node:crypto";
import {
  MarketEnrollmentStatus,
  MarketingBlastCampaignStatus,
  MarketingBlastRecipientStatus,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
  UserTradeState,
} from "@prisma/client";
import { notifyUser } from "@/lib/notifications";
import { buildMarketingEmail } from "@/lib/email-template";
import { getUserOnboardingState, onboardingRoutes } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { getPublicAppBaseUrl } from "@/lib/public-url";

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

export type MarketingSequenceStage =
  | "verified_not_progressing"
  | "plan_selected_no_checkout"
  | "checkout_pending_approval"
  | "payment_approved_not_activated"
  | "waitlist_conversion";

export type MarketingBlastAudienceCategory =
  | "verified_users"
  | "verified_non_subscribed"
  | "waitlist_users"
  | "active_subscribers";

export type MarketingSequenceTemplateView = {
  id: string;
  stage: MarketingSequenceStage;
  enabled: boolean;
  subject: string;
  body: string;
  ctaLabel: string | null;
  ctaPath: string | null;
  ctaHref: string | null;
  cadenceMinutesJson: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MarketingBlastScheduleConfigView = {
  id: number;
  smallAudienceThreshold: number;
  smallAudienceWindowMinHrs: number;
  smallAudienceWindowMaxHrs: number;
  largeAudienceWindowMinDays: number;
  largeAudienceWindowMaxDays: number;
  createdAt: Date;
  updatedAt: Date;
};

export type MarketingBlastCampaignView = {
  id: string;
  audienceCategory: MarketingBlastAudienceCategory | string;
  audienceCount: number;
  subject: string;
  body: string;
  ctaLabel: string | null;
  ctaPath: string | null;
  ctaHref: string | null;
  status: MarketingBlastCampaignStatus;
  onlyVerified: boolean;
  windowStartAt: Date;
  windowEndAt: Date;
  scheduleSource: string;
  startedAt: Date | null;
  completedAt: Date | null;
  totalRecipients: number;
  sentRecipients: number;
  failedRecipients: number;
  pendingRecipients: number;
  skippedRecipients: number;
  completedRecipients: number;
  completionRatio: number;
  createdByAdminId: string;
  createdAt: Date;
  updatedAt: Date;
  creator?: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export type MarketingAudienceCountView = Record<MarketingBlastAudienceCategory, number>;

export type MarketingBlastRecipientStatusFilter = MarketingBlastRecipientStatus | "ALL";

export type MarketingBlastCampaignControlAction = "pause" | "resume" | "stop";

export type MarketingBlastRecipientView = {
  id: string;
  campaignId: string;
  userId: string;
  scheduledFor: Date;
  status: MarketingBlastRecipientStatus;
  sentAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    emailVerifiedAt: Date | null;
  };
};

export type MarketingBlastCampaignRecipientsPage = {
  campaign: MarketingBlastCampaignView;
  recipients: MarketingBlastRecipientView[];
  filter: MarketingBlastRecipientStatusFilter;
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
};

type BlastRecipientSummary = {
  totalRecipients: number;
  sentRecipients: number;
  failedRecipients: number;
  pendingRecipients: number;
  skippedRecipients: number;
  completedRecipients: number;
  completionRatio: number;
};

type SequenceDefinition = {
  stage: MarketingSequenceStage;
  label: string;
  summary: string;
  defaultSubject: string;
  defaultBody: string;
  defaultCtaPath: string;
  defaultCadenceMinutes: number[];
};

type SequenceTemplateMap = Record<MarketingSequenceStage, MarketingSequenceTemplateView>;

const SEQUENCE_DEFINITIONS: SequenceDefinition[] = [
  {
    stage: "verified_not_progressing",
    label: "Verified, not progressing",
    summary: "Users who verified their email but have not moved forward in onboarding.",
    defaultSubject: "You're one decision away from activation",
    defaultBody:
      "You're one decision away. Continue from your exact checkpoint and choose the plan that fits your account setup.",
    defaultCtaPath: onboardingRoutes.checkpoint,
    defaultCadenceMinutes: [120, 1440, 4320],
  },
  {
    stage: "plan_selected_no_checkout",
    label: "Plan selected, no checkout",
    summary: "Users who picked a plan but never entered checkout.",
    defaultSubject: "Plan selected. Finish checkout to lock activation",
    defaultBody:
      "Your plan selection is saved. Finish checkout to move to activation. If you want help before paying, contact support and we will walk you through the payment and safety checks.",
    defaultCtaPath: onboardingRoutes.checkout,
    defaultCadenceMinutes: [60, 1440, 4320],
  },
  {
    stage: "checkout_pending_approval",
    label: "Checkout pending approval",
    summary: "Users who submitted checkout and are waiting for payment review.",
    defaultSubject: "Payment review in progress",
    defaultBody:
      "Your payment submission is queued for review. We will update your account as soon as verification clears. Keep your dashboard open for status updates.",
    defaultCtaPath: "/dashboard#payments",
    defaultCadenceMinutes: [0, 360, 1440],
  },
  {
    stage: "payment_approved_not_activated",
    label: "Payment approved, not activated",
    summary: "Users whose payment cleared but who have not completed activation.",
    defaultSubject: "Payment approved. Complete your final activation step",
    defaultBody:
      "Your payment is approved. Your next action is {{next_route}}. Complete that step to move your account live.",
    defaultCtaPath: onboardingRoutes.checkpoint,
    defaultCadenceMinutes: [10, 1440, 4320],
  },
  {
    stage: "waitlist_conversion",
    label: "Waitlist conversion",
    summary: "Waitlist users ready for progress and launch nudges.",
    defaultSubject: "Waitlist status update",
    defaultBody:
      "Your waitlist status is now {{phase}}. Continue from your checkpoint so your account is ready for activation as soon as the market is available.",
    defaultCtaPath: onboardingRoutes.checkpoint,
    defaultCadenceMinutes: [1440, 10080],
  },
];

const SEQUENCE_BY_STAGE = Object.fromEntries(
  SEQUENCE_DEFINITIONS.map((definition) => [definition.stage, definition]),
) as Record<MarketingSequenceStage, SequenceDefinition>;

const SEQUENCE_STAGES = SEQUENCE_DEFINITIONS.map((definition) => definition.stage);

export const MARKETING_SEQUENCE_STAGES: Array<{
  stage: MarketingSequenceStage;
  label: string;
  summary: string;
}> = SEQUENCE_DEFINITIONS.map((definition) => ({
  stage: definition.stage,
  label: definition.label,
  summary: definition.summary,
}));

export const MARKETING_BLAST_AUDIENCE_CATEGORIES: Array<{
  category: MarketingBlastAudienceCategory;
  label: string;
  summary: string;
}> = [
  {
    category: "verified_users",
    label: "Verified users",
    summary: "All users with a verified email address.",
  },
  {
    category: "verified_non_subscribed",
    label: "Verified non-subscribed",
    summary: "Verified users without an active subscription.",
  },
  {
    category: "waitlist_users",
    label: "Waitlist users",
    summary: "Verified users currently enrolled in a waitlist state.",
  },
  {
    category: "active_subscribers",
    label: "Active subscribers",
    summary: "Verified users with an active, unexpired subscription.",
  },
];

export const DEFAULT_MARKETING_BLAST_SCHEDULE_CONFIG: MarketingBlastScheduleConfigView = {
  id: 1,
  smallAudienceThreshold: 500,
  smallAudienceWindowMinHrs: 48,
  smallAudienceWindowMaxHrs: 72,
  largeAudienceWindowMinDays: 7,
  largeAudienceWindowMaxDays: 28,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const BLAST_SWEEP_MAX_RECIPIENTS_PER_RUN = (() => {
  const raw = Number(process.env.MARKETING_BLAST_SWEEP_MAX_PER_RUN || "8");
  if (!Number.isFinite(raw)) {
    return 8;
  }
  return Math.max(1, Math.min(200, Math.trunc(raw)));
})();

const BLAST_SWEEP_MAX_RECIPIENTS_PER_CAMPAIGN_PER_RUN = (() => {
  const raw = Number(process.env.MARKETING_BLAST_SWEEP_MAX_PER_CAMPAIGN_PER_RUN || "2");
  if (!Number.isFinite(raw)) {
    return 2;
  }
  return Math.max(1, Math.min(50, Math.trunc(raw)));
})();

const BLAST_SWEEP_TARGET_RUNS_PER_HOUR = (() => {
  const raw = Number(process.env.MARKETING_BLAST_SWEEP_TARGET_RUNS_PER_HOUR || "4");
  if (!Number.isFinite(raw)) {
    return 4;
  }
  return Math.max(1, Math.min(120, Math.trunc(raw)));
})();

const BLAST_SWEEP_DYNAMIC_MAX_RECIPIENTS_PER_RUN = (() => {
  const raw = Number(process.env.MARKETING_BLAST_SWEEP_DYNAMIC_MAX_PER_RUN || "400");
  if (!Number.isFinite(raw)) {
    return 400;
  }
  return Math.max(BLAST_SWEEP_MAX_RECIPIENTS_PER_RUN, Math.min(2000, Math.trunc(raw)));
})();

const BLAST_SWEEP_DYNAMIC_MAX_RECIPIENTS_PER_CAMPAIGN_PER_RUN = (() => {
  const raw = Number(process.env.MARKETING_BLAST_SWEEP_DYNAMIC_MAX_PER_CAMPAIGN_PER_RUN || "120");
  if (!Number.isFinite(raw)) {
    return 120;
  }
  return Math.max(BLAST_SWEEP_MAX_RECIPIENTS_PER_CAMPAIGN_PER_RUN, Math.min(500, Math.trunc(raw)));
})();

const BLAST_SWEEP_PREFETCH_CAP = (() => {
  const raw = Number(process.env.MARKETING_BLAST_SWEEP_PREFETCH_CAP || "2000");
  if (!Number.isFinite(raw)) {
    return 2000;
  }
  return Math.max(200, Math.min(5000, Math.trunc(raw)));
})();

const BLAST_AUDIENCE_FETCH_CHUNK = 2000;
const BLAST_RECIPIENT_INSERT_CHUNK = 1000;

const WAITLIST_AUDIENCE_STATUSES = [
  MarketEnrollmentStatus.WAITLIST_PENDING,
  MarketEnrollmentStatus.WAITLIST,
  MarketEnrollmentStatus.WAITLIST_PREPAID,
  MarketEnrollmentStatus.RELEASED,
] as const;

export type MarketingAutomationSweepResult = {
  sequenceRemindersSent: number;
  blastRecipientsSent: number;
  blastRecipientsFailed: number;
  blastRecipientsSkipped: number;
};

function isSubscriptionActive(status: SubscriptionStatus | null | undefined, expiresAt: Date | null | undefined) {
  if (status !== SubscriptionStatus.ACTIVE) {
    return false;
  }
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

export function toBlastRecipientSummary(input: {
  totalRecipients: number;
  sentRecipients: number;
  failedRecipients: number;
  pendingRecipients?: number | null;
  skippedRecipients?: number | null;
}): BlastRecipientSummary {
  const totalRecipients = Math.max(0, Math.trunc(input.totalRecipients));
  const sentRecipients = Math.max(0, Math.trunc(input.sentRecipients));
  const failedRecipients = Math.max(0, Math.trunc(input.failedRecipients));
  const skippedRecipients = Math.max(0, Math.trunc(input.skippedRecipients ?? 0));
  const computedPending = totalRecipients - sentRecipients - failedRecipients - skippedRecipients;
  const pendingRecipients = Math.max(0, Math.trunc(input.pendingRecipients ?? computedPending));
  const completedRecipients = sentRecipients + failedRecipients + skippedRecipients;
  const completionRatio = totalRecipients > 0 ? Math.min(1, completedRecipients / totalRecipients) : 1;
  return {
    totalRecipients,
    sentRecipients,
    failedRecipients,
    pendingRecipients,
    skippedRecipients,
    completedRecipients,
    completionRatio,
  };
}

export function coerceMarketingBlastRecipientStatusFilter(
  value: string | null | undefined,
): MarketingBlastRecipientStatusFilter {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized || normalized === "ALL") {
    return "ALL";
  }
  if (normalized === MarketingBlastRecipientStatus.PENDING) {
    return MarketingBlastRecipientStatus.PENDING;
  }
  if (normalized === MarketingBlastRecipientStatus.SENT) {
    return MarketingBlastRecipientStatus.SENT;
  }
  if (normalized === MarketingBlastRecipientStatus.FAILED) {
    return MarketingBlastRecipientStatus.FAILED;
  }
  if (normalized === MarketingBlastRecipientStatus.SKIPPED) {
    return MarketingBlastRecipientStatus.SKIPPED;
  }
  return "ALL";
}

export function coerceMarketingPageNumber(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(1, Math.trunc(parsed));
}

function safeJsonArrayToIntList(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const parsed = value
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(0, Math.trunc(item)))
    .filter((item) => item <= 24 * 60 * 90);
  if (!parsed.length) {
    return [...fallback];
  }
  const unique: number[] = [];
  for (const entry of parsed) {
    if (!unique.includes(entry)) {
      unique.push(entry);
    }
  }
  return unique;
}

function renderTemplate(raw: string, tokens: Record<string, string>) {
  return raw.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, group: string) => {
    const key = String(group || "").trim().toLowerCase();
    return tokens[key] ?? "";
  });
}

function deriveFirstName(name: string | null | undefined, email: string | null | undefined) {
  const cleanName = (name || "").trim().replace(/\s+/g, " ");
  if (cleanName.length) {
    return cleanName.split(" ")[0] || cleanName;
  }
  const localPart = (email || "").split("@")[0]?.trim() || "";
  if (localPart.length) {
    const normalized = localPart.replace(/[._-]+/g, " ").trim();
    if (normalized.length) {
      return normalized.split(" ")[0] || normalized;
    }
  }
  return "there";
}

function toAbsoluteCtaUrl(rawTarget: string) {
  const target = String(rawTarget || "").trim();
  if (!target.length) {
    return `${getPublicAppBaseUrl()}/dashboard`;
  }
  if (/^https?:\/\//i.test(target)) {
    return target;
  }
  const normalizedPath = target.startsWith("/") ? target : `/${target}`;
  return `${getPublicAppBaseUrl()}${normalizedPath}`;
}

function randomIntInclusive(min: number, max: number) {
  const safeMin = Math.trunc(Math.min(min, max));
  const safeMax = Math.trunc(Math.max(min, max));
  if (safeMin === safeMax) {
    return safeMin;
  }
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

function shuffledUserIds(userIds: string[]) {
  const copy = [...userIds];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIntInclusive(0, index);
    const tmp = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = tmp;
  }
  return copy;
}

export function buildBlastDripScheduleMs(input: {
  userIds: string[];
  startMs: number;
  endMs: number;
}) {
  const total = input.userIds.length;
  if (total === 0) {
    return [] as Array<{ userId: string; scheduledAtMs: number }>;
  }
  const startMs = Math.trunc(Math.min(input.startMs, input.endMs));
  const endMs = Math.trunc(Math.max(input.startMs, input.endMs));
  const spanMs = Math.max(0, endMs - startMs);
  const ids = shuffledUserIds(input.userIds);
  let lastScheduledMs = startMs - 1;

  const rows: Array<{ userId: string; scheduledAtMs: number }> = [];
  for (let index = 0; index < ids.length; index += 1) {
    const slotStart = startMs + Math.floor((spanMs * index) / total);
    const slotEndExclusive = startMs + Math.floor((spanMs * (index + 1)) / total);
    const slotEnd = index === ids.length - 1 ? endMs : Math.max(slotStart, slotEndExclusive - 1);
    const candidate = randomIntInclusive(slotStart, slotEnd);
    const scheduledAtMs = Math.min(endMs, Math.max(candidate, lastScheduledMs + 1));
    rows.push({
      userId: ids[index],
      scheduledAtMs,
    });
    lastScheduledMs = scheduledAtMs;
  }
  return rows;
}

type BlastDispatchCandidate = {
  id: string;
  campaignId: string;
};

type BlastCampaignDispatchTargetInput = {
  pendingCount: number;
  dueCount: number;
  now: Date;
  windowEndAt: Date;
  basePerCampaign: number;
  targetRunsPerHour: number;
  maxPerCampaign: number;
};

export function resolveMarketingBlastCampaignStatusForControl(input: {
  currentStatus: MarketingBlastCampaignStatus;
  action: MarketingBlastCampaignControlAction;
  startedAt?: Date | null;
}) {
  const startedAt = input.startedAt ?? null;
  if (input.action === "pause") {
    if (
      input.currentStatus !== MarketingBlastCampaignStatus.RUNNING &&
      input.currentStatus !== MarketingBlastCampaignStatus.SCHEDULED
    ) {
      throw new Error("Only scheduled or running campaigns can be paused.");
    }
    return MarketingBlastCampaignStatus.PAUSED;
  }

  if (input.action === "resume") {
    if (input.currentStatus !== MarketingBlastCampaignStatus.PAUSED) {
      throw new Error("Only paused campaigns can be resumed.");
    }
    return startedAt ? MarketingBlastCampaignStatus.RUNNING : MarketingBlastCampaignStatus.SCHEDULED;
  }

  if (input.currentStatus === MarketingBlastCampaignStatus.CANCELLED) {
    throw new Error("This campaign is already cancelled.");
  }
  if (input.currentStatus === MarketingBlastCampaignStatus.COMPLETED) {
    throw new Error("Completed campaigns cannot be stopped.");
  }
  return MarketingBlastCampaignStatus.CANCELLED;
}

export function resolveBlastCampaignDispatchTarget(input: BlastCampaignDispatchTargetInput) {
  const pendingCount = Math.max(0, Math.trunc(input.pendingCount));
  const dueCount = Math.max(0, Math.trunc(input.dueCount));
  const basePerCampaign = Math.max(1, Math.trunc(input.basePerCampaign));
  const maxPerCampaign = Math.max(basePerCampaign, Math.trunc(input.maxPerCampaign));
  const targetRunsPerHour = Math.max(1, Math.trunc(input.targetRunsPerHour));

  if (pendingCount === 0 || dueCount === 0) {
    return basePerCampaign;
  }

  const remainingMs = Math.max(0, input.windowEndAt.getTime() - input.now.getTime());
  const remainingHours = remainingMs / (60 * 60 * 1000);
  const remainingRuns = Math.max(1, Math.ceil(remainingHours * targetRunsPerHour));
  const pendingCatchUpPerRun = Math.ceil(pendingCount / remainingRuns);
  const dueBacklogDrainPerRun = Math.ceil(dueCount / Math.min(3, remainingRuns));
  const target = Math.max(basePerCampaign, pendingCatchUpPerRun, dueBacklogDrainPerRun);
  return Math.max(basePerCampaign, Math.min(maxPerCampaign, target));
}

export function selectBlastDispatchBatch<T extends BlastDispatchCandidate>(
  rows: T[],
  limits: {
    maxTotal: number;
    maxPerCampaign: number;
    perCampaignMax?: ReadonlyMap<string, number>;
  },
) {
  const maxTotal = Math.max(1, Math.trunc(limits.maxTotal));
  const maxPerCampaign = Math.max(1, Math.trunc(limits.maxPerCampaign));
  const selected: T[] = [];
  const byCampaign = new Map<string, number>();
  for (const row of rows) {
    if (selected.length >= maxTotal) {
      break;
    }
    const campaignCount = byCampaign.get(row.campaignId) || 0;
    const campaignCap = Math.max(1, Math.trunc(limits.perCampaignMax?.get(row.campaignId) || maxPerCampaign));
    if (campaignCount >= campaignCap) {
      continue;
    }
    selected.push(row);
    byCampaign.set(row.campaignId, campaignCount + 1);
  }
  return selected;
}

function makeSystemVisitorId() {
  return `sys_${crypto.randomBytes(10).toString("hex")}`;
}

async function captureMarketingEvent(input: {
  userId: string;
  eventName: string;
  pagePath: string;
  metadata?: Prisma.JsonValue;
}) {
  try {
    const metadataJson =
      typeof input.metadata === "undefined"
        ? undefined
        : input.metadata === null
          ? Prisma.DbNull
          : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue);
    await prisma.conversionEvent.create({
      data: {
        userId: input.userId,
        visitorId: makeSystemVisitorId(),
        sessionId: null,
        eventName: input.eventName.slice(0, 80),
        pagePath: input.pagePath.slice(0, 191),
        referrer: "internal:marketing-automation",
        metadataJson,
      },
    });
  } catch {
    // best-effort only
  }
}

function resolveDueAttempt(input: {
  triggerAt: Date;
  cadenceMinutes: number[];
  sentAttempts: Set<number>;
  now: Date;
  attemptBase?: number;
}) {
  const base = input.attemptBase ?? 0;
  for (let index = 0; index < input.cadenceMinutes.length; index += 1) {
    const attempt = base + index + 1;
    if (input.sentAttempts.has(attempt)) {
      continue;
    }
    const dueAt = new Date(input.triggerAt.getTime() + input.cadenceMinutes[index] * 60_000);
    if (dueAt.getTime() <= input.now.getTime()) {
      return attempt;
    }
  }
  return null;
}

async function latestEventMap(eventNames: string[], userIds?: string[]) {
  if (!eventNames.length) {
    return new Map<string, Date>();
  }
  const where: Prisma.ConversionEventWhereInput = {
    eventName: { in: eventNames },
    userId: userIds?.length ? { in: userIds } : { not: null },
  };
  const rows = await prisma.conversionEvent.groupBy({
    by: ["userId"],
    where,
    _max: {
      createdAt: true,
    },
  });
  const result = new Map<string, Date>();
  for (const row of rows) {
    if (!row.userId || !row._max.createdAt) {
      continue;
    }
    result.set(row.userId, row._max.createdAt);
  }
  return result;
}

async function getSequenceDispatchMap(stage: MarketingSequenceStage, userIds: string[]) {
  if (!userIds.length) {
    return new Map<string, Set<number>>();
  }
  const rows = await prisma.marketingSequenceDispatch.findMany({
    where: {
      stage,
      userId: { in: userIds },
    },
    select: {
      userId: true,
      attempt: true,
    },
  });
  const result = new Map<string, Set<number>>();
  for (const row of rows) {
    const existing = result.get(row.userId) || new Set<number>();
    existing.add(row.attempt);
    result.set(row.userId, existing);
  }
  return result;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: string }).code || "") === "P2002"
  );
}

async function markSequenceDispatch(input: {
  userId: string;
  stage: MarketingSequenceStage;
  attempt: number;
  metadata?: Prisma.JsonValue;
}) {
  try {
    await prisma.marketingSequenceDispatch.create({
      data: {
        userId: input.userId,
        stage: input.stage,
        attempt: input.attempt,
        metadataJson:
          typeof input.metadata === "undefined"
            ? undefined
            : input.metadata === null
              ? Prisma.DbNull
              : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue),
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false;
    }
    throw error;
  }
}

async function sendSequenceReminder(input: {
  userId: string;
  stage: MarketingSequenceStage;
  attempt: number;
  template: MarketingSequenceTemplateView;
  tokens?: Record<string, string>;
}) {
  const definition = SEQUENCE_BY_STAGE[input.stage];
  const recipient = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      name: true,
      email: true,
    },
  });
  const ctaHref = (input.template.ctaHref || "").trim() || null;
  const ctaPath = (input.template.ctaPath || "").trim() || definition.defaultCtaPath;
  const inAppPath = ctaPath.startsWith("/") ? ctaPath : definition.defaultCtaPath;
  const actionTarget = ctaHref || inAppPath;
  const ctaUrl = toAbsoluteCtaUrl(actionTarget);
  const tokens = {
    next_route: onboardingRoutes.checkpoint,
    phase: "progress",
    first_name: deriveFirstName(recipient?.name, recipient?.email),
    cta_url: ctaUrl,
    ...(input.tokens || {}),
  };
  const subject =
    renderTemplate(input.template.subject || definition.defaultSubject, tokens).trim() || definition.defaultSubject;
  const body = renderTemplate(input.template.body || definition.defaultBody, tokens).trim() || definition.defaultBody;

  await notifyUser(input.userId, {
    title: subject,
    message: body,
    href: inAppPath,
    email: {
      rendered: buildMarketingEmail({
        recipientName: recipient?.name,
        subject,
        body,
        ctaLabel: input.template.ctaLabel || "Continue",
        ctaUrl,
      }),
    },
  });

  await markSequenceDispatch({
    userId: input.userId,
    stage: input.stage,
    attempt: input.attempt,
    metadata: {
      cta_path: inAppPath,
      cta_href: ctaHref,
    },
  });

  await captureMarketingEvent({
    userId: input.userId,
    eventName: "marketing_sequence_email_sent",
    pagePath: inAppPath,
    metadata: {
      stage: input.stage,
      attempt: input.attempt,
    },
  });
}

async function buildTemplateMap(): Promise<SequenceTemplateMap> {
  await ensureMarketingSequenceTemplates();
  const rows = await prisma.marketingSequenceTemplate.findMany({
    where: {
      stage: { in: SEQUENCE_STAGES },
    },
  });
  const mapped: Partial<SequenceTemplateMap> = {};
  for (const row of rows) {
    const stage = row.stage as MarketingSequenceStage;
    if (!SEQUENCE_STAGES.includes(stage)) {
      continue;
    }
    mapped[stage] = {
      ...row,
      stage,
      cadenceMinutesJson: row.cadenceMinutesJson as Prisma.JsonValue | null,
    };
  }
  for (const definition of SEQUENCE_DEFINITIONS) {
    if (!mapped[definition.stage]) {
      mapped[definition.stage] = {
        id: `default_${definition.stage}`,
        stage: definition.stage,
        enabled: true,
        subject: definition.defaultSubject,
        body: definition.defaultBody,
        ctaLabel: null,
        ctaPath: definition.defaultCtaPath,
        ctaHref: null,
        cadenceMinutesJson: definition.defaultCadenceMinutes,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
    }
  }
  return mapped as SequenceTemplateMap;
}

async function runVerifiedNotProgressingSweep(now: Date, templates: SequenceTemplateMap) {
  const template = templates.verified_not_progressing;
  if (!template.enabled) {
    return 0;
  }
  const triggerMap = await latestEventMap(["onboarding_email_verified"]);
  const userIds = Array.from(triggerMap.keys());
  if (!userIds.length) {
    return 0;
  }
  const stopMap = await latestEventMap(
    ["onboarding_plan_selected", "onboarding_checkout_submitted", "onboarding_waitlist_prepay_submitted"],
    userIds,
  );
  const verified = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      emailVerifiedAt: { not: null },
    },
    select: { id: true },
  });
  const verifiedIds = verified.map((user) => user.id);
  const dispatchMap = await getSequenceDispatchMap("verified_not_progressing", verifiedIds);
  const cadence = safeJsonArrayToIntList(
    template.cadenceMinutesJson,
    SEQUENCE_BY_STAGE.verified_not_progressing.defaultCadenceMinutes,
  );

  let sent = 0;
  for (const userId of verifiedIds) {
    const triggerAt = triggerMap.get(userId);
    if (!triggerAt) {
      continue;
    }
    const stopAt = stopMap.get(userId);
    if (stopAt && stopAt.getTime() >= triggerAt.getTime()) {
      continue;
    }
    const attempt = resolveDueAttempt({
      triggerAt,
      cadenceMinutes: cadence,
      sentAttempts: dispatchMap.get(userId) || new Set<number>(),
      now,
    });
    if (!attempt) {
      continue;
    }
    await sendSequenceReminder({
      userId,
      stage: "verified_not_progressing",
      attempt,
      template,
    });
    sent += 1;
  }
  return sent;
}

async function runPlanSelectedNoCheckoutSweep(now: Date, templates: SequenceTemplateMap) {
  const template = templates.plan_selected_no_checkout;
  if (!template.enabled) {
    return 0;
  }
  const triggerMap = await latestEventMap(["onboarding_plan_selected"]);
  const userIds = Array.from(triggerMap.keys());
  if (!userIds.length) {
    return 0;
  }
  const stopMap = await latestEventMap(
    ["onboarding_checkout_submitted", "onboarding_waitlist_prepay_submitted"],
    userIds,
  );
  const verified = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      emailVerifiedAt: { not: null },
    },
    select: { id: true },
  });
  const verifiedIds = verified.map((user) => user.id);
  const dispatchMap = await getSequenceDispatchMap("plan_selected_no_checkout", verifiedIds);
  const cadence = safeJsonArrayToIntList(template.cadenceMinutesJson, SEQUENCE_BY_STAGE.plan_selected_no_checkout.defaultCadenceMinutes);

  let sent = 0;
  for (const userId of verifiedIds) {
    const triggerAt = triggerMap.get(userId);
    if (!triggerAt) {
      continue;
    }
    const stopAt = stopMap.get(userId);
    if (stopAt && stopAt.getTime() >= triggerAt.getTime()) {
      continue;
    }
    const attempt = resolveDueAttempt({
      triggerAt,
      cadenceMinutes: cadence,
      sentAttempts: dispatchMap.get(userId) || new Set<number>(),
      now,
    });
    if (!attempt) {
      continue;
    }
    await sendSequenceReminder({
      userId,
      stage: "plan_selected_no_checkout",
      attempt,
      template,
    });
    sent += 1;
  }
  return sent;
}

async function runCheckoutPendingApprovalSweep(now: Date, templates: SequenceTemplateMap) {
  const template = templates.checkout_pending_approval;
  if (!template.enabled) {
    return 0;
  }
  const triggerMap = await latestEventMap(["onboarding_checkout_submitted"]);
  const userIds = Array.from(triggerMap.keys());
  if (!userIds.length) {
    return 0;
  }
  const verified = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      emailVerifiedAt: { not: null },
    },
    select: { id: true },
  });
  const verifiedIds = verified.map((user) => user.id);
  const dispatchMap = await getSequenceDispatchMap("checkout_pending_approval", verifiedIds);
  const cadence = safeJsonArrayToIntList(
    template.cadenceMinutesJson,
    SEQUENCE_BY_STAGE.checkout_pending_approval.defaultCadenceMinutes,
  );
  const reviewRows = await prisma.paymentSubmission.findMany({
    where: {
      userId: { in: verifiedIds },
      status: { in: [PaymentStatus.APPROVED, PaymentStatus.REJECTED] },
    },
    select: {
      userId: true,
      reviewedAt: true,
      submittedAt: true,
    },
  });
  const reviewStopMap = new Map<string, Date>();
  for (const row of reviewRows) {
    const stopAt = row.reviewedAt || row.submittedAt;
    const existing = reviewStopMap.get(row.userId);
    if (!existing || stopAt.getTime() > existing.getTime()) {
      reviewStopMap.set(row.userId, stopAt);
    }
  }

  let sent = 0;
  for (const userId of verifiedIds) {
    const triggerAt = triggerMap.get(userId);
    if (!triggerAt) {
      continue;
    }
    const stopAt = reviewStopMap.get(userId);
    if (stopAt && stopAt.getTime() >= triggerAt.getTime()) {
      continue;
    }
    const attempt = resolveDueAttempt({
      triggerAt,
      cadenceMinutes: cadence,
      sentAttempts: dispatchMap.get(userId) || new Set<number>(),
      now,
    });
    if (!attempt) {
      continue;
    }
    await sendSequenceReminder({
      userId,
      stage: "checkout_pending_approval",
      attempt,
      template,
    });
    sent += 1;
  }
  return sent;
}

async function runPaymentApprovedNotActivatedSweep(now: Date, templates: SequenceTemplateMap) {
  const template = templates.payment_approved_not_activated;
  if (!template.enabled) {
    return 0;
  }
  const triggerMap = await latestEventMap(["payment_approved"]);
  const userIds = Array.from(triggerMap.keys());
  if (!userIds.length) {
    return 0;
  }
  const completionMap = await latestEventMap(["onboarding_completed"], userIds);
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      emailVerifiedAt: { not: null },
    },
    select: {
      id: true,
      tradingProfile: {
        select: {
          tradeState: true,
          autotradeEnabled: true,
        },
      },
    },
  });
  const dispatchMap = await getSequenceDispatchMap(
    "payment_approved_not_activated",
    users.map((user) => user.id),
  );
  const cadence = safeJsonArrayToIntList(
    template.cadenceMinutesJson,
    SEQUENCE_BY_STAGE.payment_approved_not_activated.defaultCadenceMinutes,
  );

  let sent = 0;
  for (const user of users) {
    const triggerAt = triggerMap.get(user.id);
    if (!triggerAt) {
      continue;
    }
    const stopAt = completionMap.get(user.id);
    const isLive =
      user.tradingProfile?.tradeState === UserTradeState.LIVE && Boolean(user.tradingProfile.autotradeEnabled);
    if ((stopAt && stopAt.getTime() >= triggerAt.getTime()) || isLive) {
      continue;
    }
    const attempt = resolveDueAttempt({
      triggerAt,
      cadenceMinutes: cadence,
      sentAttempts: dispatchMap.get(user.id) || new Set<number>(),
      now,
    });
    if (!attempt) {
      continue;
    }
    let nextRoute: string = onboardingRoutes.checkpoint;
    try {
      const onboarding = await getUserOnboardingState(user.id);
      nextRoute = onboarding.nextRoute;
    } catch {
      // keep fallback route
    }
    await sendSequenceReminder({
      userId: user.id,
      stage: "payment_approved_not_activated",
      attempt,
      template,
      tokens: {
        next_route: nextRoute,
      },
    });
    sent += 1;
  }
  return sent;
}

async function runWaitlistConversionSweep(now: Date, templates: SequenceTemplateMap) {
  const template = templates.waitlist_conversion;
  if (!template.enabled) {
    return 0;
  }
  const rows = await prisma.marketEnrollment.findMany({
    where: {
      status: {
        in: [
          MarketEnrollmentStatus.WAITLIST_PENDING,
          MarketEnrollmentStatus.WAITLIST,
          MarketEnrollmentStatus.WAITLIST_PREPAID,
          MarketEnrollmentStatus.RELEASED,
          MarketEnrollmentStatus.ACTIVE,
        ],
      },
      user: {
        emailVerifiedAt: { not: null },
      },
    },
    select: {
      userId: true,
      status: true,
      joinedAt: true,
      launchEmailSentAt: true,
      unlockedAt: true,
      updatedAt: true,
      user: {
        select: {
          subscription: {
            select: {
              status: true,
              expiresAt: true,
            },
          },
        },
      },
    },
  });
  if (!rows.length) {
    return 0;
  }
  const userIds = Array.from(new Set(rows.map((row) => row.userId)));
  const dispatchMap = await getSequenceDispatchMap("waitlist_conversion", userIds);

  let sent = 0;
  for (const row of rows) {
    const subscription = row.user.subscription;
    if (isSubscriptionActive(subscription?.status, subscription?.expiresAt)) {
      continue;
    }

    let phase: "progress" | "launch" = "progress";
    let triggerAt = row.joinedAt;
    let attemptBase = 0;
    let fallbackCadence = SEQUENCE_BY_STAGE.waitlist_conversion.defaultCadenceMinutes;

    const isLaunchPhase =
      row.status === MarketEnrollmentStatus.RELEASED ||
      row.status === MarketEnrollmentStatus.ACTIVE ||
      Boolean(row.launchEmailSentAt) ||
      Boolean(row.unlockedAt);

    if (isLaunchPhase) {
      phase = "launch";
      triggerAt = row.launchEmailSentAt || row.unlockedAt || row.updatedAt;
      attemptBase = 100;
      fallbackCadence = [0, 1440];
    }

    const cadence = safeJsonArrayToIntList(template.cadenceMinutesJson, fallbackCadence);
    const attempt = resolveDueAttempt({
      triggerAt,
      cadenceMinutes: cadence,
      sentAttempts: dispatchMap.get(row.userId) || new Set<number>(),
      now,
      attemptBase,
    });
    if (!attempt) {
      continue;
    }

    await sendSequenceReminder({
      userId: row.userId,
      stage: "waitlist_conversion",
      attempt,
      template,
      tokens: {
        phase,
      },
    });
    sent += 1;
  }
  return sent;
}

async function runSequenceSweeps(now: Date, templates: SequenceTemplateMap) {
  const [a, b, c, d, e] = await Promise.all([
    runVerifiedNotProgressingSweep(now, templates),
    runPlanSelectedNoCheckoutSweep(now, templates),
    runCheckoutPendingApprovalSweep(now, templates),
    runPaymentApprovedNotActivatedSweep(now, templates),
    runWaitlistConversionSweep(now, templates),
  ]);
  return a + b + c + d + e;
}

async function updateBlastCampaignAggregate(campaignId: string, now: Date) {
  const grouped = await prisma.marketingBlastRecipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  let pending = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of grouped) {
    if (row.status === MarketingBlastRecipientStatus.PENDING) pending += row._count._all;
    if (row.status === MarketingBlastRecipientStatus.SENT) sent += row._count._all;
    if (row.status === MarketingBlastRecipientStatus.FAILED) failed += row._count._all;
    if (row.status === MarketingBlastRecipientStatus.SKIPPED) skipped += row._count._all;
  }
  const total = pending + sent + failed + skipped;
  const status =
    pending === 0
      ? MarketingBlastCampaignStatus.COMPLETED
      : sent + failed + skipped > 0
        ? MarketingBlastCampaignStatus.RUNNING
        : MarketingBlastCampaignStatus.SCHEDULED;
  await prisma.marketingBlastCampaign.update({
    where: { id: campaignId },
    data: {
      status,
      startedAt: status !== MarketingBlastCampaignStatus.SCHEDULED ? now : null,
      completedAt: status === MarketingBlastCampaignStatus.COMPLETED ? now : null,
      totalRecipients: total,
      sentRecipients: sent,
      failedRecipients: failed,
    },
  });
}

async function runBlastDispatchSweep(now: Date) {
  const blastCampaignWhere = {
    status: { in: [MarketingBlastCampaignStatus.SCHEDULED, MarketingBlastCampaignStatus.RUNNING] },
  } satisfies Prisma.MarketingBlastCampaignWhereInput;

  const dueCounts = await prisma.marketingBlastRecipient.groupBy({
    by: ["campaignId"],
    where: {
      status: MarketingBlastRecipientStatus.PENDING,
      scheduledFor: { lte: now },
      campaign: blastCampaignWhere,
    },
    _count: { _all: true },
  });

  if (!dueCounts.length) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const campaignIds = dueCounts.map((row) => row.campaignId);
  const [pendingCounts, campaigns] = await Promise.all([
    prisma.marketingBlastRecipient.groupBy({
      by: ["campaignId"],
      where: {
        campaignId: { in: campaignIds },
        status: MarketingBlastRecipientStatus.PENDING,
      },
      _count: { _all: true },
    }),
    prisma.marketingBlastCampaign.findMany({
      where: {
        id: { in: campaignIds },
        ...blastCampaignWhere,
      },
      select: {
        id: true,
        windowEndAt: true,
      },
    }),
  ]);

  const pendingByCampaign = new Map<string, number>();
  for (const row of pendingCounts) {
    pendingByCampaign.set(row.campaignId, row._count._all);
  }

  const campaignWindowById = new Map<string, Date>();
  for (const row of campaigns) {
    campaignWindowById.set(row.id, row.windowEndAt);
  }

  const perCampaignDispatchMax = new Map<string, number>();
  let targetTotal = BLAST_SWEEP_MAX_RECIPIENTS_PER_RUN;
  for (const row of dueCounts) {
    const pendingCount = pendingByCampaign.get(row.campaignId) || row._count._all;
    const maxPerCampaign = resolveBlastCampaignDispatchTarget({
      pendingCount,
      dueCount: row._count._all,
      now,
      windowEndAt: campaignWindowById.get(row.campaignId) || now,
      basePerCampaign: BLAST_SWEEP_MAX_RECIPIENTS_PER_CAMPAIGN_PER_RUN,
      targetRunsPerHour: BLAST_SWEEP_TARGET_RUNS_PER_HOUR,
      maxPerCampaign: BLAST_SWEEP_DYNAMIC_MAX_RECIPIENTS_PER_CAMPAIGN_PER_RUN,
    });
    perCampaignDispatchMax.set(row.campaignId, maxPerCampaign);
    targetTotal += maxPerCampaign;
  }

  const maxTotal = Math.max(
    BLAST_SWEEP_MAX_RECIPIENTS_PER_RUN,
    Math.min(BLAST_SWEEP_DYNAMIC_MAX_RECIPIENTS_PER_RUN, targetTotal),
  );
  const prefetchTarget = Math.min(BLAST_SWEEP_PREFETCH_CAP, Math.max(maxTotal, maxTotal * 4));

  const dueCandidates = await prisma.marketingBlastRecipient.findMany({
    where: {
      status: MarketingBlastRecipientStatus.PENDING,
      scheduledFor: { lte: now },
      campaign: blastCampaignWhere,
    },
    orderBy: [{ scheduledFor: "asc" }],
    take: prefetchTarget,
    include: {
      campaign: true,
      user: {
        select: {
          id: true,
          emailVerifiedAt: true,
          name: true,
          email: true,
        },
      },
    },
  });
  const due = selectBlastDispatchBatch(dueCandidates, {
    maxTotal,
    maxPerCampaign: BLAST_SWEEP_MAX_RECIPIENTS_PER_CAMPAIGN_PER_RUN,
    perCampaignMax: perCampaignDispatchMax,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const touchedCampaignIds = new Set<string>();

  for (const recipient of due) {
    touchedCampaignIds.add(recipient.campaignId);
    const campaign = recipient.campaign;
    if (campaign.onlyVerified && !recipient.user.emailVerifiedAt) {
      await prisma.marketingBlastRecipient.update({
        where: { id: recipient.id },
        data: {
          status: MarketingBlastRecipientStatus.SKIPPED,
        },
      });
      skipped += 1;
      continue;
    }

    try {
      const ctaHref = (campaign.ctaHref || "").trim() || null;
      const ctaPath = (campaign.ctaPath || "").trim() || null;
      const inAppPath = ctaPath && ctaPath.startsWith("/") ? ctaPath : "/dashboard";
      const actionTarget = ctaHref || inAppPath;
      const ctaUrl = toAbsoluteCtaUrl(actionTarget);
      const tokens = {
        first_name: deriveFirstName(recipient.user.name, recipient.user.email),
        cta_url: ctaUrl,
      };
      const subject = renderTemplate(campaign.subject, tokens).trim() || campaign.subject;
      const body = renderTemplate(campaign.body, tokens).trim() || campaign.body;

      await notifyUser(recipient.userId, {
        title: subject,
        message: body,
        href: inAppPath,
        email: {
          rendered: buildMarketingEmail({
            recipientName: recipient.user.name,
            subject,
            body,
            ctaLabel: campaign.ctaLabel || "Continue",
            ctaUrl,
          }),
        },
      });

      await prisma.marketingBlastRecipient.update({
        where: { id: recipient.id },
        data: {
          status: MarketingBlastRecipientStatus.SENT,
          sentAt: now,
        },
      });
      await captureMarketingEvent({
        userId: recipient.userId,
        eventName: "marketing_blast_email_sent",
        pagePath: inAppPath,
        metadata: {
          campaign_id: campaign.id,
          audience_category: campaign.audienceCategory,
        },
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 180) : "unknown delivery error";
      await prisma.marketingBlastRecipient.update({
        where: { id: recipient.id },
        data: {
          status: MarketingBlastRecipientStatus.FAILED,
          lastError: message,
        },
      });
      failed += 1;
    }
  }

  for (const campaignId of touchedCampaignIds) {
    await updateBlastCampaignAggregate(campaignId, now);
  }

  return { sent, failed, skipped };
}

function blastActiveSubscriptionFilter(now: Date): Prisma.SubscriptionWhereInput {
  return {
    status: SubscriptionStatus.ACTIVE,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

function blastAudienceUserWhere(audienceCategory: MarketingBlastAudienceCategory, now: Date): Prisma.UserWhereInput {
  if (audienceCategory === "verified_users") {
    return {
      emailVerifiedAt: { not: null },
    };
  }

  if (audienceCategory === "active_subscribers") {
    return {
      emailVerifiedAt: { not: null },
      subscription: {
        is: blastActiveSubscriptionFilter(now),
      },
    };
  }

  if (audienceCategory === "waitlist_users") {
    return {
      emailVerifiedAt: { not: null },
      marketEnrollments: {
        some: {
          status: {
            in: [...WAITLIST_AUDIENCE_STATUSES],
          },
        },
      },
    };
  }

  return {
    emailVerifiedAt: { not: null },
    OR: [
      {
        subscription: {
          is: null,
        },
      },
      {
        subscription: {
          is: {
            status: {
              not: SubscriptionStatus.ACTIVE,
            },
          },
        },
      },
      {
        subscription: {
          is: {
            status: SubscriptionStatus.ACTIVE,
            expiresAt: {
              lte: now,
            },
          },
        },
      },
    ],
  };
}

function randomIntFromSeedInclusive(min: number, max: number, seed: string) {
  const safeMin = Math.trunc(Math.min(min, max));
  const safeMax = Math.trunc(Math.max(min, max));
  if (safeMin === safeMax) {
    return safeMin;
  }
  const digest = crypto.createHash("sha256").update(seed).digest();
  const value = digest.readUInt32BE(0) / 0xffffffff;
  return safeMin + Math.floor(value * (safeMax - safeMin + 1));
}

function scheduleMsForRecipient(input: {
  userId: string;
  campaignId: string;
  index: number;
  totalRecipients: number;
  startMs: number;
  endMs: number;
  lastScheduledMs: number;
}) {
  const slotStart = input.startMs + Math.floor(((input.endMs - input.startMs) * input.index) / input.totalRecipients);
  const slotEndExclusive =
    input.startMs + Math.floor(((input.endMs - input.startMs) * (input.index + 1)) / input.totalRecipients);
  const slotEnd = input.index === input.totalRecipients - 1 ? input.endMs : Math.max(slotStart, slotEndExclusive - 1);
  const candidate = randomIntFromSeedInclusive(slotStart, slotEnd, `${input.campaignId}:${input.userId}:${input.index}`);
  return Math.min(input.endMs, Math.max(candidate, input.lastScheduledMs + 1));
}

async function createBlastRecipientsForAudience(input: {
  campaignId: string;
  audienceCategory: MarketingBlastAudienceCategory;
  totalRecipients: number;
  startMs: number;
  endMs: number;
}) {
  if (input.totalRecipients <= 0) {
    return 0;
  }

  const where = blastAudienceUserWhere(input.audienceCategory, new Date());
  let cursorId: string | null = null;
  let index = 0;
  let created = 0;
  let lastScheduledMs = input.startMs - 1;
  let pendingRows: Array<{ campaignId: string; userId: string; scheduledFor: Date }> = [];

  while (index < input.totalRecipients) {
    const rows: Array<{ id: string }> = await prisma.user.findMany({
      where,
      orderBy: [{ id: "asc" }],
      select: { id: true },
      ...(cursorId
        ? {
            cursor: { id: cursorId },
            skip: 1,
          }
        : {}),
      take: BLAST_AUDIENCE_FETCH_CHUNK,
    });

    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      const scheduledAtMs = scheduleMsForRecipient({
        userId: row.id,
        campaignId: input.campaignId,
        index,
        totalRecipients: input.totalRecipients,
        startMs: input.startMs,
        endMs: input.endMs,
        lastScheduledMs,
      });

      pendingRows.push({
        campaignId: input.campaignId,
        userId: row.id,
        scheduledFor: new Date(scheduledAtMs),
      });
      index += 1;
      lastScheduledMs = scheduledAtMs;

      if (pendingRows.length >= BLAST_RECIPIENT_INSERT_CHUNK) {
        await prisma.marketingBlastRecipient.createMany({
          data: pendingRows,
        });
        created += pendingRows.length;
        pendingRows = [];
      }
    }

    cursorId = rows[rows.length - 1]?.id || null;
  }

  if (pendingRows.length) {
    await prisma.marketingBlastRecipient.createMany({
      data: pendingRows,
    });
    created += pendingRows.length;
  }

  return created;
}

export async function ensureMarketingSequenceTemplates() {
  if (!hasDatabaseConfig) {
    return;
  }
  for (const definition of SEQUENCE_DEFINITIONS) {
    await prisma.marketingSequenceTemplate.upsert({
      where: { stage: definition.stage },
      update: {},
      create: {
        stage: definition.stage,
        enabled: true,
        subject: definition.defaultSubject,
        body: definition.defaultBody,
        ctaLabel: "Continue",
        ctaPath: definition.defaultCtaPath,
        ctaHref: null,
        cadenceMinutesJson: definition.defaultCadenceMinutes,
      },
    });
  }
}

export async function getMarketingAudienceCounts(): Promise<MarketingAudienceCountView> {
  if (!hasDatabaseConfig) {
    return {
      verified_users: 0,
      verified_non_subscribed: 0,
      waitlist_users: 0,
      active_subscribers: 0,
    };
  }
  const now = new Date();
  const [verifiedUsers, waitlistUsers, activeSubscribers] = await Promise.all([
    prisma.user.count({
      where: {
        emailVerifiedAt: { not: null },
      },
    }),
    prisma.user.count({
      where: {
        emailVerifiedAt: { not: null },
        marketEnrollments: {
          some: {
            status: {
              in: [...WAITLIST_AUDIENCE_STATUSES],
            },
          },
        },
      },
    }),
    prisma.subscription.count({
      where: {
        status: SubscriptionStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        user: {
          emailVerifiedAt: { not: null },
        },
      },
    }),
  ]);
  const verifiedNonSubscribed = Math.max(0, verifiedUsers - activeSubscribers);
  return {
    verified_users: verifiedUsers,
    verified_non_subscribed: verifiedNonSubscribed,
    waitlist_users: waitlistUsers,
    active_subscribers: activeSubscribers,
  };
}

export async function getMarketingSequenceTemplates(): Promise<Array<MarketingSequenceTemplateView | null>> {
  if (!hasDatabaseConfig) {
    return MARKETING_SEQUENCE_STAGES.map(() => null);
  }
  await ensureMarketingSequenceTemplates();
  const templates = await prisma.marketingSequenceTemplate.findMany({
    where: {
      stage: { in: SEQUENCE_STAGES },
    },
  });
  const byStage = new Map<string, MarketingSequenceTemplateView>();
  for (const template of templates) {
    byStage.set(template.stage, {
      ...template,
      stage: template.stage as MarketingSequenceStage,
      cadenceMinutesJson: template.cadenceMinutesJson as Prisma.JsonValue | null,
    });
  }
  return MARKETING_SEQUENCE_STAGES.map((entry) => byStage.get(entry.stage) || null);
}

export async function getMarketingBlastScheduleConfig(): Promise<MarketingBlastScheduleConfigView> {
  if (!hasDatabaseConfig) {
    return DEFAULT_MARKETING_BLAST_SCHEDULE_CONFIG;
  }
  const row = await prisma.marketingBlastScheduleConfig.findUnique({
    where: { id: 1 },
  });
  if (!row) {
    return DEFAULT_MARKETING_BLAST_SCHEDULE_CONFIG;
  }
  return row;
}

export async function getMarketingBlastCampaigns(limit = 12): Promise<MarketingBlastCampaignView[]> {
  if (!hasDatabaseConfig) {
    return [];
  }
  const rows = await prisma.marketingBlastCampaign.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(1, Math.min(50, Math.trunc(limit))),
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
  if (!rows.length) {
    return [];
  }

  const grouped = await prisma.marketingBlastRecipient.groupBy({
    by: ["campaignId", "status"],
    where: {
      campaignId: {
        in: rows.map((row) => row.id),
      },
    },
    _count: {
      _all: true,
    },
  });

  const statusCountByCampaignId = new Map<
    string,
    {
      pendingRecipients: number;
      sentRecipients: number;
      failedRecipients: number;
      skippedRecipients: number;
    }
  >();

  for (const row of grouped) {
    const current = statusCountByCampaignId.get(row.campaignId) || {
      pendingRecipients: 0,
      sentRecipients: 0,
      failedRecipients: 0,
      skippedRecipients: 0,
    };
    if (row.status === MarketingBlastRecipientStatus.PENDING) {
      current.pendingRecipients += row._count._all;
    }
    if (row.status === MarketingBlastRecipientStatus.SENT) {
      current.sentRecipients += row._count._all;
    }
    if (row.status === MarketingBlastRecipientStatus.FAILED) {
      current.failedRecipients += row._count._all;
    }
    if (row.status === MarketingBlastRecipientStatus.SKIPPED) {
      current.skippedRecipients += row._count._all;
    }
    statusCountByCampaignId.set(row.campaignId, current);
  }

  return rows.map((row) => {
    const statusCounts = statusCountByCampaignId.get(row.id);
    const summary = toBlastRecipientSummary({
      totalRecipients: statusCounts
        ? statusCounts.pendingRecipients +
          statusCounts.sentRecipients +
          statusCounts.failedRecipients +
          statusCounts.skippedRecipients
        : row.totalRecipients,
      sentRecipients: statusCounts ? statusCounts.sentRecipients : row.sentRecipients,
      failedRecipients: statusCounts ? statusCounts.failedRecipients : row.failedRecipients,
      pendingRecipients: statusCounts?.pendingRecipients ?? null,
      skippedRecipients: statusCounts?.skippedRecipients ?? null,
    });
    return {
      ...row,
      ...summary,
    };
  });
}

export async function getMarketingBlastCampaignRecipientsPage(input: {
  campaignId: string;
  filter?: MarketingBlastRecipientStatusFilter | string | null;
  page?: number;
  pageSize?: number;
}): Promise<MarketingBlastCampaignRecipientsPage | null> {
  if (!hasDatabaseConfig) {
    return null;
  }

  const campaignId = String(input.campaignId || "").trim();
  if (!campaignId.length) {
    return null;
  }

  const page = coerceMarketingPageNumber(input.page);
  const pageSize = Math.max(10, Math.min(500, Math.trunc(input.pageSize ?? 100)));
  const filter = coerceMarketingBlastRecipientStatusFilter(
    typeof input.filter === "string" ? input.filter : String(input.filter || ""),
  );

  const campaignRow = await prisma.marketingBlastCampaign.findUnique({
    where: { id: campaignId },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
  if (!campaignRow) {
    return null;
  }

  const grouped = await prisma.marketingBlastRecipient.groupBy({
    by: ["status"],
    where: {
      campaignId,
    },
    _count: {
      _all: true,
    },
  });

  let pendingRecipients = 0;
  let sentRecipients = 0;
  let failedRecipients = 0;
  let skippedRecipients = 0;
  for (const row of grouped) {
    if (row.status === MarketingBlastRecipientStatus.PENDING) pendingRecipients += row._count._all;
    if (row.status === MarketingBlastRecipientStatus.SENT) sentRecipients += row._count._all;
    if (row.status === MarketingBlastRecipientStatus.FAILED) failedRecipients += row._count._all;
    if (row.status === MarketingBlastRecipientStatus.SKIPPED) skippedRecipients += row._count._all;
  }

  const campaignSummary = toBlastRecipientSummary({
    totalRecipients: pendingRecipients + sentRecipients + failedRecipients + skippedRecipients,
    sentRecipients,
    failedRecipients,
    pendingRecipients,
    skippedRecipients,
  });

  const baseWhere: Prisma.MarketingBlastRecipientWhereInput = {
    campaignId,
  };
  const where: Prisma.MarketingBlastRecipientWhereInput =
    filter === "ALL" ? baseWhere : { ...baseWhere, status: filter };

  const totalRows = await prisma.marketingBlastRecipient.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const boundedPage = Math.min(page, totalPages);
  const skip = (boundedPage - 1) * pageSize;
  const rows = await prisma.marketingBlastRecipient.findMany({
    where,
    orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
    skip,
    take: pageSize,
    select: {
      id: true,
      campaignId: true,
      userId: true,
      scheduledFor: true,
      status: true,
      sentAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerifiedAt: true,
        },
      },
    },
  });

  return {
    campaign: {
      ...campaignRow,
      ...campaignSummary,
    },
    recipients: rows,
    filter,
    page: boundedPage,
    pageSize,
    totalRows,
    totalPages,
  };
}

export function resolveMarketingBlastWindow(input: {
  audienceCount: number;
  config: MarketingBlastScheduleConfigView;
  override?: {
    minHours: number;
    maxHours: number;
  } | null;
}) {
  const fallback =
    input.audienceCount < input.config.smallAudienceThreshold
      ? {
          minHours: input.config.smallAudienceWindowMinHrs,
          maxHours: input.config.smallAudienceWindowMaxHrs,
          source: "default_small_audience",
        }
      : {
          minHours: input.config.largeAudienceWindowMinDays * 24,
          maxHours: input.config.largeAudienceWindowMaxDays * 24,
          source: "default_large_audience",
        };
  const resolved = input.override
    ? {
        minHours: input.override.minHours,
        maxHours: input.override.maxHours,
        source: "admin_override",
      }
    : fallback;
  const minHours = Math.max(1, Math.trunc(Math.min(resolved.minHours, resolved.maxHours)));
  const maxHours = Math.max(minHours, Math.trunc(Math.max(resolved.minHours, resolved.maxHours)));
  return {
    windowStartAt: new Date(Date.now() + minHours * 60 * 60 * 1000),
    windowEndAt: new Date(Date.now() + maxHours * 60 * 60 * 1000),
    minHours,
    maxHours,
    source: resolved.source,
  };
}

export async function scheduleMarketingBlastCampaign(input: {
  createdByAdminId: string;
  audienceCategory: MarketingBlastAudienceCategory;
  subject: string;
  body: string;
  ctaLabel?: string | null;
  ctaPath?: string | null;
  ctaHref?: string | null;
  overrideWindow?: {
    minHours: number;
    maxHours: number;
  } | null;
}) {
  if (!hasDatabaseConfig) {
    throw new Error("Database is not configured.");
  }

  const now = new Date();
  const [scheduleConfig, audienceCount] = await Promise.all([
    getMarketingBlastScheduleConfig(),
    prisma.user.count({
      where: blastAudienceUserWhere(input.audienceCategory, now),
    }),
  ]);
  const window = resolveMarketingBlastWindow({
    audienceCount,
    config: scheduleConfig,
    override: input.overrideWindow || null,
  });

  const campaign = await prisma.marketingBlastCampaign.create({
    data: {
      audienceCategory: input.audienceCategory,
      audienceCount,
      subject: input.subject,
      body: input.body,
      ctaLabel: input.ctaLabel?.trim() || null,
      ctaPath: input.ctaPath?.trim() || null,
      ctaHref: input.ctaHref?.trim() || null,
      status: audienceCount ? MarketingBlastCampaignStatus.SCHEDULED : MarketingBlastCampaignStatus.COMPLETED,
      onlyVerified: true,
      windowStartAt: window.windowStartAt,
      windowEndAt: window.windowEndAt,
      scheduleSource: window.source,
      startedAt: null,
      completedAt: audienceCount ? null : now,
      totalRecipients: audienceCount,
      sentRecipients: 0,
      failedRecipients: 0,
      createdByAdminId: input.createdByAdminId,
    },
  });

  if (audienceCount) {
    const startMs = window.windowStartAt.getTime();
    const endMs = Math.max(startMs, window.windowEndAt.getTime());
    const createdCount = await createBlastRecipientsForAudience({
      campaignId: campaign.id,
      audienceCategory: input.audienceCategory,
      totalRecipients: audienceCount,
      startMs,
      endMs,
    });
    if (createdCount !== audienceCount) {
      await prisma.marketingBlastCampaign.update({
        where: { id: campaign.id },
        data: {
          totalRecipients: createdCount,
          status: createdCount ? MarketingBlastCampaignStatus.SCHEDULED : MarketingBlastCampaignStatus.COMPLETED,
          completedAt: createdCount ? null : now,
        },
      });
    }
  }

  return campaign;
}

export async function runMarketingAutomationSweep(): Promise<MarketingAutomationSweepResult> {
  if (!hasDatabaseConfig) {
    return {
      sequenceRemindersSent: 0,
      blastRecipientsSent: 0,
      blastRecipientsFailed: 0,
      blastRecipientsSkipped: 0,
    };
  }

  const now = new Date();
  const templates = await buildTemplateMap();
  const sequenceRemindersSent = await runSequenceSweeps(now, templates);
  const blastResult = await runBlastDispatchSweep(now);

  return {
    sequenceRemindersSent,
    blastRecipientsSent: blastResult.sent,
    blastRecipientsFailed: blastResult.failed,
    blastRecipientsSkipped: blastResult.skipped,
  };
}

export function marketingBlastAudienceLabel(category: MarketingBlastAudienceCategory | string) {
  return MARKETING_BLAST_AUDIENCE_CATEGORIES.find((item) => item.category === category)?.label || category;
}

export function marketingSequenceStageLabel(stage: MarketingSequenceStage | string) {
  return MARKETING_SEQUENCE_STAGES.find((item) => item.stage === stage)?.label || stage;
}
