import { AutomationMarket } from "@prisma/client";

// Paid access wins stale enrollment; an unpaid account follows its selected plan.
export function resolveSelectedPlanForMarket<T extends { automationMarket: AutomationMarket }>(input: {
  selectedMarket: AutomationMarket;
  preferredMarket: AutomationMarket | null | undefined;
  subscriptionPlan: T | null | undefined;
  enrollmentPlan: T | null | undefined;
  subscriptionIsActive?: boolean;
}): T | null {
  if (input.subscriptionIsActive && input.subscriptionPlan?.automationMarket === input.selectedMarket) return input.subscriptionPlan;
  if (input.enrollmentPlan?.automationMarket === input.selectedMarket) return input.enrollmentPlan;
  if (input.subscriptionPlan?.automationMarket === input.selectedMarket) return input.subscriptionPlan;
  if (!input.preferredMarket) return input.subscriptionPlan || input.enrollmentPlan || null;
  return null;
}

export function hasUnpaidPlanSelectionMismatch(input: {
  subscriptionPlanId: string;
  selectedPlanId: string | null | undefined;
  status: string;
  expiresAt: Date | null;
  nowMs?: number;
}) {
  const paidWindow = input.status === "ACTIVE" && (!input.expiresAt || input.expiresAt.getTime() > (input.nowMs ?? Date.now()));
  return Boolean(input.selectedPlanId && input.selectedPlanId !== input.subscriptionPlanId && !paidWindow);
}
