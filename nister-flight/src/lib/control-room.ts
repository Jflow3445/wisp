import { selectedDashboardPlan } from "@/lib/dashboard-view";
import { AutomationMarket } from "@prisma/client";
import type { UserControlPlaneStateView } from "@/lib/control-plane-view";
import { activationStatus, brokerConnectionStatus, executionStatus } from "@/lib/dashboard-view";
import { isMarketEnabled, isWaitlistEnrollmentStatus, resolveUserFocusMarket } from "@/lib/market-access";
import type { DashboardStateView } from "@/lib/site";

const AGENT_STALE_AFTER_MS = 5 * 60 * 1000;

export type ControlRoomIssueSeverity = "blocker" | "warning" | "review";
export type ControlRoomStatusLabel = "All systems active" | "Action required" | "Under review";

export type ControlRoomIssue = {
  key: string;
  severity: ControlRoomIssueSeverity;
  priority: number;
  title: string;
  detail: string;
  route: string;
  navLabel: string;
  navHint: string;
};

export type ControlRoomNavItem = {
  href: string;
  label: string;
  hint: string;
};

export type ControlRoomNavSection = {
  label: string;
  items: ControlRoomNavItem[];
  defaultOpen?: boolean;
};

export type ControlRoomSnapshot = {
  statusLabel: ControlRoomStatusLabel;
  statusDetail: string;
  issues: ControlRoomIssue[];
  issueCount: number;
  fixNowHref: string;
  fixNowLabel: string;
  issueNavItems: ControlRoomNavItem[];
  brokerStatusLabel: string;
  activationStatusLabel: string;
  executionStatusLabel: string;
  connectedAgents: number;
  leaderAgents: number;
  policyWarningCount: number;
  commandErrorCount: number;
  staleAgentCount: number;
};

function pushIssue(target: ControlRoomIssue[], issue: ControlRoomIssue) {
  if (target.some((row) => row.key === issue.key)) {
    return;
  }
  target.push(issue);
}

function severityRank(input: ControlRoomIssueSeverity) {
  if (input === "blocker") {
    return 0;
  }
  if (input === "warning") {
    return 1;
  }
  return 2;
}

function uniqueIssueRoutes(issues: ControlRoomIssue[]) {
  const seen = new Set<string>();
  const rows: ControlRoomNavItem[] = [];
  for (const issue of issues) {
    if (seen.has(issue.route)) {
      continue;
    }
    seen.add(issue.route);
    rows.push({
      href: issue.route,
      label: issue.navLabel,
      hint: issue.navHint,
    });
  }
  return rows;
}

function selectedBrokerFromControlPlane(
  controlPlane: UserControlPlaneStateView,
  preferredBrokerId: string | null,
) {
  if (!controlPlane.brokerAccounts.length) {
    return null;
  }
  if (preferredBrokerId) {
    const selected = controlPlane.brokerAccounts.find((row) => row.id === preferredBrokerId);
    if (selected) {
      return selected;
    }
  }
  return controlPlane.brokerAccounts[0];
}

function countCommandErrors(controlPlane: UserControlPlaneStateView) {
  const commandFailureStates = new Set(["FAILED", "REJECTED", "ERROR", "EXPIRED", "TIMED_OUT", "CANCELLED"]);
  return controlPlane.commands.filter((command) => {
    const latestResult = String(command.latestReport?.executionResult || "").trim().toUpperCase();
    const latestRejected = Boolean(command.latestReport?.rejectionCode);
    const executionStatus = String(command.executionStatus || "").trim().toUpperCase();
    const leaseStatus = String(command.leaseStatus || "").trim().toUpperCase();
    return (
      latestRejected ||
      commandFailureStates.has(latestResult) ||
      commandFailureStates.has(executionStatus) ||
      commandFailureStates.has(leaseStatus)
    );
  }).length;
}

function countPolicyWarnings(controlPlane: UserControlPlaneStateView) {
  let count = 0;
  for (const account of controlPlane.brokerAccounts) {
    const policy = account.policy;
    if (!policy) {
      count += 1;
      continue;
    }
    if (!policy.aiEnabled || policy.closeOnlyMode) {
      count += 1;
    }
  }
  return count;
}

