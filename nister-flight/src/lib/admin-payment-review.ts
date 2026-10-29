import {
  AutomationMarket,
  InvoiceAmountReservationStatus,
  MarketEnrollmentStatus,
  PaymentOrderStatus,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reconcileUserSubscriptionLifecycle } from "@/lib/subscription-lifecycle";
import { creditUserAvailableFunds } from "@/lib/wallet-funds";

const MICROS_PER_CENT = BigInt(10_000);

export type PaymentManualReviewResolution = "APPROVED" | "REJECTED" | "RETRY" | "RESOLVED";
export type NormalizedPaymentManualReviewResolution = "APPROVED" | "REJECTED" | "RETRY";
export type ManualReviewResolvedAmounts = {
  submissionAmountUsdCents: number;
  effectiveAmountUsdCents: number;
  finalAmountUsdCents: number;
  addonChargeUsdCents: number;
  oneTimeAddonChargeUsdCents: number;
  creditedUsdCents: number;
  annualPrepayAmountUsdCents: number;
};

type PaymentAddonMetadata = {
  slug: string;
  name: string;
  billing: "ONE_TIME" | "RECURRING";
  priceUsdCents: number;
};

type PaymentOrderMetadata = {
  paymentMethodId?: string | null;
  planSlug?: string | null;
  amountUsdCents?: number | null;
  planPriceUsdCents?: number | null;
  discountUsdCents?: number | null;
  addonChargeUsdCents?: number | null;
  finalAmountUsdCents?: number | null;
  addons: PaymentAddonMetadata[];
  referralCodeUsed?: string | null;
  visitorId?: string | null;
  experimentKey?: string | null;
  experimentVariant?: string | null;
  note?: string | null;
  market?: string | null;
  waitlistPrepayAnnual?: boolean;
};

function toSafeString(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : null;
}

function toSafeInt(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.trunc(parsed));
}

function toSafeBool(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function toAutomationMarket(value: string | null | undefined): AutomationMarket | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === AutomationMarket.FOREX) return AutomationMarket.FOREX;
  if (normalized === AutomationMarket.STOCKS) return AutomationMarket.STOCKS;
  if (normalized === AutomationMarket.OPTIONS) return AutomationMarket.OPTIONS;
  return null;
}

function normalizeTxHash(raw: unknown) {
  return String(raw || "").trim().toLowerCase();
}

function isValidTxHash(raw: unknown) {
  return /^[a-f0-9]{64}$/.test(normalizeTxHash(raw));
}

function microsToCentsFloor(micros: bigint) {
  const safe = micros < BigInt(0) ? BigInt(0) : micros;
  return Number(safe / MICROS_PER_CENT);
}

export function normalizeManualReviewResolution(
  resolution: PaymentManualReviewResolution,
): NormalizedPaymentManualReviewResolution {
  return resolution === "RESOLVED" ? "APPROVED" : resolution;
}

export function formatManualReviewResolution(
  resolution: NormalizedPaymentManualReviewResolution,
  note?: string | null,
) {
  const base = resolution === "RETRY" ? "retry_allowed" : resolution.toLowerCase();
  const cleanNote = String(note || "").trim();
  return cleanNote ? `${base}: ${cleanNote}`.slice(0, 191) : base;
}

export function resolveManualReviewSubmissionOutcome(
  resolution: PaymentManualReviewResolution,
  note?: string | null,
) {
  const normalizedResolution = normalizeManualReviewResolution(resolution);
  return {
    normalizedResolution,
    status:
      normalizedResolution === "APPROVED"
        ? PaymentStatus.APPROVED
        : PaymentStatus.REJECTED,
    reviewNote: formatManualReviewResolution(normalizedResolution, note),
  };
}

export function resolveManualReviewTransition(resolution: PaymentManualReviewResolution) {
  const normalizedResolution = normalizeManualReviewResolution(resolution);
  if (normalizedResolution === "APPROVED") {
    return {
      normalizedResolution,
      reviewResolution: "approved",
      orderStatus: PaymentOrderStatus.PAID,
      manualReviewReason: null,
      reservationStatus: InvoiceAmountReservationStatus.CONSUMED,
      shouldFulfill: true,
    };
  }
  if (normalizedResolution === "REJECTED") {
    return {
      normalizedResolution,
      reviewResolution: "rejected",
      orderStatus: PaymentOrderStatus.CANCELLED,
      manualReviewReason: "admin_rejected",
      reservationStatus: InvoiceAmountReservationStatus.RELEASED,
      shouldFulfill: false,
    };
  }
  return {
    normalizedResolution,
    reviewResolution: "retry_allowed",
    orderStatus: PaymentOrderStatus.PENDING,
    manualReviewReason: null,
    reservationStatus: null,
    shouldFulfill: false,
  };
}

