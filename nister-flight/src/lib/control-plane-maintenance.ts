import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/control-plane";

type ControlPlaneMaintenanceOptions = {
  dryRun?: boolean;
  actorType?: string;
  actorId?: string;
  auditRetentionDays?: number;
  telemetryRetentionDays?: number;
  executionRetentionDays?: number;
  revokedSessionRetentionDays?: number;
  leaseRetentionDays?: number;
  authRateLimitRetentionDays?: number;
};

export type ControlPlaneMaintenanceResult = {
  ran_at: string;
  dry_run: boolean;
  retention: {
    audit_days: number;
    telemetry_days: number;
    execution_days: number;
    revoked_session_days: number;
    lease_days: number;
    auth_rate_limit_days: number;
  };
  expired_counts: {
    ai_nonces: number;
    agent_nonces: number;
    sessions: number;
    leases: number;
    audit_logs: number;
    heartbeats: number;
    position_snapshots: number;
    execution_reports: number;
    command_events: number;
    auth_rate_limits: number;
  };
  deleted_counts: {
    ai_nonces: number;
    agent_nonces: number;
    sessions: number;
    leases: number;
    audit_logs: number;
    heartbeats: number;
    position_snapshots: number;
    execution_reports: number;
    command_events: number;
    auth_rate_limits: number;
  };
};

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

