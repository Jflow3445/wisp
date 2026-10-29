import { AgentHostType, AgentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PublicDataStatus = "ok" | "partial" | "stale" | "error";

export type SiteMetricsSummaryResponse = {
  recent_trade_accuracy_pct: number | null;
  recent_trade_accuracy_decimal: number | null;
  closed_trades_window: number;
  closed_trades_wins: number;
  closed_trades_losses: number;
  last_trade_closed_at: string | null;
  data_status: PublicDataStatus;
};

export type SiteMetricsActivityItem = {
  symbol: string;
  side: "long" | "short" | null;
  event_type: string;
  event_label: string;
  display_title: string;
  occurred_at: string;
  publish_at: string;
  relative_time: string;
};

export type SiteMetricsActivityResponse = {
  items: SiteMetricsActivityItem[];
  data_status: PublicDataStatus;
};

export type SiteMetricsStatusResponse = {
  execution_monitor: {
    market_scanning: boolean | null;
    execution_engine_online: boolean | null;
    last_completed_action_at: string | null;
    last_completed_action_relative: string;
    execution_mode_summary: string | null;
  };
  risk_controls: {
    daily_loss_guard_active: boolean | null;
    spread_filter_active: boolean | null;
    max_concurrent_trades_enforced: boolean | null;
    weekend_protection_active: boolean | null;
    per_trade_risk_cap_pct: number | null;
  };
  data_status: PublicDataStatus;
};

type TradeOutcome = {
  outcome: "win" | "loss";
  closedAt: Date;
};

type ActivityRow = {
  symbol: string;
  side: "long" | "short" | null;
  eventType: string;
  eventLabel: string;
  occurredAt: Date;
};

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ACTIVITY_DELAY_MS = ONE_HOUR_MS;
const ACCURACY_WINDOW = 50;
const MIN_STABLE_ACCURACY_TRADES = 20;
const STATUS_STALE_AFTER_MS = 30 * ONE_MINUTE_MS;
const RELATIVE_TIME = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function readPayloadValue(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      return payload[key];
    }
  }
  return null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (value instanceof Prisma.Decimal) {
    return Number(value);
  }
  return null;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "no" || normalized === "0") {
      return false;
    }
  }
  return null;
}

function normalizeEventType(raw: string | null | undefined) {
  const value = (raw || "").trim();
  if (!value) {
    return "";
  }
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function sanitizeSymbol(raw: string | null | undefined) {
  const normalized = (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized || normalized.length < 3 || normalized.length > 12) {
    return null;
  }
  return normalized;
}

function normalizeSide(raw: string | null | undefined): "long" | "short" | null {
  const value = (raw || "").trim().toUpperCase();
  if (value === "LONG" || value === "BUY") {
    return "long";
  }
  if (value === "SHORT" || value === "SELL") {
    return "short";
  }
  return null;
}

function formatRelativeTime(date: Date | null, nowMs = Date.now()) {
  if (!date) {
    return "Unknown";
  }

  const diffMs = date.getTime() - nowMs;
  const absMs = Math.abs(diffMs);
  if (absMs < 45_000) {
    return "just now";
  }

  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
    { unit: "day", ms: 24 * ONE_HOUR_MS },
    { unit: "hour", ms: ONE_HOUR_MS },
    { unit: "minute", ms: ONE_MINUTE_MS },
  ];
  for (const unit of units) {
    if (absMs >= unit.ms) {
      const amount = Math.round(diffMs / unit.ms);
      return RELATIVE_TIME.format(amount, unit.unit);
    }
  }
  return RELATIVE_TIME.format(Math.round(diffMs / 1000), "second");
}

function defaultSummary(dataStatus: PublicDataStatus): SiteMetricsSummaryResponse {
  return {
    recent_trade_accuracy_pct: null,
    recent_trade_accuracy_decimal: null,
    closed_trades_window: 0,
    closed_trades_wins: 0,
    closed_trades_losses: 0,
    last_trade_closed_at: null,
    data_status: dataStatus,
  };
}

function defaultActivity(dataStatus: PublicDataStatus): SiteMetricsActivityResponse {
  return {
    items: [],
    data_status: dataStatus,
  };
}

function defaultStatus(dataStatus: PublicDataStatus): SiteMetricsStatusResponse {
  return {
    execution_monitor: {
      market_scanning: null,
      execution_engine_online: null,
      last_completed_action_at: null,
      last_completed_action_relative: "Unknown",
      execution_mode_summary: null,
    },
    risk_controls: {
      daily_loss_guard_active: null,
      spread_filter_active: null,
      max_concurrent_trades_enforced: null,
      weekend_protection_active: null,
      per_trade_risk_cap_pct: null,
    },
    data_status: dataStatus,
  };
}

