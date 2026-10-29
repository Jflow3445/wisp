"use client";
import { Airspace } from "./airspace";
import type { Round } from "./client";

export function FlightChart({ round = null, compact = false }: { round?: Round | null; compact?: boolean }) {
  return <div className={`f-airspace-wrap f-preview-airspace ${compact ? "is-compact" : ""}`}><Airspace round={round} practice={null} input={{ throttle: .4, elevator: 0 }} forces={false}/><div className="f-airspace-header"><span className="f-airspace-status"><i/>NISTER AIRSPACE</span><span className="f-stage-code">YOUR NEXT FLIGHT</span></div><div className="f-flight-value"><span>THE ART OF A GOOD FLIGHT</span><strong>Find your balance.</strong><p>A short flight. One clear result.</p></div><div className="f-airspace-caption"><span>Your entry. Your reveal.</span><span>Ready when you are</span></div></div>;
}
