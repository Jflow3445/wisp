import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
const AGENT_STALE_AFTER_MS = 5 * 60 * 1000;

export type ControlPlaneAgentView = {
  id: string;
  brokerAccountId: string;
  deviceName: string;
  hostType: "LOCAL" | "VPS";
  status: "ACTIVE" | "STANDBY" | "REVOKED" | "BLOCKED";
  isExecutionLeader: boolean;
  keyVersion: number;
  createdAt: Date;
  lastHeartbeatAt: Date | null;
  lastVersion: string | null;
  lastIp: string | null;
  latestHeartbeat: {
    sentAt: Date;
    connectedToTradeServer: boolean;
    tradeAllowedTerminal: boolean;
    tradeAllowedProgram: boolean;
    tradeAllowedAccount: boolean;
    tradeAllowedExpert: boolean;
  } | null;
};

export type ControlPlanePolicyView = {
  id: string;
  policyVersion: number;
  aiEnabled: boolean;
  closeOnlyMode: boolean;
  manualApprovalMode: boolean;
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxOpenTradesTotal: number;
  maxOpenTradesPerSymbol: number;
  maxSpreadPoints: number;
  maxSlippagePoints: number;
  weekendTradingAllowed: boolean;
  symbols: Array<{
    symbol: string;
    isAllowed: boolean;
  }>;
};

export type ControlPlaneBrokerAccountView = {
  id: string;
  brokerName: string;
  brokerServer: string;
  accountLogin: string;
  accountMode: "DEMO" | "REAL";
  status: "PENDING" | "ACTIVE" | "DISABLED";
  isActive: boolean;
  createdAt: Date;
  policy: ControlPlanePolicyView | null;
  agents: ControlPlaneAgentView[];
};

export type ControlPlaneEnrollmentTokenView = {
  id: string;
  brokerAccountId: string;
  brokerLabel: string;
  allowedHostType: "LOCAL" | "VPS" | null;
  allowLeader: boolean;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
};

export type ControlPlaneCommandView = {
  id: string;
  commandId: string;
  sequenceNo: bigint;
  brokerAccountId: string;
  brokerLabel: string;
  agentId: string;
  agentLabel: string;
  symbol: string;
  assetClass: string;
  commandType: string;
  side: string;
  leaseStatus: string;
  executionStatus: string;
  issuedAt: Date;
  expiresAt: Date;
  actionId: string;
  strategyId: string;
  modelId: string;
  modelVersion: string;
  latestReport: {
    executionResult: string;
    rejectionCode: string | null;
    brokerTicket: string | null;
    executionTime: Date;
    executionPrice: number | null;
    executionVolume: number | null;
  } | null;
  recentEvents: Array<{
    eventType: string;
    createdAt: Date;
  }>;
};

export type ControlPlanePositionRowView = {
  brokerTicket: string | null;
  symbol: string | null;
  side: string | null;
  volume: number | null;
  openPrice: number | null;
  sl: number | null;
  tp: number | null;
  openTime: string | null;
  currentProfit: number | null;
  clientPositionRef: string | null;
};

export type ControlPlaneSnapshotView = {
  id: string;
  brokerAccountId: string;
  brokerLabel: string;
  agentId: string;
  agentLabel: string;
  snapshotTime: Date;
  equity: number;
  balance: number;
  margin: number | null;
  freeMargin: number | null;
  positions: ControlPlanePositionRowView[];
};

export type ControlPlaneRiskEventView = {
  id: string;
  brokerAccountId: string;
  brokerLabel: string;
  symbol: string | null;
  eventType: string;
  severity: string;
  details: Record<string, unknown>;
  createdAt: Date;
};

export type ControlPlaneAlertView = {
  id: string;
  source: "RISK" | "AGENT" | "SYSTEM";
  severity: "INFO" | "WARN" | "CRITICAL";
  title: string;
  detail: string;
  at: Date;
  href: string | null;
};

