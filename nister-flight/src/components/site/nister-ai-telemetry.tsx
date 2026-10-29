"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  SiteMetricsActivityResponse,
  SiteMetricsStatusResponse,
  SiteMetricsSummaryResponse,
} from "@/lib/site-metrics";

const SUMMARY_REFRESH_MS = 5 * 60 * 1000;
const ACTIVITY_REFRESH_MS = 5 * 60 * 1000;
const STATUS_REFRESH_MS = 2 * 60 * 1000;

const EMPTY_SUMMARY: SiteMetricsSummaryResponse = {
  recent_trade_accuracy_pct: null,
  recent_trade_accuracy_decimal: null,
  closed_trades_window: 0,
  closed_trades_wins: 0,
  closed_trades_losses: 0,
  last_trade_closed_at: null,
  data_status: "error",
};

const EMPTY_ACTIVITY: SiteMetricsActivityResponse = {
  items: [],
  data_status: "error",
};

const EMPTY_STATUS: SiteMetricsStatusResponse = {
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
  data_status: "error",
};

type TelemetryState<T> = {
  data: T;
  isLoading: boolean;
};

function useTelemetryEndpoint<T extends { data_status: string }>(url: string, intervalMs: number, fallback: T): TelemetryState<T> {
  const [data, setData] = useState<T>(fallback);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Non-200 response");
        }
        const payload = (await response.json()) as T;
        if (!active) {
          return;
        }
        setData(payload);
      } catch {
        if (!active) {
          return;
        }
        setData((previous) => ({ ...previous, data_status: "error" } as T));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();
    const timerId = window.setInterval(() => {
      void load();
    }, intervalMs);

    return () => {
      active = false;
      window.clearInterval(timerId);
    };
  }, [intervalMs, url]);

  return { data, isLoading };
}

function boolToLabel(value: boolean | null | undefined, onTrue: string, onFalse: string) {
  if (value === true) {
    return onTrue;
  }
  if (value === false) {
    return onFalse;
  }
  return "Unknown";
}