function inferClosedOutcomeFromLegacyLog(eventTypeRaw: string, payload: Record<string, unknown>): "win" | "loss" | null {
  const eventType = normalizeEventType(eventTypeRaw);
  const combined = `${eventType}_${normalizeEventType(asString(readPayloadValue(payload, ["eventType", "event_type", "result", "outcome", "status"])))}`;
  if (!combined.includes("CLOSE")) {
    return null;
  }

  const winFlag = asBoolean(readPayloadValue(payload, ["isWin", "is_win", "win"]));
  if (winFlag === true) {
    return "win";
  }
  if (winFlag === false) {
    return "loss";
  }

  const pnlValue = asNumber(
    readPayloadValue(payload, [
      "profit",
      "profitUsd",
      "profit_usd",
      "pnl",
      "pnlUsd",
      "pnl_usd",
      "netProfit",
      "net_profit",
      "realizedPnl",
      "realized_pnl",
    ]),
  );
  if (typeof pnlValue === "number") {
    if (pnlValue > 0) {
      return "win";
    }
    if (pnlValue < 0) {
      return "loss";
    }
  }

  if (combined.includes("TP_HIT") || combined.includes("TAKE_PROFIT")) {
    return "win";
  }
  if (combined.includes("SL_HIT") || combined.includes("STOP_LOSS")) {
    return "loss";
  }
  return null;
}

function inferClosedOutcomeFromExecutionReport(report: {
  executionResult: string;
  commandType: string | null;
  rawResultJson: unknown;
}): "win" | "loss" | null {
  const execution = normalizeEventType(report.executionResult);
  const commandType = normalizeEventType(report.commandType || "");
  const payload = asObject(report.rawResultJson);

  const isCloseAction =
    commandType.includes("CLOSE") ||
    execution.includes("CLOSE") ||
    asBoolean(readPayloadValue(payload, ["is_closed", "isClosed", "position_closed"])) === true;
  if (!isCloseAction) {
    return null;
  }

  const pnl = asNumber(
    readPayloadValue(payload, [
      "profit",
      "profit_usd",
      "profitUsd",
      "pnl",
      "pnl_usd",
      "pnlUsd",
      "realized_pnl",
      "realizedPnl",
    ]),
  );
  if (typeof pnl === "number") {
    if (pnl > 0) {
      return "win";
    }
    if (pnl < 0) {
      return "loss";
    }
  }

  const outcome = normalizeEventType(asString(readPayloadValue(payload, ["outcome", "result", "status"])));
  if (outcome.includes("WIN") || outcome.includes("PROFIT")) {
    return "win";
  }
  if (outcome.includes("LOSS") || outcome.includes("NEGATIVE")) {
    return "loss";
  }

  return null;
}

function mapActivityFromExecutionResult(executionResult: string) {
  const normalized = normalizeEventType(executionResult);
  if (!normalized) {
    return null;
  }

  if (normalized.includes("REJECT") || normalized.includes("BLOCK")) {
    return { event_type: "rejected", event_label: "Rejected" as const };
  }
  if (normalized.includes("CANCEL")) {
    return { event_type: "cancelled", event_label: "Cancelled" as const };
  }
  if (normalized.includes("ADJUST") || normalized.includes("MODIFY") || normalized.includes("UPDATE")) {
    return { event_type: "adjusted", event_label: "Adjusted" as const };
  }
  if (normalized.includes("CLOSE")) {
    return { event_type: "closed", event_label: "Closed" as const };
  }
  if (normalized.includes("QUEUE") || normalized.includes("PENDING")) {
    return { event_type: "queued", event_label: "Queued" as const };
  }
  if (normalized.includes("VALID")) {
    return { event_type: "validated", event_label: "Validated" as const };
  }
  if (normalized.includes("EXECUT") || normalized.includes("FILLED")) {
    return { event_type: "executed", event_label: "Executed" as const };
  }

  return { event_type: "executed", event_label: "Executed" as const };
}

function mapActivityFromCommandEvent(eventType: string) {
  const normalized = normalizeEventType(eventType);
  if (!normalized) {
    return null;
  }

  if (normalized.includes("ADMIN_CANCEL")) {
    return { event_type: "cancelled", event_label: "Cancelled" as const };
  }
  if (normalized.includes("REJECT")) {
    return { event_type: "rejected", event_label: "Rejected" as const };
  }
  if (normalized.includes("ACK")) {
    return { event_type: "validated", event_label: "Validated" as const };
  }
  if (normalized.includes("PUBLISH") || normalized.includes("LEASE")) {
    return { event_type: "queued", event_label: "Queued" as const };
  }

  return null;
}