export type UserControlPlaneStateView = {
  brokerAccounts: ControlPlaneBrokerAccountView[];
  enrollmentTokens: ControlPlaneEnrollmentTokenView[];
  commands: ControlPlaneCommandView[];
  snapshots: ControlPlaneSnapshotView[];
  riskEvents: ControlPlaneRiskEventView[];
  alerts: ControlPlaneAlertView[];
};

type ControlPlaneStateSlice = keyof UserControlPlaneStateView;
type ControlPlaneStateIncludeMap = Record<ControlPlaneStateSlice, boolean>;
type AlertAgentSource = Pick<ControlPlaneAgentView, "id" | "deviceName" | "hostType" | "status" | "createdAt" | "lastHeartbeatAt">;
type AlertAgentAccountSource = {
  createdAt: Date;
  agents: AlertAgentSource[];
};
type AlertRiskEventSource = Pick<
  ControlPlaneRiskEventView,
  "id" | "brokerLabel" | "symbol" | "eventType" | "severity" | "createdAt"
>;

export type GetUserControlPlaneStateOptions = {
  include?: Partial<ControlPlaneStateIncludeMap>;
};

const DEFAULT_CONTROL_PLANE_INCLUDE: ControlPlaneStateIncludeMap = {
  brokerAccounts: true,
  enrollmentTokens: true,
  commands: true,
  snapshots: true,
  riskEvents: true,
  alerts: true,
};

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  return Number(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asJsonRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function asJsonRecordArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as Record<string, unknown>[];
  }
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      rows.push(item as Record<string, unknown>);
    }
  }
  return rows;
}

function formatBrokerLabel(brokerName: string, brokerServer: string, accountLogin: string) {
  return `${brokerName} | ${brokerServer} | ${accountLogin}`;
}

function mapSeverityToAlert(severity: string): "INFO" | "WARN" | "CRITICAL" {
  const normalized = severity.toUpperCase();
  if (normalized === "CRITICAL" || normalized === "HIGH") {
    return "CRITICAL";
  }
  if (normalized === "WARN" || normalized === "WARNING" || normalized === "MEDIUM") {
    return "WARN";
  }
  return "INFO";
}

function normalizeControlPlaneInclude(options?: GetUserControlPlaneStateOptions): ControlPlaneStateIncludeMap {
  if (!options?.include) {
    return DEFAULT_CONTROL_PLANE_INCLUDE;
  }

  return {
    brokerAccounts: options.include.brokerAccounts === true,
    enrollmentTokens: options.include.enrollmentTokens === true,
    commands: options.include.commands === true,
    snapshots: options.include.snapshots === true,
    riskEvents: options.include.riskEvents === true,
    alerts: options.include.alerts === true,
  };
}

function emptyState(): UserControlPlaneStateView {
  return {
    brokerAccounts: [],
    enrollmentTokens: [],
    commands: [],
    snapshots: [],
    riskEvents: [],
    alerts: [],
  };
}

function toAlertAgentAccounts(accounts: ControlPlaneBrokerAccountView[]): AlertAgentAccountSource[] {
  return accounts.map((account) => ({
    createdAt: account.createdAt,
    agents: account.agents.map((agent) => ({
      id: agent.id,
      deviceName: agent.deviceName,
      hostType: agent.hostType,
      status: agent.status,
      createdAt: agent.createdAt,
      lastHeartbeatAt: agent.lastHeartbeatAt,
    })),
  }));
}

