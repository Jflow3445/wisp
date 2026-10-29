"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Airspace } from "./airspace";
import { PilotControls, usePilotTransport } from "./pilot-controls";
import { Icon } from "./icons";
import { api, date, money, Notice, Status, useWallet, type Round, type MissionOffer } from "./client";
import { canObserveRound } from "@/lib/flight-observation";
import { readStored, writeStored } from "@/lib/browser-storage";
import { advanceMission, initialMission, MISSION, MISSION_OUTCOMES, missionObjective, TRAINING_COURSE, type MissionState } from "@/lib/flight-mission";

function storeRequest(key: string, value: { stake: string; requestKey: string; offerId?: string; offerCommitment?: string } | null) {
  writeStored("sessionStorage", key, value ? JSON.stringify(value) : null);
}

export function LegacyFlightDeck({ accountId, onExit }: { accountId: string; onExit: () => void }) {
  const { data, error, refresh, receivedAt, rememberRound } = useWallet();
  const [stake, setStake] = useState("1.00"), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [round, setRound] = useState<Round | null>(null), [uncertain, setUncertain] = useState(false), [clock, setClock] = useState(0);
  const [throttle, setThrottle] = useState(400), [elevator, setElevator] = useState(0), [forces, setForces] = useState(true);
  const [practice, setPractice] = useState<MissionState | null>(null), [practiceEnded, setPracticeEnded] = useState(false), [sound, setSound] = useState(false);
  const pending = useRef<{ stake: string; requestKey: string; offerId?: string; offerCommitment?: string } | null>(null), dismissed = useRef(""), recovered = useRef("");
  const initializedControls = useRef("");
  const audio = useRef<AudioContext | null>(null), lastResult = useRef("");
  const cockpit = useRef<HTMLElement>(null);
  const [offer, setOffer] = useState<MissionOffer | null>(null), [offerError, setOfferError] = useState(""), [abortPrompt, setAbortPrompt] = useState(false);
  const [offerRevision, setOfferRevision] = useState(0);
  const storageKey = `nister.flight.start.${accountId}`;
  const observe = useCallback((receipt: Round) => {
    if (rememberRound(receipt)) setRound(current => canObserveRound(current, receipt) ? receipt : current);
  }, [rememberRound]);
  useEffect(() => { try { const saved = readStored("sessionStorage", storageKey); if (saved) { pending.current = JSON.parse(saved); setStake(pending.current!.stake); setUncertain(true); } } catch { storeRequest(storageKey, null); } }, [storageKey]);
  useEffect(() => {
    if (!data) return;
    const latest = data.rounds[0], saved = pending.current && data.rounds.find(r => r.requestKey === pending.current!.requestKey);
    if (saved) { setRound(current => canObserveRound(current, saved) ? saved : current); pending.current = null; setUncertain(false); storeRequest(storageKey, null); }
    if (latest && latest.id !== dismissed.current) setRound(current => current || ["FLYING", "AWAITING_RESULT"].includes(latest.status) ? canObserveRound(current, latest) ? latest : current : null);
  }, [data, storageKey]);
  useEffect(() => { const timer = setInterval(() => setClock(performance.now()), 250); return () => clearInterval(timer); }, []);
  const flying = round?.status === "FLYING", waiting = round?.status === "AWAITING_RESULT", active = flying || waiting, done = !!round && !active;
  const age = data ? Math.max(0, clock - receivedAt) : Infinity, stale = age > 5000;
  const signedElapsed = round ? Date.parse(round.serverNow) - Date.parse(round.startedAt) + Math.max(0, clock - receivedAt) : 0;
  const elapsed = Math.max(0, signedElapsed), countdown = Math.max(0, -signedElapsed / 1000), preparing = !!active && countdown > 0;
  const duration = round ? Date.parse(round.endsAt) - Date.parse(round.startedAt) : MISSION.durationMs;
  const remaining = Math.max(0, (duration - elapsed) / 1000), awaiting = !!active && elapsed > duration;
  const controlling = (!!flying && [6, 7].includes(round.engine) && !preparing && !awaiting && !stale) || (!!practice && !practiceEnded);
  usePilotTransport(round, throttle, elevator, observe, refresh, !preparing);
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
  useEffect(() => {
    if (!round || initializedControls.current === round.id) return;
    initializedControls.current = round.id;
    setThrottle(Math.round((round.pilot?.throttle ?? .4) * 1000)); setElevator(0);
    if (round.status === "FLYING") { setPractice(null); setPracticeEnded(false); }
  }, [round]);
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
      const next = advanceMission({ ...state, throttle: throttle / 1000, elevator: elevator / 1000, lastInputTick: state.tick }, state.tick * MISSION.tickMs + 20, TRAINING_COURSE, ms => ({ x: Math.sin(ms / 2500) * 6, y: Math.sin(ms / 3400) * 1.5 }));
      if (next.stop) setPracticeEnded(true);
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
    const won = (round.payoutCents ?? 0) > round.totalCostCents;
    oscillator.type = "sine"; oscillator.frequency.setValueAtTime(won ? 440 : 220, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(won ? 660 : 160, context.currentTime + .15);
    gain.gain.setValueAtTime(.025, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .4); oscillator.start(); oscillator.stop(context.currentTime + .4);
  }, [done, round, sound]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  const launch = async () => {
    if (busy || active) return;
    setBusy(true); setMessage(""); setPractice(null); setPracticeEnded(false);
    const request = pending.current ?? { stake, requestKey: crypto.randomUUID(), offerId: offer?.id, offerCommitment: offer?.commitment };
    pending.current = request; storeRequest(storageKey, request); setUncertain(true);
    try {
      const response = await api<{ result: Round }>("/api/flight", { action: "start", ...request, rulesVersion: data?.termsVersion }, 12000); observe(response.result);
      pending.current = null; storeRequest(storageKey, null); setUncertain(false);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status && status < 500 && status !== 429) { pending.current = null; storeRequest(storageKey, null); setUncertain(false); setMessage((err as Error).message); setOfferRevision(value => value + 1); }
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
  const reset = () => { onExit(); dismissed.current = round?.id ?? ""; setRound(null); setPractice(null); setPracticeEnded(false); setAbortPrompt(false); setOffer(null); setElevator(0); setThrottle(400); setMessage(""); void refresh(); };
  const stakeCents = /^\d{1,8}(\.\d{1,2})?$/.test(stake.trim()) ? Math.round(Number(stake) * 100) : NaN, feeCents = Math.ceil(stakeCents * 300 / 10000);
  const validStake = data && Number.isFinite(stakeCents) && stakeCents >= data.control.minStakeCents && stakeCents <= data.control.maxStakeCents && stakeCents + feeCents <= data.availableCents;
  const readyForOffer = !round && !practice, hasAccount = !!data;
  useEffect(() => {
    if (!readyForOffer || !hasAccount) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    setOffer(null); setOfferError("");
    const loadOffer = async () => {
      if (!/^\d{1,8}(\.\d{1,2})?$/.test(stake.trim()) || Number(stake) <= 0) return;
      try { const response = await api<{ offer: MissionOffer }>("/api/flight/offer", { stake }, 5000); if (!cancelled) { setOffer(response.offer); setOfferError(""); } }
      catch (err) { if (!cancelled) setOfferError((err as Error).message); }
      if (!cancelled) timer = setTimeout(loadOffer, 30000);
    };
    timer = setTimeout(loadOffer, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [readyForOffer, hasAccount, stake, offerRevision]);
  const abandon = async () => {
    if (!round || busy) return;
    setBusy(true); setMessage("");
    try { const response = await api<{ result: Round }>("/api/flight", { action: "abort", id: round.id, confirmed: true }, 12000); observe(response.result); setAbortPrompt(false); }
    catch (err) { setMessage((err as Error).message); }
    finally { setBusy(false); void refresh(); }
  };
  const controlPending = !!flying && !!round.pilot && (round.pilot.throttle !== throttle / 1000 || round.pilot.elevator !== elevator / 1000);
  const plane = practice?.aircraft ?? round?.pilot, net = round ? (round.payoutCents ?? 0) - round.totalCostCents : 0;
  const mission = round?.mission, objective = practice ? missionObjective(practice, TRAINING_COURSE) : mission?.objective;
  const resultName = mission?.result === "WIN" ? mission.mode === "PVP" ? "Contest won" : "Mission won" : mission?.result === "DRAW" ? "Contest drawn" : mission?.result === "BOTH_FAILED" ? "Neither pilot landed safely" : mission?.mode === "PVP" && round?.pilot?.stop === "LANDED" ? "Contest lost - lower score" : round?.pilot?.stop && round.pilot.stop in MISSION_OUTCOMES ? MISSION_OUTCOMES[round.pilot.stop as keyof typeof MISSION_OUTCOMES] : "Mission ended";
  const ending = mission ? resultName : round?.status === "COLLECTED" ? "Return collected" : "Flight complete";
  const objectiveTitle = objective?.phase === "CHECKPOINT" ? `Checkpoint ${objective.number} / 3` : "Final approach";
  const objectiveDescription = objective?.phase === "CHECKPOINT" ? `${objective.low}-${objective.high} m altitude - ${objective.distance} m ahead` : "Land between the runway flags - descend gently";
  const advertisedPrize = mission ? mission.mode === "PVP" ? mission.prizes.contestCents ?? 0 : mission.prizes.soloCents : 0;
  return <>
    <div className="f-deck-heading"><div><div className="f-eyebrow">NISTER AIRSPACE / FLIGHT DECK</div><h1>Fly the mission<span>.</span></h1></div><div className="f-deck-balance"><small>AVAILABLE - USD</small><strong>${data ? money(data.availableCents) : "--"}</strong><Link href="/dashboard/wallet">Add funds &#8599;</Link></div></div>
    <Notice error>{message || error}</Notice>
    {data?.isTestAccount && <div className="f-session-label">Test session - Gameplay balance - Cleared at public launch</div>}
    <section ref={cockpit} className="f-cockpit" aria-label="Flight game">
      <div className="f-cockpit-main"><div className={`f-airspace-wrap ${done ? "is-finished" : ""}`}>
        <Airspace round={round} practice={practice?.aircraft ?? null} course={practice ? TRAINING_COURSE : mission?.course} input={{ throttle: throttle / 1000, elevator: elevator / 1000 }} forces={forces} paused={preparing}/>
        <div className="f-airspace-header"><span className={`f-airspace-status ${flying && !preparing ? "active" : ""}`}><i/>{practice ? "PRACTICE - NO MONEY" : waiting ? "WAITING FOR OTHER PILOT" : preparing ? `TAKEOFF IN ${Math.ceil(countdown)}s` : awaiting ? "CONFIRMING RESULT" : flying ? mission?.mode === "PVP" ? "PILOT CONTEST" : "AIRBORNE" : done ? "FLIGHT CLOSED" : "READY TO FLY"}</span><div><button aria-pressed={forces} onClick={() => setForces(!forces)} aria-label="Show air forces">Forces {forces ? "on" : "off"}</button><button aria-pressed={sound} onClick={() => { if (!sound) { audio.current ??= new AudioContext(); void audio.current.resume(); } setSound(!sound); }} aria-label="Flight sound">Sound {sound ? "on" : "off"}</button></div></div>
        {!done && !waiting && <div className="f-flight-value"><span>{practice ? "LEARN THE MISSION" : preparing ? mission?.mode === "PVP" ? "OPPONENT MATCHED" : "PREPARING YOUR FLIGHT" : mission ? "YOUR NEXT OBJECTIVE" : flying ? "CURRENT RETURN - USD" : "YOUR AIRCRAFT. YOUR CALL."}</span><strong>{preparing ? `${Math.ceil(countdown)}s to takeoff` : objective ? objectiveTitle : flying ? `$${money(round.currentCents)}` : "Land. Complete. Win."}</strong><p>{preparing ? mission?.mode === "PVP" ? "Same course and conditions. Higher landing score wins." : countdown > 5 ? "Searching for a matching pilot..." : "Solo mission ready. Prepare your controls." : objective ? objectiveDescription : "Pass the checkpoints. Bring your aircraft home."}</p></div>}
        {waiting && <div className="f-result f-result-pending" role="status"><small>MISSION FINISHED</small><h2>{round?.pilot?.stop === "LANDED" ? "Touchdown confirmed" : ending}</h2><strong>{mission?.score.toLocaleString()} <small>your score</small></strong><p>Waiting for the other pilot to finish.</p><span>Your final cash result will appear here.</span></div>}
        {done && <div className="f-result" role="status" aria-live="polite"><span className="f-result-check">&#10003;</span><small>CONFIRMED RESULT</small><h2>{ending}</h2><strong>${money(round.payoutCents ?? 0)} <small>USD returned</small></strong>{mission?.mode === "PVP" && <p>Your score {mission.score.toLocaleString()} - Other pilot {mission.opponentScore?.toLocaleString() ?? "--"}</p>}<p className={net >= 0 ? "f-positive" : ""}>{net >= 0 ? "+" : "-"}${money(Math.abs(net))} net, including ${money(round.feeCents)} play fee</p><span>Wallet updated - Receipt saved in Activity</span></div>}
        {practice?.stop && <div className="f-result" role="status"><small>PRACTICE FINISHED - NO MONEY USED</small><h2>{MISSION_OUTCOMES[practice.stop]}</h2><p>{practice.gate} of 3 checkpoints passed.</p><span>Exit practice to prepare a paid flight.</span></div>}
        {!done && !waiting && !practice?.stop && <div className="f-airspace-caption">{mission?.engineOut ? <b className="f-stall-warning">ENGINE OUT - Keep airspeed and glide to the runway</b> : plane?.stalled ? <b className="f-stall-warning">STALL - Lower the nose and restore airspeed</b> : <span>{active || practice ? "Arrow keys to pitch - +/- for power" : "Lift - Drag - Thrust - Gravity"}</span>}{active && <span className={stale || awaiting || controlPending ? "f-connection-warning" : ""}>{stale ? "Reconnecting..." : preparing ? "Preparing..." : awaiting ? "Checking result..." : controlPending ? "Syncing controls..." : `${remaining.toFixed(1)}s remaining`}</span>}</div>}
      </div>
      <div className="f-instruments" aria-label="Aircraft instruments"><div><small>AIRSPEED</small><strong>{plane ? Math.round(plane.airspeed * 1.94384) : "--"}<em>kt</em></strong></div><div><small>ALTITUDE</small><strong>{plane ? Math.round(plane.y) : "--"}<em>m</em></strong></div><div><small>VERTICAL SPEED</small><strong>{plane ? `${plane.vy > 0 ? "+" : ""}${plane.vy.toFixed(1)}` : "--"}<em>m/s</em></strong></div><div><small>FLIGHT CONDITION</small><strong>{round?.pilot && !practice ? Math.round(round.pilot.conditionBps / 100) : practice ? Math.round((.35 + practice.aircraft.quality * .65) * practice.aircraft.integrityBp / 100) : "--"}<em>%</em></strong></div></div>
      <PilotControls throttle={throttle} elevator={elevator} onThrottle={setThrottle} onElevator={setElevator} disabled={!controlling}/>
      {forces && plane && <div className="f-force-readings">{(["lift", "drag", "thrust", "weight"] as const).map(key => <span key={key} className={`force-${key}`}>{key} <b>{(Math.hypot(plane.forces[key].x, plane.forces[key].y) / 1000).toFixed(1)} kN</b></span>)}</div>}
      {abortPrompt && <div className="f-abort-confirm" role="alert"><p>Abandon this mission? Your stake and play fee will not be returned.</p><button className="f-button f-button-secondary" onClick={() => setAbortPrompt(false)} disabled={busy}>Continue flight</button><button className="f-button f-button-danger" onClick={abandon} disabled={busy}>Abandon mission</button></div>}
      <div className="f-flight-dock">
        {waiting ? <><div><small>CONTEST IN PROGRESS</small><span>Your mission is saved. Waiting for the other pilot.</span></div><button className="f-button f-button-secondary" onClick={recover} disabled={busy}>Check contest result</button></> : flying && mission ? <><div><small>{preparing ? "TAKEOFF COUNTDOWN" : `PRIZE $${money(advertisedPrize)} USD`}</small><span>{preparing ? "Controls open at takeoff." : "Pass all checkpoints and land safely."}</span></div><button className="f-button f-button-secondary" onClick={stale || awaiting ? recover : () => setAbortPrompt(true)} disabled={busy || preparing}>{busy ? "Checking mission..." : stale || awaiting ? "Check flight result" : "End mission"}</button></> : flying ? <><div><small>EARLIER FLIGHT RULES</small><span>Collect the current return.</span></div><button className="f-button f-collect" onClick={stale || awaiting ? recover : collect} disabled={busy}>{busy ? "Checking flight..." : stale || awaiting ? "Check flight result" : `Collect $${money(round.currentCents)}`}</button></> : done ? <><div><small>FLIGHT FINISHED</small><span>Your next mission is your choice.</span></div><button className="f-button" onClick={reset}>Back to flight setup <Icon name="arrow"/></button></> : practice ? <><div><small>FREE PRACTICE</small><span>Checkpoints and safe landing. No wallet changes.</span></div><button className="f-button f-button-secondary" onClick={reset}>Exit practice</button></> : <><span className="f-muted">Learn to land before staking.</span><button className="f-button f-button-secondary" disabled={uncertain || busy} onClick={() => { setPractice(initialMission()); setPracticeEnded(false); setThrottle(400); }}>Practice free &#8599;</button></>}
      </div></div>
      <aside className="f-flight-setup"><div className="f-panel-heading"><h2>{active ? mission?.mode === "PVP" ? "Pilot contest" : "Your mission" : done ? "Flight receipt" : practice ? "Your flight manual" : "Prepare your flight"}</h2><Icon name="flight"/></div>
        {active || done ? <><div className="f-flight-details"><div><span>Stake</span><strong>${money(round.stakeCents)}</strong></div><div><span>Play fee - 3%</span><strong>${money(round.feeCents)}</strong></div><div className="f-cost-total"><span>Wallet cost</span><strong>${money(round.totalCostCents)}</strong></div>{mission && <div><span>{mission.mode === "PVP" ? "Contest prize" : "Mission prize"}</span><strong>${money(advertisedPrize)}</strong></div>}</div>{mission ? <><ol className="f-mission-checklist">{mission.course.gates.map((gate, index) => <li key={gate.x} className={index < mission.gate ? "passed" : ""}>{index < mission.gate ? "Passed" : `Checkpoint ${index + 1}`}<span>{gate.low}-{gate.high} m</span></li>)}<li>Land on the runway<span>Gentle touchdown</span></li></ol><p className="f-helper">{mission.mode === "PVP" ? "Both pilots fly the same course and conditions. A safe landing qualifies; the higher score wins the displayed prize. An exact tie returns each stake. If neither pilot lands safely, neither receives a prize. Play fees apply." : "Pass every checkpoint, then land between the runway flags. A successful mission receives the full displayed prize. A crash, missed checkpoint or missed runway ends the mission without a return."}</p></> : <p className="f-helper">This earlier flight finishes under its original collection rules.</p>}<Link className="f-text-link" href="/dashboard/activity">View flight receipts &#8599;</Link></> : <>
        <p className="f-muted">{practice ? "Aim for each altitude window, then descend toward the marked runway. Ease the nose up near the ground for a gentle landing." : "Choose your stake. Complete the mission and bring your aircraft home."}</p>
        {!practice && <><label className="f-field-label" htmlFor="stake">STAKE - USD</label><div className="f-amount-input"><span>$</span><input id="stake" inputMode="decimal" value={stake} onChange={e => setStake(e.target.value)} disabled={busy || uncertain} aria-label="Stake in USD"/><b>USD</b></div><div className="f-quick-amounts">{[1, 2, 3, 5].map(value => <button key={value} className={Number(stake) === value ? "selected" : ""} onClick={() => setStake(value.toFixed(2))} disabled={busy || uncertain || !data || value * 100 > data.control.maxStakeCents}>${value}</button>)}</div>
        <div className="f-flight-details"><div><span>Play fee - 3%</span><strong>{Number.isFinite(feeCents) ? `$${money(feeCents)}` : "--"}</strong></div><div className="f-cost-total"><span>Total from wallet</span><strong>{Number.isFinite(stakeCents) ? `$${money(stakeCents + feeCents)}` : "--"}</strong></div><div><span>Successful solo mission</span><strong>{offer ? `$${money(offer.prizes.soloCents)}` : "Loading offer..."}</strong></div>{offer?.prizes.contestCents && <div><span>Paired contest winner</span><strong>${money(offer.prizes.contestCents)}</strong></div>}</div>
        <p className="f-helper">When another eligible pilot enters at the same stake before takeoff, you are paired automatically. Otherwise, your flight remains a solo mission. {offer?.prizes.contestCents ? "An exact contest tie returns each stake; the play fee remains charged." : ""}</p>
        <p className="f-helper">Fee applies once, win or lose. {data && data.control.maxStakeCents >= data.control.minStakeCents ? `Stake range $${money(data.control.minStakeCents)}-$${money(data.control.maxStakeCents)}.` : "Paid flights are temporarily unavailable."}</p>
        {offer && !offer.available && <p className="f-helper">Flights at this stake are currently unavailable. Choose another amount or try again shortly.</p>}
        {offerError && <p className="f-helper" role="status">{offerError}</p>}
        {data && !data.termsAccepted ? <div className="f-consent"><p>Complete the flight objectives to win. You can lose your full stake plus the play fee. Read the <Link href="/dashboard/help">updated game rules</Link>.</p><button className="f-button f-button-full" onClick={consent} disabled={busy}>I&#39;m 18+ and accept the rules</button></div> : <button className="f-button f-button-full" onClick={launch} disabled={busy || !data || stale || (!uncertain && (!data.eligible || !data.control.enabled || !validStake || !offer?.available))}>{busy ? "Preparing flight..." : uncertain ? "Recover this flight" : "Take flight"} <Icon name="flight"/></button>}
        {data && !data.control.enabled && <p className="f-helper">Paid flights are paused. Free practice and your wallet remain available.</p>}
        {data && !data.eligible && <p className="f-helper">{!data.control.isLive && !data.isTestAccount && data.user.role !== "ADMIN" ? "Public play is preparing for launch." : "Your account needs an eligibility review before paid play."}</p>}
        {!uncertain && data?.termsAccepted && !validStake && <p className="f-helper">Choose an amount within the stake range and your available balance, including the fee.</p>}</>}
        <div className="f-pilot-tip"><b>Small inputs. A better landing.</b><p>Keep airspeed near 135 kt. Descend after the final checkpoint. Lower engine power on approach and ease the nose up near the runway.</p><Link className="f-text-link" href="/dashboard/help">Read the flight manual &#8599;</Link></div></>}
      </aside>
    </section>
    <section className="f-panel f-recent-flights"><div className="f-panel-heading"><h2>Recent flights</h2><Link href="/dashboard/activity" className="f-text-link">All activity &#8599;</Link></div><div className="f-table-scroll"><table className="f-table"><thead><tr><th>FLIGHT</th><th>STAKE</th><th>RETURN</th><th>STATUS</th><th>TIME - UTC</th></tr></thead><tbody>{data?.rounds.slice(0, 5).map(r => <tr key={r.id}><td><code>{r.id.slice(-7).toUpperCase()}</code></td><td>${money(r.stakeCents)}</td><td>{["FLYING", "AWAITING_RESULT"].includes(r.status) ? r.status === "AWAITING_RESULT" ? "Pending contest" : "In flight" : `$${money(r.payoutCents ?? 0)}`}</td><td><Status value={r.mission?.result ?? r.status}/></td><td>{date(r.startedAt)}</td></tr>)}</tbody></table>{!data?.rounds.length && <div className="f-empty">Your confirmed flights will appear here.</div>}</div></section>
  </>;
}