function summarizeSelectedBrokerHeartbeats(
  selectedBroker: UserControlPlaneStateView["brokerAccounts"][number] | null,
) {
  const now = Date.now();
  let staleActiveCount = 0;
  let freshActiveLeaderCount = 0;
  if (!selectedBroker) {
    return {
      staleActiveCount,
      freshActiveLeaderCount,
    };
  }

  for (const agent of selectedBroker.agents) {
    if (!agent.lastHeartbeatAt || agent.status !== "ACTIVE") {
      continue;
    }
    if (now - agent.lastHeartbeatAt.getTime() > AGENT_STALE_AFTER_MS) {
      staleActiveCount += 1;
      continue;
    }
    if (agent.isExecutionLeader) {
      freshActiveLeaderCount += 1;
    }
  }
  return {
    staleActiveCount,
    freshActiveLeaderCount,
  };
}

function selectedMarket(state: DashboardStateView) {
  return resolveUserFocusMarket({
    preferredMarket: state.preference?.preferredMarket,
    subscriptionMarket: state.user?.subscription?.plan.automationMarket,
    subscriptionActive: state.user?.subscriptionActive,
    fallbackMarket: AutomationMarket.FOREX,
  });
}

function waitlistOnlyMode(state: DashboardStateView) {
  const market = selectedMarket(state);
  const enabled = isMarketEnabled(state.settings, market);
  const enrollment = state.user?.marketEnrollments.find((row) => row.market === market) || null;
  const joined = Boolean(enrollment && isWaitlistEnrollmentStatus(enrollment.status));
  return {
    market,
    enabled,
    joined,
    waitlistOnly: !enabled && joined,
  };
}

function statusFromIssues(issues: ControlRoomIssue[]): {
  statusLabel: ControlRoomStatusLabel;
  statusDetail: string;
} {
  if (!issues.length) {
    return {
      statusLabel: "All systems active",
      statusDetail:
        "Subscription, broker, app connection, activation, and risk limits are ready. Nister AI may still wait for a valid signal.",
    };
  }
  if (issues.some((issue) => issue.severity === "blocker" || issue.severity === "warning")) {
    return {
      statusLabel: "Action required",
      statusDetail: "Clear the open item before Nister AI can receive new eligible commands.",
    };
  }
  return {
    statusLabel: "Under review",
    statusDetail: "Your environment is submitted and currently under review.",
  };
}