const loadBrokerAccounts = cache(async (userId: string): Promise<ControlPlaneBrokerAccountView[]> => {
  const accountsRaw = await prisma.brokerAccount.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      policy: {
        include: {
          symbols: {
            orderBy: [{ symbol: "asc" }],
          },
        },
      },
      agents: {
        orderBy: [{ isExecutionLeader: "desc" }, { updatedAt: "desc" }],
        include: {
          heartbeats: {
            orderBy: [{ sentAt: "desc" }],
            take: 1,
            select: {
              sentAt: true,
              connectedToTradeServer: true,
              tradeAllowedTerminal: true,
              tradeAllowedProgram: true,
              tradeAllowedAccount: true,
              tradeAllowedExpert: true,
            },
          },
        },
      },
    },
  });

  return accountsRaw.map((account) => ({
    id: account.id,
    brokerName: account.brokerName,
    brokerServer: account.brokerServer,
    accountLogin: account.accountLogin,
    accountMode: account.accountMode,
    status: account.status,
    isActive: account.isActive,
    createdAt: account.createdAt,
    policy: account.policy
      ? {
          id: account.policy.id,
          policyVersion: account.policy.policyVersion,
          aiEnabled: account.policy.aiEnabled,
          closeOnlyMode: account.policy.closeOnlyMode,
          manualApprovalMode: account.policy.manualApprovalMode,
          maxRiskPerTradePct: Number(account.policy.maxRiskPerTradePct),
          maxDailyLossPct: Number(account.policy.maxDailyLossPct),
          maxOpenTradesTotal: account.policy.maxOpenTradesTotal,
          maxOpenTradesPerSymbol: account.policy.maxOpenTradesPerSymbol,
          maxSpreadPoints: account.policy.maxSpreadPoints,
          maxSlippagePoints: account.policy.maxSlippagePoints,
          weekendTradingAllowed: account.policy.weekendTradingAllowed,
          symbols: account.policy.symbols.map((symbol) => ({
            symbol: symbol.symbol,
            isAllowed: symbol.isAllowed,
          })),
        }
      : null,
    agents: account.agents.map((agent) => ({
      id: agent.id,
      brokerAccountId: account.id,
      deviceName: agent.deviceName,
      hostType: agent.hostType,
      status: agent.status,
      isExecutionLeader: agent.isExecutionLeader,
      keyVersion: agent.keyVersion,
      createdAt: agent.createdAt,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      lastVersion: agent.lastVersion,
      lastIp: agent.lastIp,
      latestHeartbeat: agent.heartbeats[0]
        ? {
            sentAt: agent.heartbeats[0].sentAt,
            connectedToTradeServer: agent.heartbeats[0].connectedToTradeServer,
            tradeAllowedTerminal: agent.heartbeats[0].tradeAllowedTerminal,
            tradeAllowedProgram: agent.heartbeats[0].tradeAllowedProgram,
            tradeAllowedAccount: agent.heartbeats[0].tradeAllowedAccount,
            tradeAllowedExpert: agent.heartbeats[0].tradeAllowedExpert,
          }
        : null,
    })),
  }));
});

const loadAlertAgentAccounts = cache(async (userId: string): Promise<AlertAgentAccountSource[]> => {
  const accountsRaw = await prisma.brokerAccount.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    select: {
      createdAt: true,
      agents: {
        orderBy: [{ isExecutionLeader: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          deviceName: true,
          hostType: true,
          status: true,
          createdAt: true,
          lastHeartbeatAt: true,
        },
      },
    },
  });

  return accountsRaw.map((account) => ({
    createdAt: account.createdAt,
    agents: account.agents.map((agent) => ({
      id: agent.id,
      deviceName: agent.deviceName,
      hostType: agent.hostType,
      status: agent.status,
      createdAt: agent.createdAt,
      lastHeartbeatAt: agent.lastHeartbeatAt,
    })),
  }));
});

const loadEnrollmentTokens = cache(async (userId: string): Promise<ControlPlaneEnrollmentTokenView[]> => {
  const tokensRaw = await prisma.enrollmentToken.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    take: 80,
    include: {
      brokerAccount: {
        select: {
          id: true,
          brokerName: true,
          brokerServer: true,
          accountLogin: true,
        },
      },
    },
  });

  return tokensRaw.map((token) => ({
    id: token.id,
    brokerAccountId: token.brokerAccountId,
    brokerLabel: formatBrokerLabel(
      token.brokerAccount.brokerName,
      token.brokerAccount.brokerServer,
      token.brokerAccount.accountLogin,
    ),
    allowedHostType: token.allowedHostType,
    allowLeader: token.allowLeader,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    usedAt: token.usedAt,
  }));
});