export function extractManualReviewTxHash(input: {
  submissions: Array<{ submittedTxHash: string | null }>;
  detailsJson: unknown;
}) {
  for (const submission of input.submissions) {
    const txHash = normalizeTxHash(submission.submittedTxHash);
    if (isValidTxHash(txHash)) {
      return txHash;
    }
  }

  if (!input.detailsJson || typeof input.detailsJson !== "object" || Array.isArray(input.detailsJson)) {
    return null;
  }

  const details = input.detailsJson as Record<string, unknown>;
  for (const key of ["tx_hash", "txHash", "transaction_hash", "submitted_tx_hash"]) {
    const txHash = normalizeTxHash(details[key]);
    if (isValidTxHash(txHash)) {
      return txHash;
    }
  }
  return null;
}

export function extractManualReviewEvidence(input: {
  submissions: Array<{
    submittedTxHash: string | null;
    submittedSenderAddress?: string | null;
  }>;
  detailsJson: unknown;
  declaredSenderAddress?: string | null;
}) {
  const txHash = extractManualReviewTxHash({
    submissions: input.submissions.map((submission) => ({
      submittedTxHash: submission.submittedTxHash,
    })),
    detailsJson: input.detailsJson,
  });
  const submittedSenderAddress =
    input.submissions
      .map((submission) => toSafeString(submission.submittedSenderAddress, 128))
      .find((value) => Boolean(value)) || null;

  let detailsSenderAddress: string | null = null;
  if (input.detailsJson && typeof input.detailsJson === "object" && !Array.isArray(input.detailsJson)) {
    const details = input.detailsJson as Record<string, unknown>;
    for (const key of [
      "submitted_sender_address",
      "submittedSenderAddress",
      "sender_address",
      "senderAddress",
      "sender",
      "declared_sender",
      "declaredSenderAddress",
      "onchain_sender",
      "onchainSender",
      "from_address",
      "fromAddress",
    ]) {
      detailsSenderAddress = toSafeString(details[key], 128);
      if (detailsSenderAddress) {
        break;
      }
    }
  }

  return {
    txHash,
    senderAddress:
      submittedSenderAddress ||
      detailsSenderAddress ||
      toSafeString(input.declaredSenderAddress, 128),
  };
}

function parsePaymentOrderMetadata(value: Prisma.JsonValue | null | undefined): PaymentOrderMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { addons: [] };
  }

  const row = value as Record<string, unknown>;
  const addons = (Array.isArray(row.addons) ? row.addons : [])
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const entry = item as Record<string, unknown>;
      const slug = toSafeString(entry.slug, 80);
      const name = toSafeString(entry.name, 120);
      const billing = String(entry.billing || "").trim().toUpperCase() === "RECURRING" ? "RECURRING" : "ONE_TIME";
      const priceUsdCents = toSafeInt(entry.priceUsdCents) || 0;
      if (!slug || !name || priceUsdCents <= 0) {
        return null;
      }
      return { slug, name, billing, priceUsdCents };
    })
    .filter((item): item is PaymentAddonMetadata => Boolean(item));

  return {
    paymentMethodId: toSafeString(row.paymentMethodId, 191),
    planSlug: toSafeString(row.planSlug, 80),
    amountUsdCents: toSafeInt(row.amountUsdCents),
    planPriceUsdCents: toSafeInt(row.planPriceUsdCents),
    discountUsdCents: toSafeInt(row.discountUsdCents),
    addonChargeUsdCents: toSafeInt(row.addonChargeUsdCents),
    finalAmountUsdCents: toSafeInt(row.finalAmountUsdCents),
    addons,
    referralCodeUsed: toSafeString(row.referralCodeUsed, 80),
    visitorId: toSafeString(row.visitorId, 120),
    experimentKey: toSafeString(row.experimentKey, 80),
    experimentVariant: toSafeString(row.experimentVariant, 80),
    note: toSafeString(row.note, 191),
    market: toSafeString(row.market, 24),
    waitlistPrepayAnnual: toSafeBool(row.waitlistPrepayAnnual),
  };
}

