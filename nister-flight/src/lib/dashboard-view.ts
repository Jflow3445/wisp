import { AutomationMarket, MarketEnrollmentStatus, PaymentStatus } from "@prisma/client";
import type { DashboardBannerKey } from "@/components/dashboard/status-banner";
import { planRequiresBrokerRuntimeSetup } from "@/lib/product-capabilities";
import { DashboardStateView, paymentStatusLabel, referralStatusLabel } from "@/lib/site";

type Tone = "ok" | "warn" | "danger" | "muted";

export type DashboardStatus = {
  label: string;
  tone: Tone;
};

export type SetupStep = {
  key: string;
  title: string;
  description: string;
  complete: boolean;
  actionHref: string;
  actionLabel: string;
};

export type DashboardHero = {
  title: string;
  body: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
};

export type DashboardEvent = {
  id: string;
  title: string;
  detail: string;
  at: Date;
  tone: Tone;
};

type ActivationState = "Not started" | "In progress" | "Under review" | "Complete" | "Restricted";

export function selectedDashboardPlan(state: DashboardStateView) {
  return state.selectedPlan === undefined ? state.user?.subscription?.plan ?? null : state.selectedPlan;
}

function activeMarket(state: DashboardStateView) {
  return selectedDashboardPlan(state)?.automationMarket || null;
}

function requiresMt5Ea(state: DashboardStateView) {
  return activeMarket(state) === AutomationMarket.FOREX && requiresBrokerRuntimeSetup(state);
}

function requiresBrokerRuntimeSetup(state: DashboardStateView) {
  const plan = selectedDashboardPlan(state);
  if (!plan) {
    return activeMarket(state) === AutomationMarket.FOREX;
  }
  return planRequiresBrokerRuntimeSetup(plan);
}

function isManagedFundsPlan(state: DashboardStateView) {
  return selectedDashboardPlan(state)?.productKind === "MANAGED_FUNDS";
}

export type MarketEnrollmentStateView = {
  status: MarketEnrollmentStatus | "NOT_ENROLLED";
  hasEnrollment: boolean;
  viaSubscription: boolean;
};

export function resolveMarketEnrollmentState(
  state: DashboardStateView,
  market: AutomationMarket,
): MarketEnrollmentStateView {
  const enrollment = state.user?.marketEnrollments.find((row) => row.market === market) || null;
  if (enrollment) {
    return {
      status: enrollment.status,
      hasEnrollment: true,
      viaSubscription: false,
    };
  }

  const subscriptionMarket = selectedDashboardPlan(state)?.automationMarket || null;
  if (state.user?.subscriptionActive && subscriptionMarket === market) {
    return {
      status: MarketEnrollmentStatus.ACTIVE,
      hasEnrollment: true,
      viaSubscription: true,
    };
  }

  return {
    status: "NOT_ENROLLED",
    hasEnrollment: false,
    viaSubscription: false,
  };
}

function hasPlan(state: DashboardStateView) {
  return Boolean(selectedDashboardPlan(state));
}

function hasBrokerDetails(state: DashboardStateView) {
  if (!requiresMt5Ea(state)) {
    return true;
  }
  if (state.activeBrokerAccount) {
    return true;
  }
  const details = state.preference?.connectionDetails;
  return Boolean(state.preference?.preferredBrokerId && details?.brokerAccountNumber && details?.brokerServer);
}

function profileRestricted(state: DashboardStateView) {
  const accountState = state.user?.tradingProfile?.accountState;
  return accountState === "SUSPENDED" || accountState === "CLOSED";
}

function latestSubmissionStatus(state: DashboardStateView) {
  return state.latestSubmission?.status || null;
}

function runtimeLive(state: DashboardStateView) {
  const profile = state.user?.tradingProfile;
  return Boolean(
    profile &&
      state.user?.subscriptionActive &&
      profile.tradeState === "LIVE" &&
      profile.autotradeEnabled &&
      !profileRestricted(state),
  );
}

function runtimePaused(state: DashboardStateView) {
  const profile = state.user?.tradingProfile;
  if (!profile || profileRestricted(state)) {
    return false;
  }
  return profile.tradeState === "PAUSED" || !profile.autotradeEnabled;
}

function hasActivationSignals(state: DashboardStateView) {
  return hasPlan(state) || hasBrokerDetails(state) || Boolean(state.latestSubmission);
}

function activationSubmitted(state: DashboardStateView) {
  const profile = state.user?.tradingProfile;
  if (!profile || profileRestricted(state)) {
    return false;
  }
  return profile.accountState === "PENDING_REVIEW" && !runtimeLive(state);
}