const loadCommands = cache(async (userId: string): Promise<ControlPlaneCommandView[]> => {
  const commandsRaw = await prisma.publishedCommand.findMany({
    where: { userId },
    orderBy: [{ issuedAt: "desc" }],
    take: 200,
    include: {
      brokerAccount: {
        select: {
          id: true,
          brokerName: true,
          brokerServer: true,
          accountLogin: true,
        },
      },
      action: {
        select: {
          actionId: true,
          strategyId: true,
          modelId: true,
          modelVersion: true,
        },
      },
      agent: {
        select: {
          id: true,
          deviceName: true,
        },
      },
      reports: {
        orderBy: [{ executionTime: "desc" }],
        take: 1,
        select: {
          executionResult: true,
          rejectionCode: true,
          brokerTicket: true,
          executionTime: true,
          executionPrice: true,
          executionVolume: true,
        },
      },
      events: {
        orderBy: [{ createdAt: "desc" }],
        take: 3,
        select: {
          eventType: true,
          createdAt: true,
        },
      },
    },
  });

  return commandsRaw.map((row) => ({
    id: row.id,
    commandId: row.commandId,
    sequenceNo: row.sequenceNo,
    brokerAccountId: row.brokerAccountId,
    brokerLabel: formatBrokerLabel(row.brokerAccount.brokerName, row.brokerAccount.brokerServer, row.brokerAccount.accountLogin),
    agentId: row.agentId,
    agentLabel: row.agent.deviceName,
    symbol: row.symbol,
    assetClass: row.assetClass,
    commandType: row.commandType,
    side: row.side,
    leaseStatus: row.leaseStatus,
    executionStatus: row.executionStatus,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    actionId: row.action.actionId,
    strategyId: row.action.strategyId,
    modelId: row.action.modelId,
    modelVersion: row.action.modelVersion,
    latestReport: row.reports[0]
      ? {
          executionResult: row.reports[0].executionResult,
          rejectionCode: row.reports[0].rejectionCode,
          brokerTicket: row.reports[0].brokerTicket,
          executionTime: row.reports[0].executionTime,
          executionPrice: decimalToNumber(row.reports[0].executionPrice),
          executionVolume: decimalToNumber(row.reports[0].executionVolume),
        }
      : null,
    recentEvents: row.events.map((event) => ({
      eventType: event.eventType,
      createdAt: event.createdAt,
    })),
  }));
});

const loadSnapshots = cache(async (userId: string): Promise<ControlPlaneSnapshotView[]> => {
  const snapshotsRaw = await prisma.positionSnapshot.findMany({
    where: {
      brokerAccount: {
        userId,
      },
    },
    orderBy: [{ snapshotTime: "desc" }],
    take: 80,
    include: {
      brokerAccount: {
        select: {
          id: true,
          brokerName: true,
          brokerServer: true,
          accountLogin: true,
        },
      },
      agent: {
        select: {
          id: true,
          deviceName: true,
        },
      },
    },
  });

  return snapshotsRaw.map((snapshot) => {
    const positions = asJsonRecordArray(snapshot.positionsJson).map((row) => ({
      brokerTicket: asString(row.broker_ticket),
      symbol: asString(row.symbol),
      side: asString(row.side),
      volume: asNumber(row.volume),
      openPrice: asNumber(row.open_price),
      sl: asNumber(row.sl),
      tp: asNumber(row.tp),
      openTime: asString(row.open_time),
      currentProfit: asNumber(row.current_profit),
      clientPositionRef: asString(row.client_position_ref),
    }));

    return {
      id: snapshot.id,
      brokerAccountId: snapshot.brokerAccountId,
      brokerLabel: formatBrokerLabel(
        snapshot.brokerAccount.brokerName,
        snapshot.brokerAccount.brokerServer,
        snapshot.brokerAccount.accountLogin,
      ),
      agentId: snapshot.agentId,
      agentLabel: snapshot.agent.deviceName,
      snapshotTime: snapshot.snapshotTime,
      equity: Number(snapshot.equity),
      balance: Number(snapshot.balance),
      margin: decimalToNumber(snapshot.margin),
      freeMargin: decimalToNumber(snapshot.freeMargin),
      positions,
    };
  });
});

