import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getUserOnboardingState } from "@/lib/onboarding";

export async function getPersonalRuntimeAccess(userId: string, requireSubscription = false) {
  const state = await getUserOnboardingState(userId);
  const allowed = state.checks.planSelected && state.checks.requiresBrokerRuntimeSetup &&
    state.checks.marketEnabled && state.checks.emailVerified && state.checks.legalAccepted &&
    !state.checks.accountRestricted && (!requireSubscription || state.checks.subscriptionActiveForSelectedMarket);
  return { allowed, state };
}

export async function requirePersonalRuntimePage() {
  const user = await requireUser();
  const { allowed, state } = await getPersonalRuntimeAccess(user.id);
  if (!allowed) redirect(state.checks.requiresBrokerRuntimeSetup ? state.nextRoute : "/dashboard/setup");
  return user;
}