export function NisterAiHeroTelemetry() {
  const summaryState = useTelemetryEndpoint("/api/public/site-metrics/summary", SUMMARY_REFRESH_MS, EMPTY_SUMMARY);
  const activityState = useTelemetryEndpoint("/api/public/site-metrics/activity", ACTIVITY_REFRESH_MS, EMPTY_ACTIVITY);
  const statusState = useTelemetryEndpoint("/api/public/site-metrics/status", STATUS_REFRESH_MS, EMPTY_STATUS);

  const summary = summaryState.data;
  const activity = activityState.data;
  const status = statusState.data;

  const hasStableAccuracy =
    typeof summary.recent_trade_accuracy_pct === "number" &&
    Number.isFinite(summary.recent_trade_accuracy_pct) &&
    summary.closed_trades_window >= 20;
  const accuracyBarWidth = hasStableAccuracy ? Math.min(100, Math.max(0, summary.recent_trade_accuracy_pct || 0)) : 0;

  const accuracyValue = useMemo(() => {
    if (summaryState.isLoading) {
      return null;
    }
    if (summary.data_status === "error") {
      return "--";
    }
    if (!hasStableAccuracy) {
      return "Building live track record";
    }
    return `${summary.recent_trade_accuracy_pct}%`;
  }, [hasStableAccuracy, summary.data_status, summary.recent_trade_accuracy_pct, summaryState.isLoading]);

  const accuracySubtext = useMemo(() => {
    if (summaryState.isLoading) {
      return "Loading live telemetry";
    }
    if (summary.data_status === "error") {
      return "Data temporarily unavailable";
    }
    if (summary.closed_trades_window < 20) {
      return "More completed trades needed for a stable public metric";
    }
    if (summary.closed_trades_window < 50) {
      return `Based on the last ${summary.closed_trades_window} closed trades`;
    }
    if (summary.data_status === "stale") {
      return "Based on the last 50 closed trades. Last updated recently.";
    }
    return "Based on the last 50 closed trades";
  }, [summary.closed_trades_window, summary.data_status, summaryState.isLoading]);

  const mappedActivity = useMemo(() => {
    if (activityState.isLoading) {
      return [];
    }
    if (activity.data_status === "error") {
      return [
        {
          title: "Activity feed temporarily unavailable",
          detail: "",
          isFallback: true,
        },
      ];
    }

    const items = activity.items.slice(0, 3).map((item) => ({
      title: item.display_title,
      detail: `${item.event_label}${item.relative_time ? ` | ${item.relative_time}` : ""}`,
      isFallback: false,
    }));

    const placeholders = [
      {
        title: "System monitoring markets",
        detail: "",
        isFallback: true,
      },
      {
        title: "Awaiting next publishable activity",
        detail: "",
        isFallback: true,
      },
    ];

    while (items.length < 3) {
      items.push(placeholders[Math.min(placeholders.length - 1, items.length)]);
    }

    return items;
  }, [activity.data_status, activity.items, activityState.isLoading]);

  const monitor = status.execution_monitor;
  const engineLabel = boolToLabel(monitor.execution_engine_online, "Online", "Offline");
  const scanningLabel = boolToLabel(monitor.market_scanning, "Active", "Inactive");

  const statusTone = useMemo(() => {
    if (summaryState.isLoading || activityState.isLoading || statusState.isLoading) {
      return { label: "Loading", className: "premium-status-muted" };
    }
    if (summary.data_status === "error" || activity.data_status === "error" || status.data_status === "error") {
      return { label: "Limited", className: "premium-status-muted" };
    }
    if (summary.data_status === "stale" || activity.data_status === "stale" || status.data_status === "stale") {
      return { label: "Delayed", className: "premium-status-warn" };
    }
    if (monitor.execution_engine_online === false) {
      return { label: "Attention", className: "premium-status-warn" };
    }
    if (monitor.execution_engine_online === true) {
      return { label: "Nominal", className: "" };
    }
    return { label: "Unknown", className: "premium-status-muted" };
  }, [
    activity.data_status,
    activityState.isLoading,
    monitor.execution_engine_online,
    status.data_status,
    statusState.isLoading,
    summary.data_status,
    summaryState.isLoading,
  ]);

  return (
    <>
      <article className="premium-dashboard-card" aria-label="Platform status preview">
        <div className="premium-dash-head">
          <p>System Status</p>
          <span className={statusTone.className}>{statusTone.label}</span>
        </div>
        <div className="premium-confidence">
          <div className="premium-confidence-meta">
            <p title="Calculated from the most recent closed trades recorded by the system.">Recent Trade Accuracy</p>
            {accuracyValue ? <strong>{accuracyValue}</strong> : <span className="premium-skeleton-line premium-skeleton-inline" aria-hidden="true" />}
          </div>
          <div className="premium-confidence-bar">
            <span style={{ width: `${accuracyBarWidth}%` }} />
          </div>
          <p className="premium-confidence-subtext">{accuracySubtext}</p>
        </div>
        <div className="premium-scan-indicator">
          <span className="premium-live-dot" aria-hidden="true" />
          <p>
            {statusState.isLoading
              ? "Loading execution state"
              : scanningLabel === "Active"
                ? "Active market scanning in progress"
                : scanningLabel === "Inactive"
                  ? "Market scanning currently inactive"
                  : "Market scanning state unknown"}
          </p>
        </div>
        <div className="premium-chart-mini" aria-hidden="true">
          <span className="premium-line premium-line-a" />
          <span className="premium-line premium-line-b" />
          <span className="premium-line premium-line-c" />
        </div>
        <div className="premium-execution-feed">
          <p>Execution Activity</p>
          <ul>
            {activityState.isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <li key={`activity-skeleton-${index}`}>
                    <span className="premium-skeleton-line" aria-hidden="true" />
                    <small className="premium-skeleton-line premium-skeleton-inline" aria-hidden="true" />
                  </li>
                ))
              : mappedActivity.map((item, index) => (
                  <li key={`${item.title}-${index}`} className={item.isFallback ? "premium-feed-empty" : ""}>
                    <span>{item.title}</span>
                    <small>{item.detail}</small>
                  </li>
                ))}
          </ul>
        </div>
        <p className="premium-uptime">Uptime target: 24/7 with Managed VPS</p>
      </article>

      <article className="premium-float-card premium-float-top">
        <p>AI Status</p>
        <strong>{statusState.isLoading ? "Loading" : engineLabel}</strong>
      </article>
      <article className="premium-float-card premium-float-bottom">
        <p>Execution Mode</p>
        <strong>{statusState.isLoading ? "Loading" : monitor.execution_mode_summary || "Unknown"}</strong>
      </article>
    </>
  );
}

