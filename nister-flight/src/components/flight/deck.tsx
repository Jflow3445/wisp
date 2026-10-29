"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Airspace } from "./airspace";
import { PilotControls, usePilotTransport } from "./pilot-controls";
import { Icon } from "./icons";
import { api, date, money, Notice, Status, useWallet, type Round } from "./client";
import { canObserveRound } from "@/lib/flight-observation";
import { readStored, writeStored } from "@/lib/browser-storage";
import { initialAircraft, stepAircraft, type AircraftState } from "@/lib/flight-physics";

function storeRequest(key: string, value: { stake: string; requestKey: string } | null) {
  writeStored("sessionStorage", key, value ? JSON.stringify(value) : null);
}

export function FlightDeck({ accountId }: { accountId: string }) {
  const { data, error, refresh, receivedAt, rememberRound } = useWallet();
  const [stake, setStake] = useState("1.00"), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [round, setRound] = useState<Round | null>(null), [uncertain, setUncertain] = useState(false), [clock, setClock] = useState(0);
  const [throttle, setThrottle] = useState(400), [elevator, setElevator] = useState(0), [forces, setForces] = useState(true);
  const [practice, setPractice] = useState<AircraftState | null>(null), [practiceEnded, setPracticeEnded] = useState(false), [sound, setSound] = useState(false);
  const pending = useRef<{ stake: string; requestKey: string } | null>(null), dismissed = useRef(""), recovered = useRef("");
  const audio = useRef<AudioContext | null>(null), lastResult = useRef("");
  const cockpit = useRef<HTMLElement>(null);
  const storageKey = `nister.flight.start.${accountId}`;
  const observe = useCallback((receipt: Round) => {
    if (rememberRound(receipt)) setRound(current => canObserveRound(current, receipt) ? receipt : current);
  }, [rememberRound]);
  useEffect(() => { try { const saved = readStored("sessionStorage", storageKey); if (saved) { pending.current = JSON.parse(saved); setStake(pending.current!.stake); setUncertain(true); } } catch { storeRequest(storageKey, null); } }, [storageKey]);
  useEffect(() => {
    if (!data) return;
    const latest = data.rounds[0], saved = pending.current && data.rounds.find(r => r.requestKey === pending.current!.requestKey);
    if (saved) { setRound(current => canObserveRound(current, saved) ? saved : current); pending.current = null; setUncertain(false); storeRequest(storageKey, null); }
    if (latest && latest.id !== dismissed.current) setRound(current => current || latest.status === "FLYING" ? canObserveRound(current, latest) ? latest : current : null);
  }, [data, storageKey]);
  useEffect(() => { const timer = setInterval(() => setClock(performance.now()), 250); return () => clearInterval(timer); }, []);
  const flying = round?.status === "FLYING", done = !!round && !flying;
  const age = data ? Math.max(0, clock - receivedAt) : Infinity, stale = age > 5000;
  const elapsed = round ? Math.max(0, Date.parse(round.serverNow) - Date.parse(round.startedAt) + Math.max(0, clock - receivedAt)) : 0;
  const duration = round ? Date.parse(round.endsAt) - Date.parse(round.startedAt) : 24000;
  const remaining = Math.max(0, (duration - elapsed) / 1000), awaiting = !!flying && elapsed > duration;
  const controlling = (!!flying && round.engine === 6 && !awaiting && !stale) || (!!practice && !practiceEnded);
  usePilotTransport(round, throttle, elevator, observe, refresh);
  const recover = useCallback(async () => {
    if (!round || busy) return;
    setBusy(true); setMessage("");
    try { const response = await api<{ result: Round }>("/api/flight", { action: "recover", id: round.id }, 12000); observe(response.result); }
    catch { setMessage("Connection delayed. Your flight is saved. Check the result again in a moment."); }
    finally { setBusy(false); void refresh(); }
  }, [round, busy, observe, refresh]);
  useEffect(() => { if (awaiting && elapsed > duration + 1200 && recovered.current !== round?.id) { recovered.current = round!.id; void recover(); } }, [awaiting, elapsed, duration, round, recover]);
  useEffect(() => {
    const release = () => setElevator(0);
    const keydown = (event: KeyboardEvent) => {
      if (!controlling || (event.target as HTMLElement).closest("input, textarea, select, button, a")) return;
      if (["ArrowUp", "w", "W", "ArrowDown", "s", "S"].includes(event.key)) { event.preventDefault(); setElevator(["ArrowUp", "w", "W"].includes(event.key) ? 350 : -350); }
      if (["+", "=" , "-"].includes(event.key)) { event.preventDefault(); setThrottle(value => Math.max(0, Math.min(1000, value + (event.key === "-" ? -50 : 50)))); }
    };
    const keyup = (event: KeyboardEvent) => { if (["ArrowUp", "w", "W", "ArrowDown", "s", "S"].includes(event.key)) release(); };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", release); document.addEventListener("visibilitychange", release);
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", release); };
  }, [controlling]);
  useEffect(() => { setThrottle(400); setElevator(0); if (round?.status === "FLYING") { setPractice(null); setPracticeEnded(false); } }, [round?.id, round?.status]);
  const practicing = !!practice, sceneId = round?.id, sceneStatus = round?.status;
  useEffect(() => {
    if (!sceneId && !practicing) return;
    const element = cockpit.current, box = element?.getBoundingClientRect();
    if (element && box && (box.top < 0 || box.bottom > window.innerHeight)) element.scrollIntoView({ block: "start", behavior: "auto" });
  }, [sceneId, sceneStatus, practicing]);
  useEffect(() => {
    if (!practicing || practiceEnded) return;
    const timer = setInterval(() => setPractice(state => {
      if (!state) return null;
      let next = state;
      for (let n = 0; n < 6; n++) next = stepAircraft(next, { throttle: throttle / 1000, elevator: elevator / 1000 }, { x: Math.sin(next.x / 300) * 4, y: Math.sin(next.x / 200) });
      if (next.grounded !== "AIRBORNE" || next.x > 9500) setPracticeEnded(true);
      return next;
    }), 20);
    return () => clearInterval(timer);
  }, [practicing, practiceEnded, throttle, elevator]);
  useEffect(() => {
    if (!done || !round || lastResult.current === round.id) return;
    lastResult.current = round.id; setElevator(0);
    const context = audio.current;
    if (!sound || !context) return;
    const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.connect(gain); gain.connect(context.destination);
    oscillator.type = "sine"; oscillator.frequency.setValueAtTime(440, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + .15);
    gain.gain.setValueAtTime(.025, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .4); oscillator.start(); oscillator.stop(context.currentTime + .4);
  }, [done, round, sound]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  const launch = async () => {
    if (busy || flying) return;
    setBusy(true); setMessage(""); setPractice(null); setPracticeEnded(false);
    const request = pending.current ?? { stake, requestKey: crypto.randomUUID() };
    pending.current = request; storeRequest(storageKey, request); setUncertain(true);
    try {
      const response = await api<{ result: Round }>("/api/flight", { action: "start", ...request, rulesVersion: data?.termsVersion }, 12000); observe(response.result);
      pending.current = null; storeRequest(storageKey, null); setUncertain(false);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status && status < 500 && status !== 429) { pending.current = null; storeRequest(storageKey, null); setUncertain(false); setMessage((err as Error).message); }
      else setMessage("Connection delayed. Your request is saved. Recover this flight before starting another.");
    } finally { setBusy(false); void refresh(); }
  };
  const collect = async () => {
    if (!round?.offerId || busy) return;
    setBusy(true); setMessage(""); setElevator(0);
    try { const response = await api<{ result: Round }>("/api/flight", { action: "collect", id: round.id, offerId: round.offerId }, 12000); observe(response.result); }
    catch (err) { setMessage((err as Error).message); }
    finally { setBusy(false); void refresh(); }
  };
  const consent = async () => { setBusy(true); try { await api("/api/flight", { action: "consent", accepted: true, rulesVersion: data?.termsVersion }); await refresh(); } catch (err) { setMessage((err as Error).message); } finally { setBusy(false); } };
  const reset = () => { dismissed.current = round?.id ?? ""; setRound(null); setPractice(null); setPracticeEnded(false); setElevator(0); setThrottle(400); setMessage(""); void refresh(); };
  const stakeCents = /^\d{1,8}(\.\d{1,2})?$/.test(stake.trim()) ? Math.round(Number(stake) * 100) : NaN, feeCents = Math.ceil(stakeCents * .03);
  const validStake = data && Number.isFinite(stakeCents) && stakeCents >= data.control.minStakeCents && stakeCents <= data.control.maxStakeCents && stakeCents + feeCents <= data.availableCents;
  const controlPending = !!flying && !!round.pilot && (round.pilot.throttle !== throttle / 1000 || round.pilot.elevator !== elevator / 1000);
  const plane = practice ?? round?.pilot, net = round ? (round.payoutCents ?? 0) - round.totalCostCents : 0;
  const ending = round?.status === "COLLECTED" ? "Return collected" : round?.pilot?.stop === "LANDED" ? "Touchdown confirmed" : ["CRASHED", "TURBULENCE"].includes(round?.pilot?.stop ?? "") ? "Flight ended" : "Flight complete";
  return <>
    <div className="f-deck-heading"><div><div className="f-eyebrow">NISTER AIRSPACE / FLIGHT DECK</div><h1>Take the controls<span>.</span></h1></div><div className="f-deck-balance"><small>AVAILABLE · USD</small><strong>${data ? money(data.availableCents) : "—"}</strong><Link href="/dashboard/wallet">Add funds ↗︎</Link></div></div>
    <Notice error>{message || error}</Notice>
    {data?.isTestAccount && <div className="f-session-label">Test session · Gameplay balance · Cleared at public launch</div>}
    <section ref={cockpit} className="f-cockpit" aria-label="Flight game">
      <div className="f-cockpit-main"><div className={`f-airspace-wrap ${done ? "is-finished" : ""}`}>
        <Airspace round={round} practice={practice} input={{ throttle: throttle / 1000, elevator: elevator / 1000 }} forces={forces}/>
        <div className="f-airspace-header"><span className={`f-airspace-status ${flying ? "active" : ""}`}><i/>{practice ? "PRACTICE · NO MONEY" : awaiting ? "CONFIRMING RESULT" : flying ? "AIRBORNE" : done ? "FLIGHT CLOSED" : "READY TO FLY"}</span><div><button aria-pressed={forces} onClick={() => setForces(!forces)} aria-label="Show air forces">Forces {forces ? "on" : "off"}</button><button aria-pressed={sound} onClick={() => { if (!sound) { audio.current ??= new AudioContext(); void audio.current.resume(); } setSound(!sound); }} aria-label="Flight sound">Sound {sound ? "on" : "off"}</button></div></div>
        {!done && <div className="f-flight-value"><span>{practice ? "LEARN THE CONTROLS" : flying ? "CURRENT RETURN · USD" : "YOUR AIRCRAFT. YOUR CALL."}</span><strong>{practice ? "Free flight" : flying ? `$${money(round.currentCents)}` : "Find your balance."}</strong><p>{practice ? "No stake. No wallet changes." : flying ? `${(round.currentCents / round.stakeCents).toFixed(2)}× stake · ${awaiting ? "Waiting for receipt" : `${remaining.toFixed(1)}s remaining`}` : "Feel the wind. Fly with intent."}</p></div>}
        {done && <div className="f-result" role="status" aria-live="polite"><span className="f-result-check">✓</span><small>CONFIRMED RESULT</small><h2>{ending}</h2><strong>${money(round.payoutCents ?? 0)} <small>USD returned</small></strong><p className={net >= 0 ? "f-positive" : ""}>{net >= 0 ? "+" : "−"}${money(Math.abs(net))} net, including ${money(round.feeCents)} play fee</p><span>Wallet updated · Receipt saved in Activity</span></div>}
        {!done && <div className="f-airspace-caption">{plane?.stalled ? <b className="f-stall-warning">STALL · Ease the nose down and restore airspeed</b> : plane?.grounded === "CRASHED" ? "Practice ended · Reset to fly again" : <span>{flying || practice ? "↑ / ↓ to pitch · + / − for power" : "Lift · Drag · Thrust · Gravity"}</span>}{flying && <span className={stale || awaiting || controlPending ? "f-connection-warning" : ""}>{stale ? "Reconnecting…" : awaiting ? "Checking final result…" : controlPending ? "Syncing controls…" : "● Connected"}</span>}</div>}
      </div>
      <div className="f-instruments" aria-label="Aircraft instruments"><div><small>AIRSPEED</small><strong>{plane ? Math.round(plane.airspeed * 1.94384) : "—"}<em>kt</em></strong></div><div><small>ALTITUDE</small><strong>{plane ? Math.round(plane.y) : "—"}<em>m</em></strong></div><div><small>VERTICAL SPEED</small><strong>{plane ? `${plane.vy > 0 ? "+" : ""}${plane.vy.toFixed(1)}` : "—"}<em>m/s</em></strong></div><div><small>FLIGHT CONDITION</small><strong>{round?.pilot && !practice ? Math.round(round.pilot.conditionBps / 100) : practice ? Math.round((.35 + practice.quality * .65) * practice.integrityBp / 100) : "—"}<em>%</em></strong></div></div>
      <PilotControls throttle={throttle} elevator={elevator} onThrottle={setThrottle} onElevator={setElevator} disabled={!controlling}/>
      {forces && plane && <div className="f-force-readings">{(["lift", "drag", "thrust", "weight"] as const).map(key => <span key={key} className={`force-${key}`}>{key} <b>{(Math.hypot(plane.forces[key].x, plane.forces[key].y) / 1000).toFixed(1)} kN</b></span>)}</div>}
      <div className="f-flight-dock">
        {flying ? <><div><small>{awaiting ? "YOUR FLIGHT IS SAVED" : "YOU CAN END THE FLIGHT HERE"}</small><span>{awaiting ? "Confirming your final return" : "Collection uses the return when your request arrives."}</span></div><button className="f-button f-collect" onClick={awaiting || stale ? recover : collect} disabled={busy}>{busy ? "Checking flight…" : awaiting || stale ? "Check flight result" : `Collect $${money(round.currentCents)}`} <Icon name="down"/></button></> : done ? <><div><small>FLIGHT FINISHED</small><span>Take a moment. Your next flight is your choice.</span></div><button className="f-button" onClick={reset}>Back to flight setup <Icon name="arrow"/></button></> : practice ? <><div><small>FREE PRACTICE</small><span>{practiceEnded ? "Practice complete. No money was used." : "Gentle pitch and steady airspeed preserve condition."}</span></div><button className="f-button f-button-secondary" onClick={reset}>Exit practice</button></> : <><span className="f-muted">Try the controls before staking.</span><button className="f-button f-button-secondary" disabled={uncertain || busy} onClick={() => { setPractice(initialAircraft()); setPracticeEnded(false); setThrottle(400); }}>Practice free ↗︎</button></>}
      </div></div>
      <aside className="f-flight-setup"><div className="f-panel-heading"><h2>{flying ? "Flight in progress" : done ? "Flight receipt" : practice ? "Your flight manual" : "Prepare your flight"}</h2><Icon name="flight"/></div>
        {flying || done ? <><div className="f-flight-details"><div><span>Stake</span><strong>${money(round.stakeCents)}</strong></div><div><span>Play fee · 3%</span><strong>${money(round.feeCents)}</strong></div><div className="f-cost-total"><span>Wallet cost</span><strong>${money(round.totalCostCents)}</strong></div></div><p className="f-helper">{round.engine === 6 ? "Airspeed, angle of attack and aircraft condition affect your cash return. Gentle inputs help; stalls and impacts reduce it. Random changes can still end the flight at zero." : "This earlier flight uses its original rules. Piloting opens on your next flight."}</p><Link className="f-text-link" href="/dashboard/activity">View flight receipts ↗︎</Link></> : <>
        <p className="f-muted">{practice ? "Lift acts across the airflow. Thrust builds airspeed. Pitch changes your wing’s angle to the air." : "Choose a comfortable stake. Keep your aircraft steady, or collect the current return."}</p>
        {!practice && <><label className="f-field-label" htmlFor="stake">STAKE · USD</label><div className="f-amount-input"><span>$</span><input id="stake" inputMode="decimal" value={stake} onChange={e => setStake(e.target.value)} disabled={busy || uncertain} aria-label="Stake in USD"/><b>USD</b></div><div className="f-quick-amounts">{[1, 2, 3, 5].map(value => <button key={value} className={Number(stake) === value ? "selected" : ""} onClick={() => setStake(value.toFixed(2))} disabled={busy || uncertain || !data || value * 100 > data.control.maxStakeCents}>${value}</button>)}</div>
        <div className="f-flight-details"><div><span>Play fee · 3%</span><strong>{Number.isFinite(feeCents) ? `$${money(feeCents)}` : "—"}</strong></div><div className="f-cost-total"><span>Total from wallet</span><strong>{Number.isFinite(stakeCents) ? `$${money(stakeCents + feeCents)}` : "—"}</strong></div></div>
        <p className="f-helper">Fee applies once, win or lose. {data && data.control.maxStakeCents >= data.control.minStakeCents ? `Stake range $${money(data.control.minStakeCents)}–$${money(data.control.maxStakeCents)}.` : "Flights are temporarily full."}</p>
        {data && !data.termsAccepted ? <div className="f-consent"><p>Piloting affects real money. Random changes, stalls and impacts can reduce the return to zero. You can lose your full stake plus the fee. Read the <Link href="/dashboard/help">updated game rules</Link>.</p><button className="f-button f-button-full" onClick={consent} disabled={busy}>I’m 18+ and accept the rules</button></div> : <button className="f-button f-button-full" onClick={launch} disabled={busy || !data || stale || (!uncertain && (!data.eligible || !data.control.enabled || !validStake))}>{busy ? "Preparing flight…" : uncertain ? "Recover this flight" : "Take flight"} <Icon name="flight"/></button>}
        {data && !data.control.enabled && <p className="f-helper">Paid flights are paused. Free practice and your wallet remain available.</p>}
        {data && !data.eligible && <p className="f-helper">{!data.control.isLive && !data.isTestAccount && data.user.role !== "ADMIN" ? "Public play is preparing for launch." : "Your account needs an eligibility review before paid play."}</p>}
        {!uncertain && data?.termsAccepted && !validStake && <p className="f-helper">Choose an amount within the stake range and your available balance, including the fee.</p>}</>}
        <div className="f-pilot-tip"><b>Small inputs. Better control.</b><p>Hold nose up gently to climb. Ease down if airspeed falls. Excess pitch can stall the wing. Power helps overcome drag.</p><Link className="f-text-link" href="/dashboard/help">Read the flight manual ↗︎</Link></div></>}
      </aside>
    </section>
    <section className="f-panel f-recent-flights"><div className="f-panel-heading"><h2>Recent flights</h2><Link href="/dashboard/activity" className="f-text-link">All activity ↗︎</Link></div><div className="f-table-scroll"><table className="f-table"><thead><tr><th>FLIGHT</th><th>STAKE</th><th>RETURN</th><th>STATUS</th><th>TIME · UTC</th></tr></thead><tbody>{data?.rounds.slice(0, 5).map(r => <tr key={r.id}><td><code>{r.id.slice(-7).toUpperCase()}</code></td><td>${money(r.stakeCents)}</td><td>{r.status === "FLYING" ? "In flight" : `$${money(r.payoutCents ?? 0)}`}</td><td><Status value={r.status}/></td><td>{date(r.startedAt)}</td></tr>)}</tbody></table>{!data?.rounds.length && <div className="f-empty">Your confirmed flights will appear here.</div>}</div></section>
  </>;
}