function connectionSetupComplete(state: DashboardStateView) {
  if (!requiresMt5Ea(state)) {
    return true;
  }
  const details = state.preference?.connectionDetails;
  const managed = selectedDashboardPlan(state)?.executionMode === "MANAGED";
  if (managed) {
    return Boolean(details?.managedContactEmail || details?.managedProvisioningNote);
  }
  return Boolean(details?.localEaClientKey || state.licensedEaClients.length > 0);
}

export function planLabel(state: DashboardStateView) {
  return selectedDashboardPlan(state)?.name || "No active plan";
}

export function planModeLabel(state: DashboardStateView) {
  const plan = selectedDashboardPlan(state);
  if (plan?.productKind === "MANAGED_FUNDS") {
    return "Managed Funds";
  }
  if (plan?.productKind === "LOCAL_RUNTIME") {
    return "Starter";
  }
  return "No plan selected";
}

export function operatingModelStatus(state: DashboardStateView): DashboardStatus {
  const plan = selectedDashboardPlan(state);
  if (plan?.productKind === "MANAGED_FUNDS") {
    return { label: "Managed Funds", tone: "ok" };
  }
  if (plan?.productKind === "LOCAL_RUNTIME") {
    return { label: "Starter", tone: "ok" };
  }
  return { label: "No plan selected", tone: "warn" };
}

export function brokerConnectionStatus(state: DashboardStateView): DashboardStatus {
  if (!hasBrokerDetails(state)) {
    return { label: "Disconnected", tone: "warn" };
  }

  const submission = latestSubmissionStatus(state);
  if (submission === PaymentStatus.REJECTED) {
    return { label: "Attention needed", tone: "danger" };
  }
  if (submission === PaymentStatus.PENDING) {
    return { label: "Under review", tone: "warn" };
  }
  return { label: "Connected", tone: "ok" };
}

export function aiTradingStatus(state: DashboardStateView): DashboardStatus {
  if (profileRestricted(state)) {
    return { label: "Restricted", tone: "danger" };
  }
  if (runtimeLive(state)) {
    return { label: "Active", tone: "ok" };
  }
  if (activationSubmitted(state)) {
    return { label: "Under review", tone: "warn" };
  }
  if (runtimePaused(state)) {
    return { label: "Paused", tone: "warn" };
  }
  if (latestSubmissionStatus(state) === PaymentStatus.PENDING) {
    return { label: "Under review", tone: "warn" };
  }
  if (hasActivationSignals(state)) {
    return { label: "In progress", tone: "warn" };
  }
  return { label: "Not started", tone: "muted" };
}

export function activationStatus(state: DashboardStateView): DashboardStatus {
  if (profileRestricted(state) || latestSubmissionStatus(state) === PaymentStatus.REJECTED) {
    return { label: "Restricted", tone: "danger" };
  }
  if (runtimeLive(state)) {
    return { label: "Complete", tone: "ok" };
  }
  if (activationSubmitted(state)) {
    return { label: "Under review", tone: "warn" };
  }
  if (latestSubmissionStatus(state) === PaymentStatus.PENDING) {
    return { label: "Under review", tone: "warn" };
  }
  if (hasActivationSignals(state)) {
    return { label: "In progress", tone: "warn" };
  }
  return { label: "Not started", tone: "muted" };
}

export function executionStatus(state: DashboardStateView): DashboardStatus {
  if (runtimeLive(state)) {
    return { label: "Live", tone: "ok" };
  }
  if (activationSubmitted(state) || latestSubmissionStatus(state) === PaymentStatus.PENDING || state.hasApprovedSubmission) {
    return { label: "Awaiting activation", tone: "warn" };
  }
  if (runtimePaused(state)) {
    return { label: "Paused", tone: "warn" };
  }
  return { label: "Not live", tone: "muted" };
}

export function dashboardStateLine(state: DashboardStateView) {
  if (isManagedFundsPlan(state)) {
    return state.user?.subscriptionActive
      ? "Managed Funds service access is active. Use the dashboard for billing status and support requests."
      : "Managed Funds service access is awaiting subscription confirmation.";
  }
  if (profileRestricted(state) || latestSubmissionStatus(state) === PaymentStatus.REJECTED) {
    return "A gate is blocking new Nister AI commands. Open the flagged item to see what needs attention.";
  }
  if (runtimeLive(state)) {
    return "All setup gates are valid. Nister AI is eligible to act only when a valid signal appears.";
  }
  if (activationSubmitted(state)) {
    return "Your environment is awaiting activation review.";
  }
  if (latestSubmissionStatus(state) === PaymentStatus.PENDING) {
    return "Your environment is awaiting activation review.";
  }
  return "Your environment is not ready for live execution yet.";
}

