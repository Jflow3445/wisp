"use client";
import { useEffect, useRef } from "react";
import { api, type Round } from "./client";

export function usePilotTransport(round: Round | null, throttle: number, elevator: number, observe: (r: Round) => void, refresh: () => Promise<void>, enabled = true) {
  const latest = useRef({ round, throttle, elevator, observe, refresh });
  useEffect(() => { latest.current = { round, throttle, elevator, observe, refresh }; }, [round, throttle, elevator, observe, refresh]);
  const activeId = round?.status === "FLYING" && [6, 7].includes(round.engine) && enabled ? round.id : null;
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false, busy = false, seq = latest.current.round?.pilot?.lastSeq ?? 0;
    const acknowledged = latest.current.round?.pilot;
    let sent = { throttle: Math.round((acknowledged?.throttle ?? .4) * 1000), elevator: Math.round((acknowledged?.elevator ?? 0) * 1000) }, packet: { id: string; seq: number; throttle: number; elevator: number } | null = null;
    const send = async () => {
      const value = latest.current;
      if (cancelled || busy || value.round?.id !== activeId || value.round.status !== "FLYING") return;
      const desired = { throttle: value.throttle, elevator: document.hidden ? 0 : value.elevator };
      if (!packet && desired.elevator === 0 && desired.throttle === sent.throttle && sent.elevator === 0) return;
      packet ??= { id: activeId, seq: Math.max(seq, value.round.pilot?.lastSeq ?? 0) + 1, ...desired };
      busy = true;
      try {
        const response = await api<{ result: Round }>("/api/flight/pilot", packet, 4000);
        seq = response.result.pilot?.lastSeq ?? packet.seq; sent = { throttle: packet.throttle, elevator: packet.elevator }; packet = null;
        if (!cancelled) value.observe(response.result);
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status && status < 500 && status !== 429) { packet = null; await value.refresh(); seq = latest.current.round?.pilot?.lastSeq ?? seq; }
      } finally { busy = false; }
    };
    const timer = setInterval(() => { void send(); }, 330);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeId]);
}

export function PilotControls({ throttle, elevator, onThrottle, onElevator, disabled }: { throttle: number; elevator: number; onThrottle: (v: number) => void; onElevator: (v: number) => void; disabled: boolean }) {
  const handlers = (value: number) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onElevator(value); },
    onPointerUp: () => onElevator(0), onPointerCancel: () => onElevator(0), onLostPointerCapture: () => onElevator(0),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => { if ([" ", "Enter"].includes(event.key)) { event.preventDefault(); onElevator(value); } },
    onKeyUp: () => onElevator(0), onBlur: () => onElevator(0),
  });
  return <div className="f-pilot-controls"><div className="f-pitch-control"><span>Pitch <small>hold gently</small></span><div><button {...handlers(-350)} disabled={disabled} className={elevator < 0 ? "pressed" : ""} aria-label="Pitch nose down"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 5l14 14M7 19h12V7"/></svg><span>Nose down</span></button><button {...handlers(350)} disabled={disabled} className={elevator > 0 ? "pressed" : ""} aria-label="Pitch nose up"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 19 19 5M7 5h12v12"/></svg><span>Nose up</span></button></div><input className="f-pitch-range" type="range" aria-label="Pitch control" min="-1000" max="1000" step="10" value={elevator} onChange={event => onElevator(Number(event.target.value))} disabled={disabled}/></div><label className="f-throttle-control"><span>Throttle <b>{Math.round(throttle / 10)}%</b></span><input type="range" aria-label="Engine throttle" min="0" max="1000" step="10" value={throttle} onChange={event => onThrottle(Number(event.target.value))} disabled={disabled}/><small>Less power <span>More power</span></small></label></div>;
}
