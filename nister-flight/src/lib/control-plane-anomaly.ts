import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/control-plane";
import { prisma } from "@/lib/prisma";

type ControlPlaneAnomalyScanOptions = {
  persist?: boolean;
  actorType?: string;
  actorId?: string;
  staleAfterMinutes?: number;
  rejectWindowMinutes?: number;
  rejectRateThreshold?: number;
  minReportsForRejectSpike?: number;
};

type StaleAgentFinding = {
  agent_id: string;
  user_id: string;
  broker_account_id: string;
  device_name: string;
  host_type: string;
  status: string;
  last_heartbeat_at: string | null;
  stale_minutes: number | null;
};

type LeaderConflictFinding = {
  broker_account_id: string;
  user_id: string;
  broker_server: string;
  account_login: string;
  leader_count: number;
  leader_agents: Array<{
    agent_id: string;
    device_name: string;
    last_heartbeat_at: string | null;
  }>;
};

type RejectSpikeFinding = {
  broker_account_id: string;
  user_id: string;
  total_reports: number;
  rejected_reports: number;
  reject_rate: number;
};

export type ControlPlaneAnomalyScanResult = {
  scanned_at: string;
  stale_after_minutes: number;
  reject_window_minutes: number;
  reject_rate_threshold: number;
  min_reports_for_reject_spike: number;
  persist_enabled: boolean;
  persisted_risk_events: number;
  counts: {
    stale_agents: number;
    leader_conflicts: number;
    reject_spikes: number;
  };
  stale_agents: StaleAgentFinding[];
  leader_conflicts: LeaderConflictFinding[];
  reject_spikes: RejectSpikeFinding[];
};

const MAX_FINDINGS_PER_CLASS = 100;