const loadRiskEvents = cache(async (userId: string): Promise<ControlPlaneRiskEventView[]> => {
  const riskEventsRaw = await prisma.riskEvent.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    take: 120,
    include: {
      brokerAccount: {
        select: {
          id: true,
          brokerName: true,
          brokerServer: true,
          accountLogin: true,
        },
      },
    },
  });

  return riskEventsRaw.map((row) => ({
    id: row.id,
    brokerAccountId: row.brokerAccountId,
    brokerLabel: formatBrokerLabel(
      row.brokerAccount.brokerName,
      row.brokerAccount.brokerServer,
      row.brokerAccount.accountLogin,
    ),
    symbol: row.symbol,
    eventType: row.eventType,
    severity: row.severity,
    details: asJsonRecord(row.detailsJson),
    createdAt: row.createdAt,
  }));
});

const loadAlertRiskEvents = cache(async (userId: string): Promise<AlertRiskEventSource[]> => {
  const riskEventsRaw = await prisma.riskEvent.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    take: 120,
    select: {
      id: true,
      symbol: true,
      eventType: true,
      severity: true,
      createdAt: true,
      brokerAccount: {
        select: {
          brokerName: true,
          brokerServer: true,
          accountLogin: true,
        },
      },
    },
  });

  return riskEventsRaw.map((row) => ({
    id: row.id,
    brokerLabel: formatBrokerLabel(row.brokerAccount.brokerName, row.brokerAccount.brokerServer, row.brokerAccount.accountLogin),
    symbol: row.symbol,
    eventType: row.eventType,
    severity: row.severity,
    createdAt: row.createdAt,
  }));
});

const loadAlertNotifications = cache(async (userId: string) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    take: 60,
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      createdAt: true,
      href: true,
      isRead: true,
    },
  });
});

