"use client";
import { useId } from "react";
import type { Round } from "./client";
import { money } from "./client";

export function FlightChart({ round, compact = false }: { round?: Round | null; compact?: boolean }) {
  const id = useId().replaceAll(":", ""), active = round?.status === "FLYING";
  const value = round ? round.currentCents / round.stakeCents : 1;
  const points = round?.points ?? [0.95, 1.08, 1.01, 1.26, 1.19, 1.48, 1.39, 1.72].map(v => Math.round(v * 100));
  const stake = round?.stakeCents ?? 100;
  const coords = points.map((v, i) => ({ x: 48 + i * (572 / Math.max(7, points.length - 1)), y: 290 - Math.min(2, v / stake) * 110 }));
  const line = coords.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const last = coords.at(-1)!;
  return <div className={`f-flight-stage ${active ? "is-flying" : ""} ${round?.currentCents === 0 ? "is-zero" : ""} ${compact ? "is-compact" : ""}`}>
    <div className="f-stage-top"><span className="f-stage-label"><span className="f-dot"/>{active ? "FLIGHT IN PROGRESS" : round ? "FLIGHT COMPLETE" : "READY FOR TAKEOFF"}</span><span className="f-stage-code">YOUR AIRSPACE <span>↗︎</span></span></div>
    <div className="f-multiplier"><span>{round ? active ? "CURRENT RETURN" : "FINAL RETURN" : "YOUR NEXT MOMENT"}</span><strong>{round ? value.toFixed(2) : "1.00"}<em>×</em></strong><p>{round ? <>{money(round.currentCents)} <b>USD</b> <small className={round.currentCents >= round.totalCostCents ? "f-positive" : "f-negative"}>{round.currentCents >= round.totalCostCents ? "+" : "−"}{money(Math.abs(round.currentCents - round.totalCostCents))}</small></> : "A little timing. A new perspective."}</p></div>
    <svg viewBox="0 0 700 340" className="f-flight-chart" role="img" aria-label={round ? `Flight return ${value.toFixed(2)} times your stake` : "Illustration of a flight path"}>
      <defs><linearGradient id={`${id}fill`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d8fa74" stopOpacity=".18"/><stop offset="1" stopColor="#d8fa74" stopOpacity="0"/></linearGradient><linearGradient id={`${id}line`}><stop stopColor="#53793e"/><stop offset="1" stopColor="#e1ff91"/></linearGradient><linearGradient id={`${id}plane`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f5ffe0"/><stop offset="1" stopColor="#a8c666"/></linearGradient><filter id={`${id}glow`}><feGaussianBlur stdDeviation="6"/></filter></defs>
      <g className="f-chart-grid">{[70, 125, 180, 235, 290].map(y => <path key={y} d={`M40 ${y}H660`}/>)}{[48, 130, 212, 294, 376, 458, 540, 622].map(x => <path key={x} d={`M${x} 40V290`}/>)}</g>
      <path d="M40 180H660" stroke="#d8fa74" strokeOpacity=".18" strokeDasharray="4 6"/>
      <g className="f-chart-axis"><text x="662" y="73">2.0×</text><text x="662" y="183">1.0×</text><text x="662" y="293">0.0×</text><text x="45" y="320">TAKEOFF</text><text x="565" y="320">LANDING</text></g>
      <path d={`${line} L${last.x},290 L48,290 Z`} fill={`url(#${id}fill)`}/>
      <path d={line} stroke="#b9ec69" strokeWidth="9" fill="none" opacity=".15" filter={`url(#${id}glow)`}/>
      <path d={line} stroke={`url(#${id}line)`} strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
      <g className="f-chart-plane" style={{ transform: `translate(${last.x}px, ${last.y}px)` }}><circle r="28" fill="#d8fa74" opacity=".045"/><circle r="15" fill="#d8fa74" opacity=".055"/><g transform="rotate(-18)"><path d="M-25 2-4-3 9-20 16-21 12-3 29 1Q35 3 28 6L10 8 13 24 6 23-5 9-24 9-31 18-35 16-31 5-35-5-31-7Z" fill={`url(#${id}plane)`}/><path d="M-25 4H24" stroke="#fff" strokeOpacity=".6"/></g></g>
    </svg>
    <div className="f-stage-bottom"><span><span className="f-live-bars"><i/><i/><i/></span>{active ? "Your flight is in the air" : "Your next moment awaits"}</span><span>{active ? "Collect when you choose" : "Ready when you are"}</span></div>
  </div>;
}