function envInt(name: string, fallback: number) {
  const raw = (process.env[name] || "").trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function envFloat(name: string, fallback: number) {
  const raw = (process.env[name] || "").trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toJson(value: Record<string, unknown>) {
  return value as Prisma.InputJsonValue;
}

function findingKey(userId: string, brokerAccountId: string, eventType: string) {
  return `${userId}::${brokerAccountId}::${eventType}`;
}

async function maybeWriteRiskEvent(input: {
  userId: string;
  brokerAccountId: string;
  eventType: string;
  severity: string;
  details: Record<string, unknown>;
  dedupeMinutes: number;
}) {
  const dedupeSince = new Date(Date.now() - input.dedupeMinutes * 60_000);
  const exists = await prisma.riskEvent.findFirst({
    where: {
      userId: input.userId,
      brokerAccountId: input.brokerAccountId,
      eventType: input.eventType,
      createdAt: {
        gte: dedupeSince,
      },
    },
    select: { id: true },
  });

  if (exists) {
    return false;
  }

  await prisma.riskEvent.create({
    data: {
      userId: input.userId,
      brokerAccountId: input.brokerAccountId,
      symbol: null,
      eventType: input.eventType,
      severity: input.severity,
      detailsJson: toJson(input.details),
    },
  });
  return true;
}

export async function scanControlPlaneAnomalies(options: ControlPlaneAnomalyScanOptions = {}): Promise<ControlPlaneAnomalyScanResult> {
  const scannedAt = new Date();
  const persist = options.persist ?? true;
  const actorType = options.actorType || "SYSTEM";
  const actorId = options.actorId || "control-plane-anomaly";

  const staleAfterMinutes = options.staleAfterMinutes ?? envInt("CONTROL_PLANE_STALE_AGENT_MINUTES", 5);
  const rejectWindowMinutes = options.rejectWindowMinutes ?? envInt("CONTROL_PLANE_REJECT_WINDOW_MINUTES", 60);
  const minReportsForRejectSpike = options.minReportsForRejectSpike ?? envInt("CONTROL_PLANE_REJECT_SPIKE_MIN_REPORTS", 20);
  const rejectRateThreshold = options.rejectRateThreshold ?? envFloat("CONTROL_PLANE_REJECT_SPIKE_THRESHOLD", 0.35);

  const staleCutoff = new Date(scannedAt.getTime() - staleAfterMinutes * 60_000);
  const rejectWindowStart = new Date(scannedAt.getTime() - rejectWindowMinutes * 60_000);

  const [staleAgentsRaw, leaderGroups, reportTotals, rejectTotals] = await Promise.all([
    prisma.agent.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: staleCutoff } }],
      },
      select: {
        id: true,
        userId: true,
        brokerAccountId: true,
        deviceName: true,
        hostType: true,
        status: true,
        lastHeartbeatAt: true,
      },
      take: 500,
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.agent.groupBy({
      by: ["brokerAccountId"],
      where: {
        status: "ACTIVE",
        isExecutionLeader: true,
      },
      _count: { _all: true },
    }),
    prisma.executionReport.groupBy({
      by: ["brokerAccountId", "userId"],
      where: {
        createdAt: {
          gte: rejectWindowStart,
        },
      },
      _count: { _all: true },
    }),
    prisma.executionReport.groupBy({
      by: ["brokerAccountId", "userId"],
      where: {
        createdAt: {
          gte: rejectWindowStart,
        },
        executionResult: {
          not: {
            startsWith: "EXECUTED",
          },
        },
      },
      _count: { _all: true },
    }),
  ]);

  const staleAgents: StaleAgentFinding[] = staleAgentsRaw.slice(0, MAX_FINDINGS_PER_CLASS).map((agent) => ({
    agent_id: agent.id,
    user_id: agent.userId,
    broker_account_id: agent.brokerAccountId,
    device_name: agent.deviceName,
    host_type: agent.hostType,
    status: agent.status,
    last_heartbeat_at: agent.lastHeartbeatAt ? agent.lastHeartbeatAt.toISOString() : null,
    stale_minutes: agent.lastHeartbeatAt ? Math.floor((scannedAt.getTime() - agent.lastHeartbeatAt.getTime()) / 60_000) : null,
  }));

  const leaderConflictAccountIds = leaderGroups
    .filter((group) => group._count._all > 1)
    .map((group) => group.brokerAccountId);

  const [conflictAccounts, conflictLeaders] = leaderConflictAccountIds.length
    ? await Promise.all([
        prisma.brokerAccount.findMany({
          where: { id: { in: leaderConflictAccountIds } },
          select: {
            id: true,
            userId: true,
            brokerServer: true,
            accountLogin: true,
          },
        }),
        prisma.agent.findMany({
          where: {
            brokerAccountId: { in: leaderConflictAccountIds },
            status: "ACTIVE",
            isExecutionLeader: true,
          },
          select: {
            id: true,
            brokerAccountId: true,
            deviceName: true,
            lastHeartbeatAt: true,
          },
          orderBy: [{ updatedAt: "desc" }],
        }),
      ])
    : [[], []];

  const leadersByAccount = new Map<string, Array<{ id: string; deviceName: string; lastHeartbeatAt: Date | null }>>();
  for (const leader of conflictLeaders) {
    const list = leadersByAccount.get(leader.brokerAccountId) || [];
    list.push({
      id: leader.id,
      deviceName: leader.deviceName,
      lastHeartbeatAt: leader.lastHeartbeatAt,
    });
    leadersByAccount.set(leader.brokerAccountId, list);
  }

  const leaderConflicts: LeaderConflictFinding[] = conflictAccounts.slice(0, MAX_FINDINGS_PER_CLASS).map((account) => {
    const leaders = leadersByAccount.get(account.id) || [];
    return {
      broker_account_id: account.id,
      user_id: account.userId,
      broker_server: account.brokerServer,
      account_login: account.accountLogin,
      leader_count: leaders.length,
      leader_agents: leaders.map((agent) => ({
        agent_id: agent.id,
        device_name: agent.deviceName,
        last_heartbeat_at: agent.lastHeartbeatAt ? agent.lastHeartbeatAt.toISOString() : null,
      })),
    };
  });

  const rejectMap = new Map<string, number>();
  for (const group of rejectTotals) {
    rejectMap.set(findingKey(group.userId, group.brokerAccountId, "reject"), group._count._all);
  }

  const rejectSpikes: RejectSpikeFinding[] = [];
  for (const group of reportTotals) {
    if (group._count._all < minReportsForRejectSpike) {
      continue;
    }
    const key = findingKey(group.userId, group.brokerAccountId, "reject");
    const rejectedCount = rejectMap.get(key) || 0;
    const ratio = group._count._all > 0 ? rejectedCount / group._count._all : 0;
    if (ratio >= rejectRateThreshold) {
      rejectSpikes.push({
        broker_account_id: group.brokerAccountId,
        user_id: group.userId,
        total_reports: group._count._all,
        rejected_reports: rejectedCount,
        reject_rate: Number(ratio.toFixed(4)),
      });
    }
  }
  rejectSpikes.sort((a, b) => b.reject_rate - a.reject_rate);
  if (rejectSpikes.length > MAX_FINDINGS_PER_CLASS) {
    rejectSpikes.length = MAX_FINDINGS_PER_CLASS;
  }

  let persistedRiskEvents = 0;
  if (persist) {
    for (const stale of staleAgents) {
      const saved = await maybeWriteRiskEvent({
        userId: stale.user_id,
        brokerAccountId: stale.broker_account_id,
        eventType: "AGENT_STALE_HEARTBEAT",
        severity: "WARN",
        details: {
          agent_id: stale.agent_id,
          device_name: stale.device_name,
          stale_minutes: stale.stale_minutes,
          last_heartbeat_at: stale.last_heartbeat_at,
          scanned_at: scannedAt.toISOString(),
        },
        dedupeMinutes: 30,
      });
      if (saved) {
        persistedRiskEvents += 1;
      }
    }

    for (const conflict of leaderConflicts) {
      const saved = await maybeWriteRiskEvent({
        userId: conflict.user_id,
        brokerAccountId: conflict.broker_account_id,
        eventType: "LEADER_CONFLICT",
        severity: "HIGH",
        details: {
          leader_count: conflict.leader_count,
          leaders: conflict.leader_agents,
          broker_server: conflict.broker_server,
          account_login: conflict.account_login,
          scanned_at: scannedAt.toISOString(),
        },
        dedupeMinutes: 30,
      });
      if (saved) {
        persistedRiskEvents += 1;
      }
    }

    for (const spike of rejectSpikes) {
      const saved = await maybeWriteRiskEvent({
        userId: spike.user_id,
        brokerAccountId: spike.broker_account_id,
        eventType: "EXECUTION_REJECT_SPIKE",
        severity: spike.reject_rate >= 0.6 ? "HIGH" : "WARN",
        details: {
          total_reports: spike.total_reports,
          rejected_reports: spike.rejected_reports,
          reject_rate: spike.reject_rate,
          window_minutes: rejectWindowMinutes,
          threshold: rejectRateThreshold,
          scanned_at: scannedAt.toISOString(),
        },
        dedupeMinutes: 20,
      });
      if (saved) {
        persistedRiskEvents += 1;
      }
    }
  }

  await writeAudit({
    actorType,
    actorId,
    eventType: "ANOMALY_SCAN_COMPLETED",
    entityType: "CONTROL_PLANE",
    entityId: "GLOBAL",
    metadata: {
      scanned_at: scannedAt.toISOString(),
      persist,
      stale_after_minutes: staleAfterMinutes,
      reject_window_minutes: rejectWindowMinutes,
      reject_rate_threshold: rejectRateThreshold,
      min_reports_for_reject_spike: minReportsForRejectSpike,
      stale_agents: staleAgents.length,
      leader_conflicts: leaderConflicts.length,
      reject_spikes: rejectSpikes.length,
      persisted_risk_events: persistedRiskEvents,
    },
  });

  return {
    scanned_at: scannedAt.toISOString(),
    stale_after_minutes: staleAfterMinutes,
    reject_window_minutes: rejectWindowMinutes,
    reject_rate_threshold: rejectRateThreshold,
    min_reports_for_reject_spike: minReportsForRejectSpike,
    persist_enabled: persist,
    persisted_risk_events: persistedRiskEvents,
    counts: {
      stale_agents: staleAgents.length,
      leader_conflicts: leaderConflicts.length,
      reject_spikes: rejectSpikes.length,
    },
    stale_agents: staleAgents,
    leader_conflicts: leaderConflicts,
    reject_spikes: rejectSpikes,
  };
}
