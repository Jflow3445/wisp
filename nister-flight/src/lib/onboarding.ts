import {
  AutomationMarket,
  MarketEnrollmentStatus,
  SubscriptionStatus,
  UserAccountState,
  UserFundsState,
  UserRole,
  UserTradeState,
} from "@prisma/client";
import { isAcceptanceCurrent } from "@/lib/legal";
import { isMarketEnabled, isWaitlistEnrollmentStatus, resolveUserFocusMarket } from "@/lib/market-access";
import { prisma } from "@/lib/prisma";
import {
  planRequiresBrokerRuntimeSetup,
  productKindForPlan,
  type ProductPlanKind,
} from "@/lib/product-capabilities";
import { resolveSelectedPlanForMarket as resolveSelectedPlanForOnboardingMarket } from "@/lib/plan-selection";
import { getPlatformSettings } from "@/lib/site";

export { resolveSelectedPlanForMarket as resolveSelectedPlanForOnboardingMarket } from "@/lib/plan-selection";

export const onboardingRoutes = {
  checkpoint: "/app/onboarding",
  verifyEmail: "/app/onboarding/verify-email",
  legal: "/app/onboarding/legal",
  choosePlan: "/app/onboarding/choose-plan",
  checkout: "/app/onboarding/checkout",
  brokerAccount: "/app/onboarding/broker-account",
  connectApp: "/app/onboarding/connect-app",
  connectEa: "/app/onboarding/connect-app",
  riskSettings: "/app/onboarding/risk-settings",
  review: "/app/onboarding/review",
  dashboard: "/dashboard",
} as const;

export type OnboardingRoute = (typeof onboardingRoutes)[keyof typeof onboardingRoutes];

export type OnboardingStepState = "not_started" | "in_progress" | "complete" | "locked";

export type OnboardingSummaryStep = {
  key:
    | "account_created"
    | "email_verified"
    | "legal_accepted"
    | "subscription_active"
    | "broker_account_added"
    | "ea_connected"
    | "risk_configured"
    | "trading_activated"
    | "market_plan_selected"
    | "waitlist_joined"
    | "waitlist_prepay"
    | "waitlist_release";
  label: string;
  complete: boolean;
  state: OnboardingStepState;
};

export type OnboardingProgressStep = {
  key:
    | "verify_email"
    | "legal"
    | "plan"
    | "broker"
    | "connect_app"
    | "risk"
    | "payment"
    | "review"
    | "activate"
    | "waitlist";
  label: string;
  complete: boolean;
  state: OnboardingStepState;
};

export type UserOnboardingState = {
  userId: string;
  email: string;
  role: UserRole;
  checks: {
    selectedMarket: AutomationMarket;
    accountRestricted: boolean;
    activeSubscriptionMarket: AutomationMarket | null;
    requiresMt5Ea: boolean;
    marketEnabled: boolean;
    waitlistEnrollmentStatus: MarketEnrollmentStatus | null;
    waitlistJoined: boolean;
    waitlistReleased: boolean;
    waitlistPrepaid: boolean;
    emailVerified: boolean;
    legalAccepted: boolean;
    hasConnectedHeartbeat: boolean;
    planSelected: boolean;
    subscriptionActive: boolean;
    subscriptionActiveForSelectedMarket: boolean;
    subscriptionPendingApproval: boolean;
    brokerAccountAdded: boolean;
    connectedAgentCount: number;
    leaderAgentCount: number;
    riskSettingsComplete: boolean;
    selectedPlanProductKind: ProductPlanKind | null;
    requiresBrokerRuntimeSetup: boolean;
    activationSubmitted: boolean;
    tradingActivated: boolean;
  };
  selectedPlan: {
    id: string;
    slug: string;
    name: string;
    monthlyPriceCents: number;
    automationMarket: AutomationMarket;
    productKind: ProductPlanKind;
  } | null;
  selectedBrokerAccount: {
    id: string;
    brokerName: string;
    brokerServer: string;
    accountLogin: string;
    accountMode: "DEMO" | "REAL";
  } | null;
  summarySteps: OnboardingSummaryStep[];
  progressSteps: OnboardingProgressStep[];
  firstIncompleteRoute: OnboardingRoute | null;
  nextRoute: OnboardingRoute;
  complete: boolean;
};