export function computeManualReviewCreditCents(input: {
  invoiceAmountMicros: bigint;
  metadata: Prisma.JsonValue | null | undefined;
}) {
  return computeManualReviewResolvedAmounts(input).creditedUsdCents;
}

export function computeManualReviewResolvedAmounts(input: {
  invoiceAmountMicros: bigint;
  metadata: Prisma.JsonValue | null | undefined;
}): ManualReviewResolvedAmounts {
  const metadata = parsePaymentOrderMetadata(input.metadata);
  const effectiveAmountUsdCents = Math.max(
    0,
    metadata.finalAmountUsdCents ?? metadata.amountUsdCents ?? microsToCentsFloor(input.invoiceAmountMicros),
  );
  const addonChargeUsdCents = Math.max(
    0,
    metadata.addonChargeUsdCents ??
      metadata.addons.reduce((sum, addon) => sum + Math.max(0, addon.priceUsdCents), 0),
  );
  const oneTimeAddonChargeUsdCents = metadata.addons
    .filter((addon) => addon.billing === "ONE_TIME")
    .reduce((sum, addon) => sum + Math.max(0, addon.priceUsdCents), 0);
  const creditedUsdCents = Math.max(0, effectiveAmountUsdCents - oneTimeAddonChargeUsdCents);

  return {
    submissionAmountUsdCents: Math.max(0, metadata.amountUsdCents ?? effectiveAmountUsdCents),
    effectiveAmountUsdCents,
    finalAmountUsdCents: effectiveAmountUsdCents,
    addonChargeUsdCents,
    oneTimeAddonChargeUsdCents,
    creditedUsdCents,
    annualPrepayAmountUsdCents: effectiveAmountUsdCents,
  };
}

async function resolvePaymentMethodId(input: {
  existingSubmissionPaymentMethodId?: string | null;
  explicitPaymentMethodId?: string | null;
  fallbackSymbol?: string | null;
  fallbackNetwork?: string | null;
}) {
  if (input.existingSubmissionPaymentMethodId) {
    const existing = await prisma.paymentMethod.findUnique({
      where: {
        id: input.existingSubmissionPaymentMethodId,
      },
      select: {
        id: true,
      },
    });
    if (existing) {
      return existing.id;
    }
  }

  if (input.explicitPaymentMethodId) {
    const explicit = await prisma.paymentMethod.findUnique({
      where: {
        id: input.explicitPaymentMethodId,
      },
      select: {
        id: true,
      },
    });
    if (explicit) {
      return explicit.id;
    }
  }

  return (
    await prisma.paymentMethod.findFirst({
      where: {
        active: true,
        symbol: {
          equals: String(input.fallbackSymbol || "USDT").trim().toUpperCase(),
        },
        network: {
          equals: String(input.fallbackNetwork || "TRC20").trim().toUpperCase(),
        },
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
      },
    })
  )?.id;
}