export function buildControlRoomSnapshot(
  dashboardState: DashboardStateView,
  controlPlaneState: UserControlPlaneStateView,
): ControlRoomSnapshot {
  const issues: ControlRoomIssue[] = [];
  const marketState = waitlistOnlyMode(dashboardState);
  const waitlistOnly = marketState.waitlistOnly;
  const requiresMt5Ea = marketState.market === AutomationMarket.FOREX && selectedDashboardPlan(dashboardState)?.productKind !== "MANAGED_FUNDS";
  const brokerStatusLabel = waitlistOnly || !requiresMt5Ea ? "Not required" : brokerConnectionStatus(dashboardState).label;
  const activationStatusLabel = waitlistOnly ? "Waiting for launch" : activationStatus(dashboardState).label;
  const executionStatusLabel = waitlistOnly ? "Waitlist" : executionStatus(dashboardState).label;
  const selectedBrokerId = dashboardState.activeBrokerAccount?.id || null;
  const selectedBroker = selectedBrokerFromControlPlane(controlPlaneState, selectedBrokerId);
  const connectedAgents = selectedBroker
    ? selectedBroker.agents.filter((agent) => Boolean(agent.lastHeartbeatAt)).length
    : 0;
  const leaderAgents = selectedBroker
    ? selectedBroker.agents.filter((agent) => agent.status === "ACTIVE" && agent.isExecutionLeader && Boolean(agent.lastHeartbeatAt)).length
    : 0;

  const policyWarningCount = requiresMt5Ea ? countPolicyWarnings(controlPlaneState) : 0;
  const commandErrorCount = requiresMt5Ea ? countCommandErrors(controlPlaneState) : 0;
  const staleHeartbeatSummary = summarizeSelectedBrokerHeartbeats(selectedBroker);
  const staleAgentCount = staleHeartbeatSummary.staleActiveCount;
  const selectedBrokerHasFreshExecutionLeader = staleHeartbeatSummary.freshActiveLeaderCount > 0;

  if (waitlistOnly) {
    pushIssue(issues, {
      key: "market_waitlist",
      severity: "review",
      priority: 5,
      title: "Market waitlist enrollment active",
      detail: "This automation market is still in staged rollout. Full execution setup is not required until access opens.",
      route: "/dashboard/billing",
      navLabel: "Billing",
      navHint: "Track waitlist and annual prepay status for this market.",
    });
  } else if (!dashboardState.user?.subscriptionActive) {
    pushIssue(issues, {
      key: "subscription_inactive",
      severity: "blocker",
      priority: 5,
      title: "Billing needs attention",
      detail: "Subscription status is not active, so Nister AI cannot issue new commands.",
      route: "/dashboard/billing",
      navLabel: "Billing",
      navHint: "Resolve billing or subscription status before execution continues.",
    });
  }

  if (requiresMt5Ea && !waitlistOnly && (!dashboardState.activeBrokerAccount || brokerStatusLabel !== "Connected")) {
    pushIssue(issues, {
      key: "broker_disconnected",
      severity: "blocker",
      priority: 10,
      title: "Broker environment disconnected",
      detail: "No approved broker account is available for execution.",
      route: "/dashboard/broker-accounts",
      navLabel: "Broker Environment",
      navHint: "Reconnect the broker account used for autonomous execution.",
    });
  }

  if (requiresMt5Ea && !waitlistOnly && dashboardState.activeBrokerAccount && (connectedAgents < 1 || leaderAgents < 1)) {
    pushIssue(issues, {
      key: connectedAgents < 1 ? "ea_not_connected" : "ea_no_leader",
      severity: "blocker",
      priority: 20,
      title: connectedAgents < 1 ? "Nister AI App not connected" : "No sender app assigned",
      detail:
        connectedAgents < 1
          ? "No connected Nister AI App heartbeat detected for the selected broker account."
          : "Nister AI App is connected but no command-ready connection is assigned.",
      route: connectedAgents < 1 ? "/dashboard/connect-app" : "/dashboard/connect-app",
      navLabel: "Connect",
      navHint:
        connectedAgents < 1
          ? "Reconnect your MetaTrader terminal (MT5/MT4) and verify Nister AI App heartbeat."
          : "Reconnect the Nister AI App and refresh the command-ready connection for this broker account.",
    });
  }

  if (requiresMt5Ea && !waitlistOnly && activationStatusLabel === "Under review") {
    pushIssue(issues, {
      key: "activation_under_review",
      severity: "review",
      priority: 30,
      title: "Activation under review",
      detail: "Your activation request is pending review.",
      route: "/dashboard/setup",
      navLabel: "Activation",
      navHint: "Review activation submission status.",
    });
  } else if (requiresMt5Ea && !waitlistOnly && activationStatusLabel !== "Complete") {
    pushIssue(issues, {
      key: "activation_incomplete",
      severity: "blocker",
      priority: 30,
      title: "Activation incomplete",
      detail: "Complete all activation requirements before live execution.",
      route: "/dashboard/setup",
      navLabel: "Activation",
      navHint: "Finish required setup and submit for activation.",
    });
  }

  if (requiresMt5Ea && !waitlistOnly && policyWarningCount > 0) {
    pushIssue(issues, {
      key: "policy_mismatch",
      severity: "warning",
      priority: 40,
      title: "Policy mismatch detected",
      detail: "One or more risk policy settings may be preventing new commands.",
      route: "/dashboard/risk-controls",
      navLabel: "Risk Controls",
      navHint: "Review risk policy and execution guardrails.",
    });
  }

  if (requiresMt5Ea && !waitlistOnly && commandErrorCount > 0) {
    pushIssue(issues, {
      key: "command_runtime_errors",
      severity: "warning",
      priority: 40,
      title: "Command runtime errors detected",
      detail: `${commandErrorCount} command(s) show rejection or execution failure signals.`,
      route: "/dashboard/commands",
      navLabel: "Execution Commands",
      navHint: "Inspect command ACK and execution outcomes.",
    });
  }

  if (requiresMt5Ea && !waitlistOnly && staleAgentCount > 0 && !selectedBrokerHasFreshExecutionLeader) {
    pushIssue(issues, {
      key: "stale_heartbeat",
      severity: "warning",
      priority: 50,
      title: "Nister AI App heartbeat warnings",
      detail: `${staleAgentCount} active Nister AI App device(s) have stale heartbeats.`,
      route: "/dashboard/connect-app",
      navLabel: "Connect",
      navHint: "Review stale heartbeat warnings and reconnect the Nister AI App terminal.",
    });
  }

  const nonBlockingAlert = controlPlaneState.alerts.find(
    (alert) => alert.severity === "WARN" && alert.source === "SYSTEM",
  );
  if (!waitlistOnly && nonBlockingAlert) {
    pushIssue(issues, {
      key: "non_blocking_warning",
      severity: "warning",
      priority: 50,
      title: "Non-blocking warnings detected",
      detail: "There are recent warnings that should be reviewed.",
      route: nonBlockingAlert.href || "/dashboard/activity",
      navLabel: "Warnings",
      navHint: "Review warning details and clear unresolved alerts.",
    });
  }

  issues.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    const severityDelta = severityRank(a.severity) - severityRank(b.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return a.title.localeCompare(b.title);
  });

  const issueNavItems = uniqueIssueRoutes(issues);
  const status = statusFromIssues(issues);

  return {
    statusLabel: status.statusLabel,
    statusDetail: status.statusDetail,
    issues,
    issueCount: issues.length,
    fixNowHref: waitlistOnly ? "/dashboard/billing" : issues[0]?.route || "/dashboard/positions",
    fixNowLabel: waitlistOnly ? "View waitlist status" : issues.length ? "Review open item" : "Review broker snapshots",
    issueNavItems,
    brokerStatusLabel,
    activationStatusLabel,
    executionStatusLabel,
    connectedAgents,
    leaderAgents,
    policyWarningCount,
    commandErrorCount,
    staleAgentCount,
  };
}