export type OnboardingRouteResolutionInput = {
  emailVerified: boolean;
  legalAccepted: boolean;
  marketEnabled: boolean;
  waitlistJoined: boolean;
  planSelected: boolean;
  brokerAccountAdded: boolean;
  requiresMt5Ea: boolean;
  riskSettingsComplete: boolean;
  subscriptionActiveForSelectedMarket: boolean;
  eaConnected: boolean;
  tradingActivated: boolean;
  activationSubmitted: boolean;
  selectedPlanProductKind?: ProductPlanKind | null;
};

function toStepState(input: Array<{ complete: boolean }>): OnboardingStepState[] {
  let firstIncompleteSeen = false;
  return input.map((step) => {
    if (step.complete) {
      return "complete";
    }
    if (!firstIncompleteSeen) {
      firstIncompleteSeen = true;
      return "in_progress";
    }
    return "locked";
  });
}

export function resolveFirstIncompleteOnboardingRoute(
  input: OnboardingRouteResolutionInput,
): OnboardingRoute | null {
  if (!input.emailVerified) {
    return onboardingRoutes.verifyEmail;
  }
  if (!input.legalAccepted) {
    return onboardingRoutes.legal;
  }
  if (!input.marketEnabled) {
    if (!input.planSelected) {
      return onboardingRoutes.choosePlan;
    }
    if (!input.waitlistJoined) {
      return onboardingRoutes.checkout;
    }
    return null;
  }

  if (!input.planSelected) {
    return onboardingRoutes.choosePlan;
  }
  if (input.selectedPlanProductKind === "MANAGED_FUNDS") {
    if (!input.subscriptionActiveForSelectedMarket) {
      return onboardingRoutes.checkout;
    }
    return null;
  }
  if (!input.brokerAccountAdded) {
    return onboardingRoutes.brokerAccount;
  }
  if (input.requiresMt5Ea && !input.riskSettingsComplete) {
    return onboardingRoutes.riskSettings;
  }
  if (!input.subscriptionActiveForSelectedMarket) {
    return onboardingRoutes.checkout;
  }
  if (input.requiresMt5Ea && !input.eaConnected) {
    return onboardingRoutes.connectApp;
  }
  if (!input.tradingActivated) {
    return onboardingRoutes.review;
  }
  return null;
}

export function onboardingGoLiveTradingProfile() {
  return {
    accountState: UserAccountState.ACTIVE,
    fundsState: UserFundsState.FUNDED,
    tradeState: UserTradeState.LIVE,
    autotradeEnabled: true,
  } as const;
}

export function onboardingProfileIsLiveTrading(input: {
  accountState: UserAccountState | null | undefined;
  fundsState: UserFundsState | null | undefined;
  tradeState: UserTradeState | null | undefined;
  autotradeEnabled: boolean | null | undefined;
}) {
  return (
    input.accountState === UserAccountState.ACTIVE &&
    input.fundsState === UserFundsState.FUNDED &&
    input.tradeState === UserTradeState.LIVE &&
    Boolean(input.autotradeEnabled)
  );
}