function buildAlerts(input: {
  riskEvents: AlertRiskEventSource[];
  agentAccounts: AlertAgentAccountSource[];
  notifications: Awaited<ReturnType<typeof loadAlertNotifications>>;
}): ControlPlaneAlertView[] {
  const now = Date.now();
  const alerts: ControlPlaneAlertView[] = [];

  for (const risk of input.riskEvents) {
    alerts.push({
      id: `risk-${risk.id}`,
      source: "RISK",
      severity: mapSeverityToAlert(risk.severity),
      title: `${risk.eventType.replaceAll("_", " ")}`,
      detail: `${risk.brokerLabel}${risk.symbol ? ` | ${risk.symbol}` : ""}`,
      at: risk.createdAt,
      href: "/dashboard/risk-controls",
    });
  }

  for (const account of input.agentAccounts) {
    for (const agent of account.agents) {
      if (!agent.lastHeartbeatAt) {
        alerts.push({
          id: `agent-missing-heartbeat-${agent.id}`,
          source: "AGENT",
          severity: "WARN",
          title: "Agent heartbeat missing",
          detail: `${agent.deviceName} (${agent.hostType}) has not reported heartbeat yet.`,
          at: agent.createdAt ?? account.createdAt,
          href: "/dashboard/devices",
        });
        continue;
      }
      if (now - agent.lastHeartbeatAt.getTime() > AGENT_STALE_AFTER_MS && agent.status === "ACTIVE") {
        alerts.push({
          id: `agent-stale-${agent.id}`,
          source: "AGENT",
          severity: "WARN",
          title: "Agent heartbeat stale",
          detail: `${agent.deviceName} last heartbeat at ${agent.lastHeartbeatAt.toLocaleString()}`,
          at: agent.lastHeartbeatAt,
          href: "/dashboard/devices",
        });
      }
    }
  }

  for (const note of input.notifications) {
    if (note.isRead) {
      continue;
    }
    alerts.push({
      id: `system-${note.id}`,
      source: "SYSTEM",
      severity: note.type === "SUPPORT" ? "INFO" : "WARN",
      title: note.title,
      detail: note.message,
      at: note.createdAt,
      // Older notifications can reference a service page that was never shipped.
      // Keep the alert actionable through the existing support workflow.
      href: note.href?.split(/[?#]/)[0] === "/dashboard/managed-funds"
        ? "/dashboard/support"
        : note.href || "/dashboard/activity",
    });
  }

  alerts.sort((a, b) => b.at.getTime() - a.at.getTime());

  return alerts;
}

const getUserControlPlaneStateCached = cache(
  async (
    userId: string,
    brokerAccountsIncluded: boolean,
    enrollmentTokensIncluded: boolean,
    commandsIncluded: boolean,
    snapshotsIncluded: boolean,
    riskEventsIncluded: boolean,
    alertsIncluded: boolean,
  ): Promise<UserControlPlaneStateView> => {
    if (!hasDatabaseConfig) {
      return emptyState();
    }

    const brokerAccountsPromise = brokerAccountsIncluded
      ? loadBrokerAccounts(userId)
      : Promise.resolve([] as ControlPlaneBrokerAccountView[]);
    const riskEventsPromise = riskEventsIncluded
      ? loadRiskEvents(userId)
      : Promise.resolve([] as ControlPlaneRiskEventView[]);
    const alertAgentAccountsPromise = alertsIncluded
      ? (brokerAccountsIncluded
          ? brokerAccountsPromise.then((rows) => toAlertAgentAccounts(rows))
          : loadAlertAgentAccounts(userId))
      : Promise.resolve([] as AlertAgentAccountSource[]);
    const alertRiskEventsPromise = alertsIncluded
      ? (riskEventsIncluded
          ? riskEventsPromise.then((rows) => rows as AlertRiskEventSource[])
          : loadAlertRiskEvents(userId))
      : Promise.resolve([] as AlertRiskEventSource[]);
    const alertNotificationsPromise = alertsIncluded
      ? loadAlertNotifications(userId)
      : Promise.resolve([] as Awaited<ReturnType<typeof loadAlertNotifications>>);

    const [brokerAccounts, enrollmentTokens, commands, snapshots, riskEvents, alertAgentAccounts, alertRiskEvents, alertNotifications] =
      await Promise.all([
        brokerAccountsPromise,
        enrollmentTokensIncluded ? loadEnrollmentTokens(userId) : Promise.resolve([] as ControlPlaneEnrollmentTokenView[]),
        commandsIncluded ? loadCommands(userId) : Promise.resolve([] as ControlPlaneCommandView[]),
        snapshotsIncluded ? loadSnapshots(userId) : Promise.resolve([] as ControlPlaneSnapshotView[]),
        riskEventsPromise,
        alertAgentAccountsPromise,
        alertRiskEventsPromise,
        alertNotificationsPromise,
      ]);

    return {
      brokerAccounts,
      enrollmentTokens,
      commands,
      snapshots,
      riskEvents,
      alerts: alertsIncluded
        ? buildAlerts({
            riskEvents: alertRiskEvents,
            agentAccounts: alertAgentAccounts,
            notifications: alertNotifications,
          })
        : [],
    };
  },
);

export async function getUserControlPlaneState(
  userId: string,
  options?: GetUserControlPlaneStateOptions,
): Promise<UserControlPlaneStateView> {
  const include = normalizeControlPlaneInclude(options);

  return getUserControlPlaneStateCached(
    userId,
    include.brokerAccounts,
    include.enrollmentTokens,
    include.commands,
    include.snapshots,
    include.riskEvents,
    include.alerts,
  );
}