export async function approvePaymentManualReviewOrder(input: {
  reviewId: string;
  reviewedByAdminId: string;
  resolutionNote?: string | null;
}) {
  const review = await prisma.paymentManualReview.findUnique({
    where: { id: input.reviewId },
    include: {
      order: {
        select: {
          id: true,
          userId: true,
          reference: true,
          status: true,
          currency: true,
          network: true,
          invoiceAmountMicros: true,
          metadataJson: true,
          submissions: {
            orderBy: [{ submittedAt: "desc" }],
            select: {
              submittedTxHash: true,
            },
          },
        },
      },
    },
  });

  if (!review) {
    throw new Error("Manual-review item not found");
  }
  if (review.resolvedAt) {
    throw new Error("This manual-review item is already resolved.");
  }
  if (review.order.status !== PaymentOrderStatus.MANUAL_REVIEW) {
    throw new Error(`Manual-review item cannot be approved while invoice is ${review.order.status}.`);
  }

  const txHash = extractManualReviewTxHash({
    submissions: review.order.submissions,
    detailsJson: review.detailsJson,
  });
  if (!txHash) {
    throw new Error("Manual approval requires a transaction hash in the invoice submission or review details.");
  }

  const metadata = parsePaymentOrderMetadata(review.order.metadataJson as Prisma.JsonValue | null);
  const resolvedAmounts = computeManualReviewResolvedAmounts({
    invoiceAmountMicros: review.order.invoiceAmountMicros,
    metadata: review.order.metadataJson as Prisma.JsonValue | null,
  });
  const creditedUsdCents = resolvedAmounts.creditedUsdCents;
  const recurringAddonSlugs = metadata.addons
    .filter((addon) => addon.billing === "RECURRING")
    .map((addon) => addon.slug);
  const orderSubmissionTxHashes = Array.from(
    new Set(
      review.order.submissions
        .map((submission) => normalizeTxHash(submission.submittedTxHash))
        .filter((value) => isValidTxHash(value)),
    ),
  );
  const existingPaymentSubmission = await prisma.paymentSubmission.findUnique({
    where: { txHash },
    select: {
      userId: true,
      status: true,
      paymentMethodId: true,
    },
  });
  if (existingPaymentSubmission && existingPaymentSubmission.userId !== review.order.userId) {
    throw new Error("Transaction hash is already attached to another account.");
  }
  const paymentMethodId = review.order.userId
    ? await resolvePaymentMethodId({
        existingSubmissionPaymentMethodId: existingPaymentSubmission?.paymentMethodId || null,
        explicitPaymentMethodId: metadata.paymentMethodId,
        fallbackSymbol: review.order.currency,
        fallbackNetwork: review.order.network,
      })
    : null;

  if (review.order.userId && !paymentMethodId) {
    throw new Error("Manual approval requires a payment method to create the approved payment record.");
  }
  const requestedPlan = metadata.planSlug
    ? await prisma.pricingPlan.findUnique({
        where: { slug: metadata.planSlug },
        select: {
          id: true,
          automationMarket: true,
        },
      })
    : null;
  const waitlistMarket = toAutomationMarket(metadata.market) || requestedPlan?.automationMarket || null;
  const isWaitlistPrepay = Boolean(metadata.waitlistPrepayAnnual && waitlistMarket);
  const transition = resolveManualReviewTransition("APPROVED");
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const paymentSubmissionBeforeWrite = await tx.paymentSubmission.findUnique({
      where: { txHash },
      select: {
        userId: true,
      },
    });
    if (paymentSubmissionBeforeWrite && paymentSubmissionBeforeWrite.userId !== review.order.userId) {
      throw new Error("Transaction hash is already attached to another account.");
    }

    const existingTxSubmission = await tx.paymentTxSubmission.findUnique({
      where: { submittedTxHash: txHash },
      select: { orderId: true },
    });
    if (existingTxSubmission && existingTxSubmission.orderId !== review.order.id) {
      throw new Error("Transaction hash is already attached to another invoice.");
    }
    if (!existingTxSubmission) {
      await tx.paymentTxSubmission.create({
        data: {
          orderId: review.order.id,
          submittedTxHash: txHash,
          submittedSenderAddress: null,
        },
      });
    }

    const reviewUpdate = await tx.paymentManualReview.updateMany({
      where: {
        id: review.id,
        resolvedAt: null,
      },
      data: {
        resolvedAt: now,
        resolution: formatManualReviewResolution(transition.normalizedResolution, input.resolutionNote),
      },
    });
    if (reviewUpdate.count !== 1) {
      throw new Error("This manual-review item is already resolved.");
    }

    const orderUpdate = await tx.paymentOrder.updateMany({
      where: {
        id: review.order.id,
        status: PaymentOrderStatus.MANUAL_REVIEW,
      },
      data: {
        status: transition.orderStatus,
        paidAt: now,
        manualReviewReason: transition.manualReviewReason,
      },
    });
    if (orderUpdate.count !== 1) {
      throw new Error(`Manual-review item cannot be approved while invoice is ${review.order.status}.`);
    }

    await tx.invoiceAmountReservation.deleteMany({
      where: {
        orderId: review.order.id,
        status: InvoiceAmountReservationStatus.RESERVED,
      },
    });

    if (!review.order.userId || !paymentMethodId) {
      return;
    }

    await tx.paymentSubmission.upsert({
      where: { txHash },
      update: {
        userId: review.order.userId,
        paymentMethodId,
        planSlug: metadata.planSlug || null,
        visitorId: metadata.visitorId || null,
        amountUsdCents: resolvedAmounts.submissionAmountUsdCents,
        planPriceUsdCents: metadata.planPriceUsdCents ?? null,
        discountUsdCents: Math.max(0, metadata.discountUsdCents ?? 0),
        addonChargeUsdCents: resolvedAmounts.addonChargeUsdCents,
        finalAmountUsdCents: resolvedAmounts.finalAmountUsdCents,
        addonsJson: metadata.addons.length ? (metadata.addons as Prisma.InputJsonValue) : Prisma.JsonNull,
        experimentKey: metadata.experimentKey || null,
        experimentVariant: metadata.experimentVariant || null,
        referralCodeUsed: metadata.referralCodeUsed || null,
        note: metadata.note || null,
        status: PaymentStatus.APPROVED,
        reviewNote: formatManualReviewResolution("APPROVED", input.resolutionNote),
        reviewedById: input.reviewedByAdminId,
        reviewedAt: now,
      },
      create: {
        userId: review.order.userId,
        paymentMethodId,
        planSlug: metadata.planSlug || null,
        visitorId: metadata.visitorId || null,
        amountUsdCents: resolvedAmounts.submissionAmountUsdCents,
        planPriceUsdCents: metadata.planPriceUsdCents ?? null,
        discountUsdCents: Math.max(0, metadata.discountUsdCents ?? 0),
        addonChargeUsdCents: resolvedAmounts.addonChargeUsdCents,
        finalAmountUsdCents: resolvedAmounts.finalAmountUsdCents,
        addonsJson: metadata.addons.length ? (metadata.addons as Prisma.InputJsonValue) : Prisma.JsonNull,
        experimentKey: metadata.experimentKey || null,
        experimentVariant: metadata.experimentVariant || null,
        referralCodeUsed: metadata.referralCodeUsed || null,
        txHash,
        note: metadata.note || null,
        status: PaymentStatus.APPROVED,
        reviewNote: formatManualReviewResolution("APPROVED", input.resolutionNote),
        reviewedById: input.reviewedByAdminId,
        reviewedAt: now,
      },
    });
    if (orderSubmissionTxHashes.length) {
      await tx.paymentSubmission.updateMany({
        where: {
          txHash: {
            in: orderSubmissionTxHashes.filter((value) => value !== txHash),
          },
          status: PaymentStatus.PENDING,
        },
        data: {
          status: PaymentStatus.REJECTED,
          reviewNote: "rejected: superseded by approved invoice confirmation",
          reviewedById: input.reviewedByAdminId,
          reviewedAt: now,
        },
      });
    }

    if (creditedUsdCents > 0) {
      await creditUserAvailableFunds({
        tx,
        userId: review.order.userId,
        creditUsdCents: creditedUsdCents,
      });
    }

    if (isWaitlistPrepay && waitlistMarket) {
      await tx.marketEnrollment.upsert({
        where: {
          userId_market: {
            userId: review.order.userId,
            market: waitlistMarket,
          },
        },
        update: {
          planId: requestedPlan?.id || null,
          status: MarketEnrollmentStatus.WAITLIST_PREPAID,
          annualPrepaySelected: true,
          annualPrepayAmountUsdCents: resolvedAmounts.annualPrepayAmountUsdCents,
          annualPrepayPaidAt: now,
        },
        create: {
          userId: review.order.userId,
          market: waitlistMarket,
          planId: requestedPlan?.id || null,
          status: MarketEnrollmentStatus.WAITLIST_PREPAID,
          annualPrepaySelected: true,
          annualPrepayAmountUsdCents: resolvedAmounts.annualPrepayAmountUsdCents,
          annualPrepayPaidAt: now,
        },
      });
    } else if (requestedPlan) {
      await tx.subscription.upsert({
        where: { userId: review.order.userId },
        update: {
          planId: requestedPlan.id,
          status: SubscriptionStatus.INACTIVE,
          activeAddonSlugs: recurringAddonSlugs.length ? (recurringAddonSlugs as Prisma.InputJsonValue) : Prisma.DbNull,
        },
        create: {
          userId: review.order.userId,
          planId: requestedPlan.id,
          status: SubscriptionStatus.INACTIVE,
          activeAddonSlugs: recurringAddonSlugs.length ? (recurringAddonSlugs as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    }
  });

  if (review.order.userId && !isWaitlistPrepay) {
    await reconcileUserSubscriptionLifecycle(review.order.userId);
  }

  return {
    orderId: review.order.id,
    reference: review.order.reference,
    userId: review.order.userId,
    txHash,
    creditedUsdCents,
  };
}