export async function getUserOnboardingState(userId: string): Promise<UserOnboardingState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      emailVerifiedAt: true,
      subscription: {
        select: {
          status: true,
          expiresAt: true,
          planId: true,
          plan: {
            select: {
              id: true,
              slug: true,
              name: true,
              monthlyPriceCents: true,
              automationMarket: true,
              tier: true,
            },
          },
        },
      },
      preference: {
        select: {
          preferredMarket: true,
        },
      },
      marketEnrollments: {
        orderBy: [{ joinedAt: "desc" }],
        select: {
          market: true,
          status: true,
          planId: true,
          plan: {
            select: {
              id: true,
              slug: true,
              name: true,
              monthlyPriceCents: true,
              automationMarket: true,
              tier: true,
            },
          },
          annualPrepaySelected: true,
          annualPrepayPaidAt: true,
          launchEmailSentAt: true,
          unlockedAt: true,
        },
      },
      tradingProfile: {
        select: {
          accountState: true,
          fundsState: true,
          tradeState: true,
          autotradeEnabled: true,
        },
      },
      brokerAccounts: {
        where: {
          isActive: true,
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          brokerName: true,
          brokerServer: true,
          accountLogin: true,
          accountMode: true,
          policy: {
            select: {
              id: true,
              maxRiskPerTradePct: true,
              maxDailyLossPct: true,
              maxOpenTradesTotal: true,
              maxOpenTradesPerSymbol: true,
              maxSpreadPoints: true,
              maxSlippagePoints: true,
            },
          },
          agents: {
            select: {
              id: true,
              status: true,
              isExecutionLeader: true,
              lastHeartbeatAt: true,
            },
          },
        },
      },
      legalAcceptances: {
        orderBy: [{ acceptedAt: "desc" }],
        take: 1,
        select: {
          termsVersion: true,
          privacyVersion: true,
          riskVersion: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const latestAcceptance = user.legalAcceptances[0] || null;
  const emailVerified = Boolean(user.emailVerifiedAt);
  const legalAccepted = isAcceptanceCurrent(latestAcceptance);
  const selectedPlanMarket = user.subscription?.plan?.automationMarket || null;
  const selectedMarket = resolveUserFocusMarket({ preferredMarket: user.preference?.preferredMarket, subscriptionMarket: selectedPlanMarket });
  const selectedEnrollment = user.marketEnrollments.find((row) => row.market === selectedMarket) || null;
  const selectedPlan = resolveSelectedPlanForOnboardingMarket({
    selectedMarket,
    preferredMarket: user.preference?.preferredMarket,
    subscriptionPlan: user.subscription?.plan || null,
    subscriptionIsActive: user.subscription?.status === SubscriptionStatus.ACTIVE && (!user.subscription.expiresAt || user.subscription.expiresAt.getTime() > Date.now()),
    enrollmentPlan: selectedEnrollment?.plan || null,
  });
  const planSelected = Boolean(selectedPlan?.id);
  const selectedPlanProductKind = selectedPlan ? productKindForPlan(selectedPlan) : null;
  const requiresBrokerRuntimeSetup = selectedPlan
    ? planRequiresBrokerRuntimeSetup(selectedPlan)
    : selectedMarket === AutomationMarket.FOREX;
  const requiresMt5Ea = requiresBrokerRuntimeSetup && selectedMarket === AutomationMarket.FOREX;
  const platformSettings = await getPlatformSettings();
  const marketEnabled = isMarketEnabled(platformSettings, selectedMarket);
  const waitlistEnrollmentStatus = selectedEnrollment?.status || null;
  const waitlistJoined = Boolean(
    selectedEnrollment && isWaitlistEnrollmentStatus(selectedEnrollment.status),
  );
  const waitlistReleased = Boolean(
    selectedEnrollment &&
      (selectedEnrollment.status === MarketEnrollmentStatus.RELEASED ||
        selectedEnrollment.status === MarketEnrollmentStatus.ACTIVE),
  );
  const waitlistPrepaid = Boolean(
    selectedEnrollment &&
      (selectedEnrollment.status === MarketEnrollmentStatus.WAITLIST_PREPAID ||
        selectedEnrollment.annualPrepaySelected ||
        selectedEnrollment.annualPrepayPaidAt),
  );
  const subscriptionWindowOpen = Boolean(
    user.subscription?.expiresAt && user.subscription.expiresAt.getTime() > Date.now(),
  );
  const subscriptionPendingApproval = user.subscription?.status === SubscriptionStatus.PENDING;
  const subscriptionActive =
    user.subscription?.status === SubscriptionStatus.ACTIVE &&
    (!user.subscription?.expiresAt || subscriptionWindowOpen);
  const activeSubscriptionMarket = subscriptionActive
    ? user.subscription?.plan?.automationMarket || null
    : null;
  const subscriptionActiveForSelectedMarket =
    Boolean(activeSubscriptionMarket) && activeSubscriptionMarket === selectedMarket &&
    Boolean(selectedPlan && user.subscription?.planId === selectedPlan.id);
  const selectedBroker = user.brokerAccounts[0] || null;
  const brokerAccountAdded = user.brokerAccounts.length > 0;
  const selectedBrokerAgents = selectedBroker?.agents || [];
  const activeAgents = selectedBrokerAgents.filter((agent) => agent.status === "ACTIVE" || agent.status === "STANDBY");
  const hasConnectedHeartbeat = selectedBrokerAgents.some((agent) => Boolean(agent.lastHeartbeatAt));

  const connectedAgentCount = activeAgents.filter((agent) => Boolean(agent.lastHeartbeatAt)).length;

  const leaderAgentCount = activeAgents.filter(
    (agent) => agent.status === "ACTIVE" && agent.isExecutionLeader && Boolean(agent.lastHeartbeatAt),
  ).length;

  const policy = selectedBroker?.policy || null;
  const riskSettingsComplete = Boolean(
    policy &&
      Number(policy.maxRiskPerTradePct) > 0 &&
      Number(policy.maxDailyLossPct) > Number(policy.maxRiskPerTradePct) &&
      policy.maxOpenTradesTotal >= 0 &&
      policy.maxOpenTradesPerSymbol >= 0 &&
      policy.maxSpreadPoints >= 1 &&
      policy.maxSlippagePoints >= 1,
  );
  const eaConnected = requiresMt5Ea
    ? connectedAgentCount > 0 && leaderAgentCount > 0
    : true;
  const effectiveRiskSettingsComplete = requiresMt5Ea ? riskSettingsComplete : true;

  const tradingActivated = onboardingProfileIsLiveTrading({
    accountState: user.tradingProfile?.accountState,
    fundsState: user.tradingProfile?.fundsState,
    tradeState: user.tradingProfile?.tradeState,
    autotradeEnabled: user.tradingProfile?.autotradeEnabled,
  });
  const activationSubmitted = Boolean(
    user.tradingProfile?.accountState === UserAccountState.PENDING_REVIEW &&
      user.tradingProfile.tradeState === UserTradeState.READY &&
      !user.tradingProfile.autotradeEnabled,
  );

  const firstIncompleteRoute = resolveFirstIncompleteOnboardingRoute({
    emailVerified,
    legalAccepted,
    marketEnabled,
    waitlistJoined,
    planSelected,
    brokerAccountAdded,
    requiresMt5Ea,
    riskSettingsComplete: effectiveRiskSettingsComplete,
    subscriptionActiveForSelectedMarket,
    eaConnected,
    tradingActivated,
    activationSubmitted,
    selectedPlanProductKind,
  });

  const complete = firstIncompleteRoute === null;
  const nextRoute: OnboardingRoute = complete
    ? onboardingRoutes.dashboard
    : firstIncompleteRoute || onboardingRoutes.checkpoint;
  let summarySteps: OnboardingSummaryStep[];
  let progressSteps: OnboardingProgressStep[];
  if (!marketEnabled) {
    const summaryRaw = [
      { complete: true },
      { complete: emailVerified },
      { complete: legalAccepted },
      { complete: planSelected },
      { complete: waitlistJoined },
      { complete: waitlistPrepaid || waitlistJoined },
      { complete: waitlistReleased || marketEnabled },
      { complete: waitlistJoined },
    ];
    const summaryStates = toStepState(summaryRaw);
    summarySteps = [
      {
        key: "account_created",
        label: "Account created",
        complete: true,
        state: summaryStates[0],
      },
      {
        key: "email_verified",
        label: "Email verified",
        complete: emailVerified,
        state: summaryStates[1],
      },
      {
        key: "legal_accepted",
        label: "Legal accepted",
        complete: legalAccepted,
        state: summaryStates[2],
      },
      {
        key: "market_plan_selected",
        label: "Market plan selected",
        complete: planSelected,
        state: summaryStates[3],
      },
      {
        key: "waitlist_joined",
        label: "Waitlist joined",
        complete: waitlistJoined,
        state: summaryStates[4],
      },
      {
        key: "waitlist_prepay",
        label: "Annual prepay (optional)",
        complete: waitlistPrepaid || waitlistJoined,
        state: summaryStates[5],
      },
      {
        key: "waitlist_release",
        label: "Market release",
        complete: waitlistReleased || marketEnabled,
        state: summaryStates[6],
      },
      {
        key: "trading_activated",
        label: "Dashboard access",
        complete: waitlistJoined,
        state: summaryStates[7],
      },
    ];

    const progressRaw = [
      { complete: emailVerified },
      { complete: legalAccepted },
      { complete: planSelected },
      { complete: waitlistJoined },
    ];
    const progressStates = toStepState(progressRaw);
    progressSteps = [
      { key: "verify_email", label: "Verify Email", complete: emailVerified, state: progressStates[0] },
      { key: "legal", label: "Legal", complete: legalAccepted, state: progressStates[1] },
      { key: "plan", label: "Plan", complete: planSelected, state: progressStates[2] },
      { key: "waitlist", label: "Join Waitlist", complete: waitlistJoined, state: progressStates[3] },
    ];
  } else if (!requiresBrokerRuntimeSetup) {
    const summaryRaw = [
      { complete: true },
      { complete: emailVerified },
      { complete: legalAccepted },
      { complete: planSelected },
      { complete: subscriptionActiveForSelectedMarket },
      { complete: subscriptionActiveForSelectedMarket },
    ];
    const summaryStates = toStepState(summaryRaw);
    summarySteps = [
      {
        key: "account_created",
        label: "Account created",
        complete: true,
        state: summaryStates[0],
      },
      {
        key: "email_verified",
        label: "Email verified",
        complete: emailVerified,
        state: summaryStates[1],
      },
      {
        key: "legal_accepted",
        label: "Legal accepted",
        complete: legalAccepted,
        state: summaryStates[2],
      },
      {
        key: "market_plan_selected",
        label: "Managed Funds plan selected",
        complete: planSelected,
        state: summaryStates[3],
      },
      {
        key: "subscription_active",
        label: "Managed Funds subscription confirmed",
        complete: subscriptionActiveForSelectedMarket,
        state: summaryStates[4],
      },
      {
        key: "trading_activated",
        label: "Managed Funds dashboard access",
        complete: subscriptionActiveForSelectedMarket,
        state: summaryStates[5],
      },
    ];

    const progressRaw = [
      { complete: emailVerified },
      { complete: legalAccepted },
      { complete: planSelected },
      { complete: subscriptionActiveForSelectedMarket },
    ];
    const progressStates = toStepState(progressRaw);
    progressSteps = [
      { key: "verify_email", label: "Verify email", complete: emailVerified, state: progressStates[0] },
      { key: "legal", label: "Legal", complete: legalAccepted, state: progressStates[1] },
      { key: "plan", label: "Managed Funds plan", complete: planSelected, state: progressStates[2] },
      {
        key: "payment",
        label: "Managed Funds payment",
        complete: subscriptionActiveForSelectedMarket,
        state: progressStates[3],
      },
    ];
  } else {
    const summaryRaw = [
      { complete: true },
      { complete: emailVerified },
      { complete: legalAccepted },
      { complete: planSelected },
      { complete: brokerAccountAdded },
      { complete: effectiveRiskSettingsComplete },
      { complete: subscriptionActiveForSelectedMarket },
      { complete: eaConnected },
      { complete: tradingActivated },
    ];
    const summaryStates = toStepState(summaryRaw);
    summarySteps = [
      {
        key: "account_created",
        label: "Account created",
        complete: true,
        state: summaryStates[0],
      },
      {
        key: "email_verified",
        label: "Email verified",
        complete: emailVerified,
        state: summaryStates[1],
      },
      {
        key: "legal_accepted",
        label: "Legal accepted",
        complete: legalAccepted,
        state: summaryStates[2],
      },
      {
        key: "market_plan_selected",
        label: "Market and plan selected",
        complete: planSelected,
        state: summaryStates[3],
      },
      {
        key: "broker_account_added",
        label: "Broker account added",
        complete: brokerAccountAdded,
        state: summaryStates[4],
      },
      {
        key: "risk_configured",
        label: "Risk limits set",
        complete: effectiveRiskSettingsComplete,
        state: summaryStates[5],
      },
      {
        key: "subscription_active",
        label: "Payment confirmed",
        complete: subscriptionActiveForSelectedMarket,
        state: summaryStates[6],
      },
      {
        key: "ea_connected",
        label: "Nister AI App connected",
        complete: eaConnected,
        state: summaryStates[7],
      },
      {
        key: "trading_activated",
        label: "Eligible for valid signals",
        complete: tradingActivated,
        state: summaryStates[8],
      },
    ];

    const progressRaw = [
      { complete: emailVerified },
      { complete: legalAccepted },
      { complete: planSelected },
      { complete: brokerAccountAdded },
      { complete: effectiveRiskSettingsComplete },
      { complete: subscriptionActiveForSelectedMarket },
      { complete: eaConnected },
      { complete: tradingActivated },
    ];
    const progressStates = toStepState(progressRaw);
    progressSteps = [
      { key: "verify_email", label: "Verify email", complete: emailVerified, state: progressStates[0] },
      { key: "legal", label: "Legal", complete: legalAccepted, state: progressStates[1] },
      { key: "plan", label: "Market and plan", complete: planSelected, state: progressStates[2] },
      { key: "broker", label: "Supported broker", complete: brokerAccountAdded, state: progressStates[3] },
      { key: "risk", label: "Risk limits", complete: effectiveRiskSettingsComplete, state: progressStates[4] },
      {
        key: "payment",
        label: "Payment",
        complete: subscriptionActiveForSelectedMarket,
        state: progressStates[5],
      },
      { key: "connect_app", label: "Nister AI App", complete: eaConnected, state: progressStates[6] },
      { key: "activate", label: "Review eligibility", complete: tradingActivated, state: progressStates[7] },
    ];
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    checks: {
      selectedMarket,
      accountRestricted: user.tradingProfile?.accountState === UserAccountState.SUSPENDED || user.tradingProfile?.accountState === UserAccountState.CLOSED,
      activeSubscriptionMarket,
      requiresMt5Ea,
      marketEnabled,
      waitlistEnrollmentStatus,
      waitlistJoined,
      waitlistReleased,
      waitlistPrepaid,
      emailVerified,
      legalAccepted,
      hasConnectedHeartbeat,
      planSelected,
      subscriptionActive,
      subscriptionActiveForSelectedMarket,
      subscriptionPendingApproval,
      brokerAccountAdded,
      connectedAgentCount,
      leaderAgentCount,
      riskSettingsComplete: effectiveRiskSettingsComplete,
      selectedPlanProductKind,
      requiresBrokerRuntimeSetup,
      activationSubmitted,
      tradingActivated,
    },
    selectedPlan: selectedPlan
      ? {
          id: selectedPlan.id,
          slug: selectedPlan.slug,
          name: selectedPlan.name,
          monthlyPriceCents: selectedPlan.monthlyPriceCents,
          automationMarket: selectedPlan.automationMarket,
          productKind: selectedPlanProductKind ?? productKindForPlan(selectedPlan),
        }
      : null,
    selectedBrokerAccount: selectedBroker
      ? {
          id: selectedBroker.id,
          brokerName: selectedBroker.brokerName,
          brokerServer: selectedBroker.brokerServer,
          accountLogin: selectedBroker.accountLogin,
          accountMode: selectedBroker.accountMode,
        }
      : null,
    summarySteps,
    progressSteps,
    firstIncompleteRoute,
    nextRoute,
    complete,
  };
}

export function onboardingStateLabel(state: OnboardingStepState) {
  if (state === "complete") {
    return "Complete";
  }
  if (state === "in_progress") {
    return "In progress";
  }
  if (state === "locked") {
    return "Locked";
  }
  return "Not started";
}

export function onboardingRouteLabel(
  route: OnboardingRoute,
  context?: { marketEnabled?: boolean; requiresMt5Ea?: boolean; selectedPlanProductKind?: ProductPlanKind | null },
) {
  if (route === onboardingRoutes.verifyEmail) {
    return "Verify email";
  }
  if (route === onboardingRoutes.legal) {
    return "Accept legal documents";
  }
  if (route === onboardingRoutes.choosePlan) {
    return "Choose market and plan";
  }
  if (route === onboardingRoutes.brokerAccount) {
    return "Link supported broker";
  }
  if (route === onboardingRoutes.riskSettings) {
    return "Set risk limits";
  }
  if (route === onboardingRoutes.checkout) {
    if (context?.selectedPlanProductKind === "MANAGED_FUNDS" && context.marketEnabled !== false) {
      return "Confirm Managed Funds subscription";
    }
    return context?.marketEnabled === false ? "Join waitlist" : "Confirm payment";
  }
  if (route === onboardingRoutes.connectApp) {
    return context?.requiresMt5Ea === false ? "Continue setup" : "Connect Nister AI App";
  }
  if (route === onboardingRoutes.review) {
    return "Review and submit activation";
  }
  if (route === onboardingRoutes.dashboard) {
    return "Open dashboard";
  }
  if (route === onboardingRoutes.checkpoint) {
    return "Open setup checkpoint";
  }
  return "Continue setup";
}

export function onboardingRouteActionLabel(
  route: OnboardingRoute,
  context?: { marketEnabled?: boolean; requiresMt5Ea?: boolean; selectedPlanProductKind?: ProductPlanKind | null },
) {
  if (route === onboardingRoutes.verifyEmail) {
    return "Continue to email verification";
  }
  if (route === onboardingRoutes.legal) {
    return "Continue to legal documents";
  }
  if (route === onboardingRoutes.choosePlan) {
    return "Continue to market and plan";
  }
  if (route === onboardingRoutes.brokerAccount) {
    return "Continue to broker account";
  }
  if (route === onboardingRoutes.riskSettings) {
    return "Continue to risk limits";
  }
  if (route === onboardingRoutes.checkout) {
    if (context?.selectedPlanProductKind === "MANAGED_FUNDS" && context.marketEnabled !== false) {
      return "Continue to Managed Funds payment";
    }
    return context?.marketEnabled === false ? "Continue to waitlist" : "Continue to payment";
  }
  if (route === onboardingRoutes.connectApp) {
    return context?.requiresMt5Ea === false ? "Continue setup" : "Continue to Nister AI App";
  }
  if (route === onboardingRoutes.review) {
    return "Continue to review";
  }
  if (route === onboardingRoutes.dashboard) {
    return "Open dashboard";
  }
  if (route === onboardingRoutes.checkpoint) {
    return "Open setup checkpoint";
  }
  return "Continue setup";
}

export function isOnboardingRoute(pathname: string) {
  return pathname.startsWith("/app/onboarding");
}

export function memberShouldEnterDashboard(state: Pick<UserOnboardingState, "checks">) {
  return state.checks.subscriptionActive;
}

export async function getMemberAppEntryRoute(userId: string) {
  const state = await getUserOnboardingState(userId);
  if (memberShouldEnterDashboard(state)) {
    return onboardingRoutes.dashboard;
  }
  return state.nextRoute;
}