function summarizeExecutionMode(hostTypes: AgentHostType[]) {
  const set = new Set(hostTypes);
  if (set.has(AgentHostType.LOCAL) && set.has(AgentHostType.VPS)) {
    return "Hosted runtime / Local";
  }
  if (set.has(AgentHostType.VPS)) {
    return "Hosted runtime";
  }
  if (set.has(AgentHostType.LOCAL)) {
    return "Local";
  }
  return null;
}

export async function getPublicSiteMetricsSummary(): Promise<SiteMetricsSummaryResponse> {
  try {
    const [reports, logs] = await Promise.all([
      prisma.executionReport.findMany({
        orderBy: [{ executionTime: "desc" }],
        take: 800,
        select: {
          executionResult: true,
          executionTime: true,
          rawResultJson: true,
          command: {
            select: {
              commandType: true,
            },
          },
        },
      }),
      prisma.executionLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          eventType: true,
          payload: true,
          createdAt: true,
        },
      }),
    ]);

    const outcomes: TradeOutcome[] = [];
    for (const report of reports) {
      const outcome = inferClosedOutcomeFromExecutionReport({
        executionResult: report.executionResult,
        commandType: report.command?.commandType || null,
        rawResultJson: report.rawResultJson,
      });
      if (!outcome) {
        continue;
      }
      outcomes.push({
        outcome,
        closedAt: report.executionTime,
      });
      if (outcomes.length >= ACCURACY_WINDOW) {
        break;
      }
    }

    if (outcomes.length < ACCURACY_WINDOW) {
      for (const log of logs) {
        const outcome = inferClosedOutcomeFromLegacyLog(log.eventType, asObject(log.payload));
        if (!outcome) {
          continue;
        }
        outcomes.push({
          outcome,
          closedAt: log.createdAt,
        });
        if (outcomes.length >= ACCURACY_WINDOW) {
          break;
        }
      }
    }

    if (!outcomes.length) {
      return defaultSummary("partial");
    }

    outcomes.sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());
    const windowed = outcomes.slice(0, ACCURACY_WINDOW);
    const wins = windowed.filter((item) => item.outcome === "win").length;
    const losses = windowed.length - wins;
    const accuracy = Math.round((wins / windowed.length) * 100);
    const lastClosedAt = windowed[0]?.closedAt || null;

    let dataStatus: PublicDataStatus = "ok";
    if (windowed.length < MIN_STABLE_ACCURACY_TRADES) {
      dataStatus = "partial";
    } else if (lastClosedAt && Date.now() - lastClosedAt.getTime() > 72 * ONE_HOUR_MS) {
      dataStatus = "stale";
    }

    return {
      recent_trade_accuracy_pct: accuracy,
      recent_trade_accuracy_decimal: Number((accuracy / 100).toFixed(2)),
      closed_trades_window: windowed.length,
      closed_trades_wins: wins,
      closed_trades_losses: losses,
      last_trade_closed_at: lastClosedAt ? lastClosedAt.toISOString() : null,
      data_status: dataStatus,
    };
  } catch {
    return defaultSummary("error");
  }
}

export async function getPublicSiteMetricsActivity(): Promise<SiteMetricsActivityResponse> {
  try {
    const [reports, events] = await Promise.all([
      prisma.executionReport.findMany({
        orderBy: [{ executionTime: "desc" }],
        take: 300,
        select: {
          symbol: true,
          executionResult: true,
          executionTime: true,
          command: {
            select: {
              side: true,
            },
          },
        },
      }),
      prisma.commandEvent.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 300,
        select: {
          eventType: true,
          createdAt: true,
          command: {
            select: {
              symbol: true,
              side: true,
            },
          },
        },
      }),
    ]);

    const rawRows: ActivityRow[] = [];
    for (const report of reports) {
      const mapped = mapActivityFromExecutionResult(report.executionResult);
      if (!mapped) {
        continue;
      }
      rawRows.push({
        symbol: sanitizeSymbol(report.symbol) || "MARKET",
        side: normalizeSide(report.command?.side || null),
        eventType: mapped.event_type,
        eventLabel: mapped.event_label,
        occurredAt: report.executionTime,
      });
    }

    for (const event of events) {
      const mapped = mapActivityFromCommandEvent(event.eventType);
      if (!mapped) {
        continue;
      }
      rawRows.push({
        symbol: sanitizeSymbol(event.command.symbol) || "MARKET",
        side: normalizeSide(event.command.side || null),
        eventType: mapped.event_type,
        eventLabel: mapped.event_label,
        occurredAt: event.createdAt,
      });
    }

    rawRows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const nowMs = Date.now();
    const published: SiteMetricsActivityItem[] = [];
    for (const row of rawRows) {
      const publishAt = new Date(row.occurredAt.getTime() + ACTIVITY_DELAY_MS);
      if (publishAt.getTime() > nowMs) {
        continue;
      }

      const displayTitle = row.side ? `${row.symbol} ${row.side === "long" ? "Long" : "Short"}` : row.symbol;
      const key = `${displayTitle}|${row.eventType}|${publishAt.toISOString()}`;
      if (published.some((item) => `${item.display_title}|${item.event_type}|${item.publish_at}` === key)) {
        continue;
      }

      published.push({
        symbol: row.symbol,
        side: row.side,
        event_type: row.eventType,
        event_label: row.eventLabel,
        display_title: displayTitle,
        occurred_at: row.occurredAt.toISOString(),
        publish_at: publishAt.toISOString(),
        relative_time: formatRelativeTime(publishAt, nowMs),
      });

      if (published.length >= 12) {
        break;
      }
    }

    if (!published.length) {
      return defaultActivity("partial");
    }

    let dataStatus: PublicDataStatus = "ok";
    if (published.length < 3) {
      dataStatus = "partial";
    } else {
      const latestPublishAt = new Date(published[0].publish_at);
      if (nowMs - latestPublishAt.getTime() > 6 * ONE_HOUR_MS) {
        dataStatus = "stale";
      }
    }

    return {
      items: published,
      data_status: dataStatus,
    };
  } catch {
    return defaultActivity("error");
  }
}