export function NisterAiSnapshotTelemetry() {
  const statusState = useTelemetryEndpoint("/api/public/site-metrics/status", STATUS_REFRESH_MS, EMPTY_STATUS);
  const status = statusState.data;
  const monitor = status.execution_monitor;
  const risk = status.risk_controls;

  const monitorRows = [
    {
      label: "Market Scanning",
      value: boolToLabel(monitor.market_scanning, "Active", "Inactive"),
    },
    {
      label: "Execution Engine",
      value: boolToLabel(monitor.execution_engine_online, "Online", "Offline"),
    },
    {
      label: "Last Completed Action",
      value: monitor.last_completed_action_relative || "Unknown",
    },
    {
      label: "Execution Mode",
      value: monitor.execution_mode_summary || "Unknown",
    },
  ];

  const riskRows = [
    {
      label: "Daily Loss Guard",
      value: boolToLabel(risk.daily_loss_guard_active, "Active", "Inactive"),
    },
    {
      label: "Spread Filter",
      value: boolToLabel(risk.spread_filter_active, "Active", "Inactive"),
    },
    {
      label: "Trade Limit",
      value: boolToLabel(risk.max_concurrent_trades_enforced, "Enforced", "Disabled"),
    },
    {
      label: "Weekend Protection",
      value: boolToLabel(risk.weekend_protection_active, "Active", "Inactive"),
    },
  ];

  return (
    <article className="premium-snapshot-mock" aria-live="polite">
      <div className="premium-snapshot-top">
        <span />
        <span />
        <span />
      </div>
      <div className="premium-snapshot-body">
        <div className="premium-snapshot-col">
          <p className="premium-snapshot-title">Execution Monitor</p>
          {statusState.isLoading ? (
            <ul className="premium-snapshot-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <li key={`monitor-loading-${index}`} className="premium-snapshot-row">
                  <span className="premium-skeleton-line" aria-hidden="true" />
                </li>
              ))}
            </ul>
          ) : status.data_status === "error" ? (
            <p className="premium-snapshot-note">System status temporarily unavailable</p>
          ) : (
            <ul className="premium-snapshot-list">
              {monitorRows.map((row) => (
                <li key={row.label} className="premium-snapshot-row">
                  <span className="premium-snapshot-key">{row.label}</span>
                  <span className="premium-snapshot-value">{row.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="premium-snapshot-col">
          <p className="premium-snapshot-title">Risk Controls</p>
          {statusState.isLoading ? (
            <ul className="premium-snapshot-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <li key={`risk-loading-${index}`} className="premium-snapshot-row">
                  <span className="premium-skeleton-line" aria-hidden="true" />
                </li>
              ))}
            </ul>
          ) : status.data_status === "error" ? (
            <p className="premium-snapshot-note">Risk controls status unavailable</p>
          ) : (
            <>
              <ul className="premium-snapshot-list">
                {riskRows.map((row) => (
                  <li key={row.label} className="premium-snapshot-row">
                    <span className="premium-snapshot-key">{row.label}</span>
                    <span className="premium-snapshot-value">{row.value}</span>
                  </li>
                ))}
              </ul>
              <p className="premium-snapshot-note">Risk limits are enforced automatically during execution.</p>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