export function setupSteps(state: DashboardStateView): SetupStep[] {
  const activation = activationStatus(state).label;
  const needsMt5Ea = requiresMt5Ea(state);

  if (isManagedFundsPlan(state)) {
    return [
      {
        key: "verify_email",
        title: "Verify email",
        description: "Email verification must be complete before Managed Funds access can proceed.",
        complete: true,
        actionHref: "/dashboard/settings",
        actionLabel: "Review Details",
      },
      {
        key: "choose_operating_model",
        title: "Choose Managed Funds",
        description: "Managed Funds is the pooled managed-capital Forex service path.",
        complete: hasPlan(state),
        actionHref: "/dashboard/billing",
        actionLabel: "Review Plan",
      },
      {
        key: "confirm_subscription",
        title: "Confirm subscription",
        description: "Monthly service access must be active before Managed Funds support and operations can proceed.",
        complete: Boolean(state.user?.subscriptionActive),
        actionHref: "/dashboard/billing",
        actionLabel: "Review Billing",
      },
      {
        key: "support_ready",
        title: "Support access",
        description: "Use support for managed-capital funding, payout, and account-service questions.",
        complete: Boolean(state.user?.subscriptionActive),
        actionHref: "/dashboard/support",
        actionLabel: "Open Support",
      },
    ];
  }

  return [
    {
      key: "verify_email",
      title: "Verify email",
      description: "Email verification must be complete before activation can proceed.",
      complete: true,
      actionHref: "/dashboard/settings",
      actionLabel: "Review Details",
    },
    {
      key: "choose_operating_model",
      title: "Choose market and plan",
      description: "Select Starter when you want Nister AI to run through your own broker account and local environment.",
      complete: hasPlan(state),
      actionHref: "/dashboard/billing",
      actionLabel: "Save and Continue",
    },
    {
      key: "add_broker_details",
      title: "Add broker details",
      description: needsMt5Ea
        ? "Connect the broker account used for signal-gated execution."
        : "Broker details are handled in your market-specific runtime workflow.",
      complete: hasBrokerDetails(state),
      actionHref: needsMt5Ea ? "/dashboard/broker-accounts" : "/dashboard/support",
      actionLabel: needsMt5Ea ? "Save and Continue" : "Open Workflow",
    },
    {
      key: "complete_connection_setup",
      title: needsMt5Ea ? "Connect Nister AI App" : "Runtime connector",
      description: needsMt5Ea
        ? "Connect the Nister AI App and complete runtime preparation."
        : "This market uses a dedicated connector path, not Nister AI App setup.",
      complete: connectionSetupComplete(state),
      actionHref: needsMt5Ea ? "/dashboard/connect-app" : "/dashboard/support",
      actionLabel: needsMt5Ea ? "Save and Continue" : "Open Workflow",
    },
    {
      key: "submit_for_activation",
      title: "Submit for activation",
      description: "Submit your environment for activation review. Activation makes the account eligible for valid signals; it does not force an immediate trade.",
      complete: activation === "Under review" || activation === "Complete",
      actionHref: "/dashboard/setup",
      actionLabel: "Submit for Activation",
    },
  ];
}

export function setupProgress(state: DashboardStateView) {
  const steps = setupSteps(state);
  const completed = steps.filter((item) => item.complete).length;
  const total = steps.length;
  const percent = Math.round((completed / total) * 100);
  return {
    steps,
    completed,
    total,
    percent,
    label: `${completed} of ${total} complete`,
  };
}

export function systemReadiness(state: DashboardStateView): DashboardStatus {
  const activation = activationStatus(state).label as ActivationState;
  const broker = brokerConnectionStatus(state);

  if (isManagedFundsPlan(state)) {
    return state.user?.subscriptionActive ? { label: "Active", tone: "ok" } : { label: "Pending", tone: "warn" };
  }
  if (!state.user?.subscriptionActive) {
    return { label: "Pending", tone: "warn" };
  }
  if (broker.label === "Disconnected") {
    return { label: "Disconnected", tone: "warn" };
  }
  if (activation === "Restricted" || broker.label === "Attention needed") {
    return { label: "Attention needed", tone: "danger" };
  }
  if (runtimeLive(state)) {
    return { label: "Active", tone: "ok" };
  }
  if (activation === "Under review") {
    return { label: "Under review", tone: "warn" };
  }
  if (activation === "In progress") {
    return { label: "In progress", tone: "warn" };
  }
  return { label: "Not started", tone: "muted" };
}