export async function getPublicSiteMetricsStatus(): Promise<SiteMetricsStatusResponse> {
  try {
    const staleCutoff = new Date(Date.now() - 5 * ONE_MINUTE_MS);
    const [agents, latestExecuted, policyTotal, policyGuardCounts, avgRisk] = await Promise.all([
      prisma.agent.findMany({
        where: {
          status: AgentStatus.ACTIVE,
        },
        select: {
          hostType: true,
          isExecutionLeader: true,
          lastHeartbeatAt: true,
        },
      }),
      prisma.executionReport.findFirst({
        where: {
          executionResult: {
            startsWith: "EXECUTED",
          },
        },
        orderBy: [{ executionTime: "desc" }],
        select: {
          executionTime: true,
        },
      }),
      prisma.userPolicy.count(),
      Promise.all([
        prisma.userPolicy.count({ where: { maxDailyLossPct: { gt: 0 } } }),
        prisma.userPolicy.count({ where: { maxSpreadPoints: { gt: 0 } } }),
        prisma.userPolicy.count({ where: { maxOpenTradesTotal: { gt: 0 } } }),
        prisma.userPolicy.count({ where: { weekendTradingAllowed: false } }),
      ]),
      prisma.userPolicy.aggregate({
        _avg: {
          maxRiskPerTradePct: true,
        },
      }),
    ]);

    const onlineAgents = agents.filter((agent) => agent.lastHeartbeatAt && agent.lastHeartbeatAt >= staleCutoff);
    const onlineLeaders = agents.filter(
      (agent) => agent.isExecutionLeader && agent.lastHeartbeatAt && agent.lastHeartbeatAt >= staleCutoff,
    );

    const modeSummary = summarizeExecutionMode(agents.map((agent) => agent.hostType)) || "Hosted runtime / Local";
    const lastCompletedActionAt = latestExecuted?.executionTime || null;

    const [lossGuardCount, spreadGuardCount, tradeLimitCount, weekendGuardCount] = policyGuardCounts;
    const hasPolicies = policyTotal > 0;
    const avgRiskPct = asNumber(avgRisk._avg.maxRiskPerTradePct);

    const marketScanning = hasPolicies ? onlineAgents.length > 0 : null;
    const executionEngineOnline = hasPolicies ? onlineLeaders.length > 0 : null;

    let dataStatus: PublicDataStatus = "ok";
    if (!hasPolicies) {
      dataStatus = "partial";
    } else if (!lastCompletedActionAt || Date.now() - lastCompletedActionAt.getTime() > STATUS_STALE_AFTER_MS) {
      dataStatus = "stale";
    }

    return {
      execution_monitor: {
        market_scanning: marketScanning,
        execution_engine_online: executionEngineOnline,
        last_completed_action_at: lastCompletedActionAt ? lastCompletedActionAt.toISOString() : null,
        last_completed_action_relative: formatRelativeTime(lastCompletedActionAt),
        execution_mode_summary: modeSummary,
      },
      risk_controls: {
        daily_loss_guard_active: hasPolicies ? lossGuardCount === policyTotal : null,
        spread_filter_active: hasPolicies ? spreadGuardCount === policyTotal : null,
        max_concurrent_trades_enforced: hasPolicies ? tradeLimitCount === policyTotal : null,
        weekend_protection_active: hasPolicies ? weekendGuardCount === policyTotal : null,
        per_trade_risk_cap_pct: typeof avgRiskPct === "number" ? Number(avgRiskPct.toFixed(2)) : null,
      },
      data_status: dataStatus,
    };
  } catch {
    return defaultStatus("error");
  }
}