export async function runControlPlaneMaintenance(options: ControlPlaneMaintenanceOptions = {}): Promise<ControlPlaneMaintenanceResult> {
  const now = new Date();
  const dryRun = options.dryRun ?? false;
  const actorType = options.actorType || "SYSTEM";
  const actorId = options.actorId || "control-plane-maintenance";

  const auditRetentionDays = options.auditRetentionDays ?? envInt("CONTROL_PLANE_AUDIT_RETENTION_DAYS", 365);
  const telemetryRetentionDays = options.telemetryRetentionDays ?? envInt("CONTROL_PLANE_TELEMETRY_RETENTION_DAYS", 45);
  const executionRetentionDays = options.executionRetentionDays ?? envInt("CONTROL_PLANE_EXECUTION_RETENTION_DAYS", 90);
  const revokedSessionRetentionDays =
    options.revokedSessionRetentionDays ?? envInt("CONTROL_PLANE_REVOKED_SESSION_RETENTION_DAYS", 7);
  const leaseRetentionDays = options.leaseRetentionDays ?? envInt("CONTROL_PLANE_LEASE_RETENTION_DAYS", 7);
  const authRateLimitRetentionDays =
    options.authRateLimitRetentionDays ?? envInt("CONTROL_PLANE_AUTH_RATE_LIMIT_RETENTION_DAYS", 14);

  const nonceCutoff = now;
  const auditCutoff = new Date(now.getTime() - auditRetentionDays * 24 * 60 * 60 * 1000);
  const telemetryCutoff = new Date(now.getTime() - telemetryRetentionDays * 24 * 60 * 60 * 1000);
  const executionCutoff = new Date(now.getTime() - executionRetentionDays * 24 * 60 * 60 * 1000);
  const revokedSessionCutoff = new Date(now.getTime() - revokedSessionRetentionDays * 24 * 60 * 60 * 1000);
  const leaseCutoff = new Date(now.getTime() - leaseRetentionDays * 24 * 60 * 60 * 1000);
  const authRateLimitCutoff = new Date(now.getTime() - authRateLimitRetentionDays * 24 * 60 * 60 * 1000);

  const sessionWhere = {
    OR: [{ refreshExpiresAt: { lt: now } }, { revokedAt: { lt: revokedSessionCutoff } }],
  };
  const leaseWhere = {
    OR: [{ leaseExpiresAt: { lt: now } }, { leaseStartedAt: { lt: leaseCutoff } }],
  };

  const [
    aiNoncesExpired,
    agentNoncesExpired,
    sessionsExpired,
    leasesExpired,
    auditLogsExpired,
    heartbeatsExpired,
    snapshotsExpired,
    executionReportsExpired,
    commandEventsExpired,
    authRateLimitsExpired,
  ] = await Promise.all([
    prisma.aiNonce.count({ where: { expiresAt: { lt: nonceCutoff } } }),
    prisma.agentNonce.count({ where: { expiresAt: { lt: nonceCutoff } } }),
    prisma.agentSession.count({ where: sessionWhere }),
    prisma.agentLease.count({ where: leaseWhere }),
    prisma.auditLog.count({ where: { createdAt: { lt: auditCutoff } } }),
    prisma.agentHeartbeat.count({ where: { createdAt: { lt: telemetryCutoff } } }),
    prisma.positionSnapshot.count({ where: { createdAt: { lt: telemetryCutoff } } }),
    prisma.executionReport.count({ where: { createdAt: { lt: executionCutoff } } }),
    prisma.commandEvent.count({ where: { createdAt: { lt: telemetryCutoff } } }),
    prisma.authRateLimit.count({
      where: {
        OR: [
          { updatedAt: { lt: authRateLimitCutoff } },
          { lastAttemptAt: { lt: authRateLimitCutoff } },
        ],
      },
    }),
  ]);

  const counts = {
    ai_nonces: aiNoncesExpired,
    agent_nonces: agentNoncesExpired,
    sessions: sessionsExpired,
    leases: leasesExpired,
    audit_logs: auditLogsExpired,
    heartbeats: heartbeatsExpired,
    position_snapshots: snapshotsExpired,
    execution_reports: executionReportsExpired,
    command_events: commandEventsExpired,
    auth_rate_limits: authRateLimitsExpired,
  };

  const deleted = {
    ai_nonces: 0,
    agent_nonces: 0,
    sessions: 0,
    leases: 0,
    audit_logs: 0,
    heartbeats: 0,
    position_snapshots: 0,
    execution_reports: 0,
    command_events: 0,
    auth_rate_limits: 0,
  };

  if (!dryRun) {
    const [
      aiNoncesDeleted,
      agentNoncesDeleted,
      sessionsDeleted,
      leasesDeleted,
      auditLogsDeleted,
      heartbeatsDeleted,
      snapshotsDeleted,
      executionReportsDeleted,
      commandEventsDeleted,
      authRateLimitsDeleted,
    ] = await prisma.$transaction([
      prisma.aiNonce.deleteMany({ where: { expiresAt: { lt: nonceCutoff } } }),
      prisma.agentNonce.deleteMany({ where: { expiresAt: { lt: nonceCutoff } } }),
      prisma.agentSession.deleteMany({ where: sessionWhere }),
      prisma.agentLease.deleteMany({ where: leaseWhere }),
      prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
      prisma.agentHeartbeat.deleteMany({ where: { createdAt: { lt: telemetryCutoff } } }),
      prisma.positionSnapshot.deleteMany({ where: { createdAt: { lt: telemetryCutoff } } }),
      prisma.executionReport.deleteMany({ where: { createdAt: { lt: executionCutoff } } }),
      prisma.commandEvent.deleteMany({ where: { createdAt: { lt: telemetryCutoff } } }),
      prisma.authRateLimit.deleteMany({
        where: {
          OR: [
            { updatedAt: { lt: authRateLimitCutoff } },
            { lastAttemptAt: { lt: authRateLimitCutoff } },
          ],
        },
      }),
    ]);

    deleted.ai_nonces = aiNoncesDeleted.count;
    deleted.agent_nonces = agentNoncesDeleted.count;
    deleted.sessions = sessionsDeleted.count;
    deleted.leases = leasesDeleted.count;
    deleted.audit_logs = auditLogsDeleted.count;
    deleted.heartbeats = heartbeatsDeleted.count;
    deleted.position_snapshots = snapshotsDeleted.count;
    deleted.execution_reports = executionReportsDeleted.count;
    deleted.command_events = commandEventsDeleted.count;
    deleted.auth_rate_limits = authRateLimitsDeleted.count;
  }

  await writeAudit({
    actorType,
    actorId,
    eventType: dryRun ? "MAINTENANCE_DRY_RUN" : "MAINTENANCE_COMPLETED",
    entityType: "CONTROL_PLANE",
    entityId: "GLOBAL",
    metadata: {
      ran_at: now.toISOString(),
      dry_run: dryRun,
      retention: {
        audit_days: auditRetentionDays,
        telemetry_days: telemetryRetentionDays,
        execution_days: executionRetentionDays,
        revoked_session_days: revokedSessionRetentionDays,
        lease_days: leaseRetentionDays,
        auth_rate_limit_days: authRateLimitRetentionDays,
      },
      expired_counts: counts,
      deleted_counts: deleted,
    },
  });

  return {
    ran_at: now.toISOString(),
    dry_run: dryRun,
    retention: {
      audit_days: auditRetentionDays,
      telemetry_days: telemetryRetentionDays,
      execution_days: executionRetentionDays,
      revoked_session_days: revokedSessionRetentionDays,
      lease_days: leaseRetentionDays,
      auth_rate_limit_days: authRateLimitRetentionDays,
    },
    expired_counts: counts,
    deleted_counts: deleted,
  };
}