export function dashboardHero(state: DashboardStateView): DashboardHero {
  const activation = activationStatus(state).label as ActivationState;

  if (isManagedFundsPlan(state)) {
    if (!state.user?.subscriptionActive) {
      return {
        title: "Confirm Managed Funds access",
        body: "Complete subscription payment to open the Managed Funds dashboard path for billing and support.",
        primaryCtaLabel: "Review Billing",
        primaryCtaHref: "/dashboard/billing",
      };
    }
    return {
      title: "Managed Funds service access is active",
      body: "Use the dashboard to review billing, support, and managed-capital service communications.",
      primaryCtaLabel: "Open Support",
      primaryCtaHref: "/dashboard/support",
    };
  }

  if (activation === "Not started") {
    return {
      title: "Begin activation",
      body: "Get your account eligible for Nister AI execution by finishing subscription, broker, app, activation, and risk-limit setup.",
      primaryCtaLabel: "Start Activation",
      primaryCtaHref: "/dashboard/setup",
    };
  }

  if (activation === "In progress") {
    return {
      title: "Complete the remaining steps",
      body: "Finish the required items below to move your environment toward activation.",
      primaryCtaLabel: "Continue Activation",
      primaryCtaHref: "/dashboard/setup",
    };
  }

  if (activation === "Under review") {
    return {
      title: "Your environment is under review",
      body: "Setup is complete and awaiting activation review.",
      primaryCtaLabel: "Review Activation",
      primaryCtaHref: "/dashboard/setup",
    };
  }

  if (activation === "Restricted") {
    return {
      title: "Resolve the flagged item",
      body: "Something is preventing activation or runtime from proceeding normally.",
      primaryCtaLabel: "Resolve Now",
      primaryCtaHref: "/dashboard/alerts",
    };
  }

  return {
    title: "Your account is eligible for valid signals",
    body: "Review setup gates, runtime condition, and account-linked activity below. Eligibility does not guarantee an immediate trade.",
    primaryCtaLabel: "View Execution Status",
    primaryCtaHref: "/dashboard/trading",
  };
}

export function dashboardBanner(state: DashboardStateView): DashboardBannerKey | null {
  const activation = activationStatus(state).label as ActivationState;
  const broker = brokerConnectionStatus(state);

  if (!state.user?.subscriptionActive) {
    return "subscription_issue";
  }
  if (broker.label === "Disconnected") {
    return "broker_not_connected";
  }
  if (activation === "Restricted" || broker.label === "Attention needed") {
    return "action_required";
  }
  if (runtimeLive(state)) {
    return "environment_active";
  }
  if (activation === "Under review") {
    return "under_review";
  }
  if (activation === "Not started" || activation === "In progress") {
    return "activation_incomplete";
  }
  return null;
}

function paymentTone(status: string): Tone {
  if (status === "APPROVED") {
    return "ok";
  }
  if (status === "REJECTED") {
    return "danger";
  }
  return "warn";
}

export function dashboardEvents(state: DashboardStateView): DashboardEvent[] {
  const notificationEvents: DashboardEvent[] = state.notifications.map((item) => ({
    id: `note-${item.id}`,
    title: item.title,
    detail: item.message,
    at: item.createdAt,
    tone: item.isRead ? "muted" : "ok",
  }));

  const paymentEvents: DashboardEvent[] = state.submissions.map((item) => ({
    id: `payment-${item.id}`,
    title: `Payment verification ${paymentStatusLabel(item.status)}`,
    detail: `${item.paymentMethod.symbol} ${item.paymentMethod.network} | ${item.txHash}`,
    at: item.submittedAt,
    tone: paymentTone(item.status),
  }));

  const referralEvents: DashboardEvent[] = state.referral.recentEarnings.map((item) => ({
    id: `ref-${item.id}`,
    title: `Referral commission ${referralStatusLabel(item.status)}`,
    detail: `${item.referredUser.name} | ${item.paymentSubmission.planSlug || "N/A"}`,
    at: item.createdAt,
    tone: item.status === "PAID" ? "ok" : item.status === "REVERSED" ? "danger" : "muted",
  }));

  return [...notificationEvents, ...paymentEvents, ...referralEvents].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function lastActivityAt(state: DashboardStateView) {
  return dashboardEvents(state)[0]?.at ?? null;
}
