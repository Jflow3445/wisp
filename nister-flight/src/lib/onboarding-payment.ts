type PendingOnboardingOrderCandidate = {
  reference: string;
  metadataJson?: unknown;
  createdAt: Date;
};

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED" | null;
type OrderStatus = "PENDING" | "MANUAL_REVIEW" | "PAID" | "EXPIRED" | "CANCELLED" | null;

export type OnboardingSubmissionNotice = {
  type: "success" | "error";
  message: string;
};

export type OnboardingPaymentPostSubmitEffect = {
  name: string;
  run: () => Promise<unknown>;
};

export type OnboardingPaymentPostSubmitEffectsResult = {
  failedEffects: string[];
};

export async function runOnboardingPaymentPostSubmitEffects(
  effects: OnboardingPaymentPostSubmitEffect[],
  onError: (effectName: string, error: unknown) => void = (effectName, error) => {
    console.error(`[onboarding-payment] post-submit side effect failed: ${effectName}`, error);
  },
): Promise<OnboardingPaymentPostSubmitEffectsResult> {
  const failedEffects: string[] = [];

  for (const effect of effects) {
    try {
      await effect.run();
    } catch (error) {
      failedEffects.push(effect.name);
      onError(effect.name, error);
    }
  }

  return { failedEffects };
}

export function parsePendingOrderPlanSlug(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  return typeof row.planSlug === "string" ? row.planSlug.trim().toLowerCase() : null;
}

export function selectOnboardingOrderForPlan<T extends PendingOnboardingOrderCandidate>(
  orders: T[],
  planSlug: string,
): T | null {
  if (!orders.length) {
    return null;
  }
  const normalizedPlanSlug = String(planSlug || "").trim().toLowerCase();
  if (!normalizedPlanSlug) {
    return null;
  }
  const scoped = orders.find((order) => parsePendingOrderPlanSlug(order.metadataJson) === normalizedPlanSlug);
  return scoped || null;
}

export function selectOnboardingPendingOrderForPlan<T extends PendingOnboardingOrderCandidate>(
  orders: T[],
  planSlug: string,
): T | null {
  return selectOnboardingOrderForPlan(orders, planSlug);
}

export function resolveOnboardingSubmissionNotice(input: {
  orderStatus: OrderStatus;
  submissionStatus: SubmissionStatus;
  linkedToCurrentUser: boolean;
}): OnboardingSubmissionNotice {
  if (!input.linkedToCurrentUser) {
    return {
      type: "error",
      message: "Transaction hash is already attached to another account.",
    };
  }
  if (input.submissionStatus === "APPROVED" || input.orderStatus === "PAID") {
    return {
      type: "success",
      message: "Payment already marked as confirmed. Continue setup.",
    };
  }
  if (input.submissionStatus === "PENDING" || input.orderStatus === "MANUAL_REVIEW") {
    return {
      type: "success",
      message: "Transaction already submitted. Admin verification is now in progress.",
    };
  }
  if (input.submissionStatus === "REJECTED") {
    return {
      type: "error",
      message: "The latest transaction hash for this invoice was rejected. Submit a fresh hash for review.",
    };
  }
  return {
    type: "error",
    message: "We could not confirm that your transaction was queued. Refresh checkout and submit again.",
  };
}