export function buildControlRoomSidebarModel(input: {
  onboardingComplete: boolean;
  requiresMt5Ea?: boolean;
  controlRoom: ControlRoomSnapshot;
}): {
  primaryItem: ControlRoomNavItem;
  coreItems: ControlRoomNavItem[];
  setupSection: ControlRoomNavSection | null;
  issueSection: ControlRoomNavSection | null;
  footerItems: ControlRoomNavItem[];
} {
  const primaryItem: ControlRoomNavItem = {
    href: "/dashboard",
    label: "Control Room",
    hint: "Review system status and resolve missing items.",
  };

  const requiresMt5Ea = input.requiresMt5Ea !== false;

  const coreItems: ControlRoomNavItem[] = [
    ...(requiresMt5Ea
      ? [{ href: "/dashboard/connect-app", label: "Connect", hint: "Verify the Nister AI App connection gate." }]
      : []),
    ...(requiresMt5Ea ? [
      { href: "/dashboard/risk-controls", label: "Risk Controls", hint: "Set the risk policy gate before commands are eligible." },
      { href: "/dashboard/positions", label: "Live Positions", hint: "Review broker snapshots and open exposure." },
    ] : []),
    { href: "/dashboard/activity", label: "Activity", hint: "Review account events, payment history, and system actions." },
    { href: "/dashboard/partners", label: "Partner Program", hint: "Manage your referral link, commission tracking, and payout settings." },
    { href: "/dashboard/billing", label: "Billing", hint: "Resolve the subscription gate and billing credit." },
    { href: "/dashboard/support", label: "Support", hint: "Ask about setup, billing, broker, runtime, or no-trade questions." },
    { href: "/dashboard/settings", label: "Settings", hint: "Manage account, profile, and preferences." },
  ];

  const setupSection: ControlRoomNavSection | null = input.onboardingComplete
    ? null
    : {
        label: "Setup",
        defaultOpen: true,
        items: [
          { href: "/dashboard/setup", label: "Activation", hint: "Review activation before live commands are eligible." },
          ...(requiresMt5Ea
            ? [
                { href: "/dashboard/broker-accounts", label: "Broker Environment", hint: "Link the approved broker account used for execution." },
                { href: "/dashboard/connect-app", label: "Connect", hint: "Install and connect the Nister AI App runtime." },
                { href: "/dashboard/devices", label: "App Devices", hint: "Inspect connected devices and primary sender status." },
              ]
            : []),
        ],
      };

  const issueSection: ControlRoomNavSection | null =
    input.onboardingComplete && input.controlRoom.issueCount > 0
      ? {
          label: `Setup Issues (${input.controlRoom.issueCount})`,
          defaultOpen: true,
          items: input.controlRoom.issueNavItems,
        }
      : null;

  return {
    primaryItem,
    coreItems,
    setupSection,
    issueSection,
    footerItems: [],
  };
}
