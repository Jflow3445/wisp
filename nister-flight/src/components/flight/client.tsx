"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { flightSnapshot } from "@/lib/flight-service";
import { canObserveRound } from "@/lib/flight-observation";
export type Snapshot = Awaited<ReturnType<typeof flightSnapshot>>;
export type Round = Snapshot["rounds"][number];
export const money = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const date = (value: string | Date) => new Date(value).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export async function api<T = unknown>(path: string, payload?: unknown, timeoutMs = payload ? 20000 : 5000): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(timeoutMs), ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) });
  const value = await response.json();
  if (!response.ok) throw Object.assign(new Error(value.message || value.error || "Request unavailable. Try again."), { status: response.status });
  return value;
}

export function useWallet() {
  const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(""), [receivedAt, setReceivedAt] = useState(0);
  const pending = useRef(false), alive = useRef(true), watermark = useRef(0), knownRound = useRef<Round | null>(null), needsRefresh = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    try {
      const result = await api<Snapshot>("/api/flight"), timestamp = Date.parse(result.serverNow);
      if (alive.current && timestamp >= watermark.current && canObserveRound(knownRound.current, result.rounds[0])) { watermark.current = timestamp; knownRound.current = result.rounds[0] ?? null; needsRefresh.current = false; setData(result); setReceivedAt(performance.now()); setError(""); }
    }
    catch (err) { if (alive.current) setError(err instanceof Error ? err.message : "Unable to refresh your account."); }
    finally { pending.current = false; }
  }, []);
  const rememberRound = useCallback((round: Round) => {
    const timestamp = Date.parse(round.serverNow);
    if (!canObserveRound(knownRound.current, round)) return false;
    knownRound.current = round;
    needsRefresh.current = true;
    watermark.current = Math.max(watermark.current, timestamp);
    setReceivedAt(performance.now());
    setError("");
    setData(current => current ? { ...current, serverNow: new Date(watermark.current).toISOString(), rounds: [round, ...current.rounds.filter(r => r.id !== round.id)].slice(0, 20) } : current);
    return true;
  }, []);
  const fast = data?.rounds[0]?.status === "FLYING";
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { await refresh(); if (!cancelled) timer = setTimeout(poll, fast || needsRefresh.current ? 700 : 12000); };
    void poll();
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("focus", focus); };
  }, [refresh, fast]);
  return { data, error, refresh, setData, receivedAt, rememberRound };
}

export function Status({ value }: { value: string }) {
  return <span className={`f-status f-status-${value.toLowerCase()}`}>{value.replaceAll("_", " ")}</span>;
}

export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return children ? <div className={`f-notice ${error ? "f-notice-error" : ""}`} role={error ? "alert" : "status"}>{children}</div> : null;
}
