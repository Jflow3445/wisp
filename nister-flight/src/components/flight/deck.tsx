"use client";
import Link from "next/link";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, date, money, Notice, Status, useWallet, type DrawOffer, type Round } from "./client";
import { Icon } from "./icons";
import { canObserveRound } from "@/lib/flight-observation";
import { readStored, writeStored } from "@/lib/browser-storage";
const LegacyDeck = lazy(() => import("./mission-deck").then(m => ({ default: m.LegacyFlightDeck })));
type Pending = { stake: string; requestKey: string; offerId?: string; offerCommitment?: string };

function Reveal({ progress, active, preview }: { progress: number; active: boolean; preview: boolean }) {
  const p = Math.max(0, Math.min(1, progress)), x = 8 + 81 * p, y = 72 - 44 * Math.sin(p * Math.PI / 2);
  return <div className={`f-draw-sky ${active ? "is-revealing" : ""}`} aria-hidden="true"><div className="f-draw-halo"/><div className="f-draw-cloud cloud-one"/><div className="f-draw-cloud cloud-two"/><svg viewBox="0 0 1000 440" preserveAspectRatio="xMidYMid meet"><path className="f-draw-route" d="M80 317 Q300 210 890 123"/><path className="f-draw-trail" d="M80 317 Q300 210 890 123" pathLength="1" strokeDasharray={`${p} 1`}/><g transform={`translate(${x * 10} ${y * 4.4}) rotate(${-18 * (1 - p)})`}><path fill="#b9ced8" d="M-44 4 -31 -4 22 -7Q43 -6 54 1Q41 8 20 8L-43 8Z"/><path fill="#d8fa8c" d="m-5 -3 -19 -34 12 1L17 -3Z"/><path fill="#e6eff1" d="m7 4 -22 31 -11 -2L-4 3Z"/><path fill="#93aebc" d="m-31 0 -13 -20 9 0 15 19Z"/><path fill="#244355" d="m23 -6 10 2 5 5 -16 -1Z"/></g><circle cx="890" cy="123" r="7" fill="#d8fa8c" opacity=".65"/><path fill="#18333a" d="M0 385Q170 310 350 373T700 357T1000 355V440H0Z"/><path fill="#10262d" d="M0 405Q250 345 500 409T1000 383V440H0Z"/></svg><span className="f-draw-scene-label">{preview ? "FREE PREVIEW" : active ? "YOUR FLIGHT IS UNDERWAY" : "A LITTLE SUSPENSE. A CLEAR RESULT."}</span></div>;
}

export function FlightDeck({ accountId }: { accountId: string }) {
  const { data, error, refresh, receivedAt, rememberRound } = useWallet();
  const [round, setRound] = useState<Round | null>(null), [stake, setStake] = useState("1.00"), [offer, setOffer] = useState<DrawOffer | null>(null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [clock, setClock] = useState(0), [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState<number | null>(null), [legacyId, setLegacyId] = useState(""), [dismissedLegacy, setDismissedLegacy] = useState("");
  const scene = useRef<HTMLElement>(null), entryPanel = useRef<HTMLElement>(null);
  const pending = useRef<Pending | null>(null), dismissed = useRef(""), retryAt = useRef(0);
  const storageKey = `nister.flight.start.${accountId}`;
  const save = (value: Pending | null) => writeStored("sessionStorage", storageKey, value ? JSON.stringify(value) : null);
  const observe = useCallback((value: Round) => { if (rememberRound(value)) setRound(current => canObserveRound(current, value) ? value : current); }, [rememberRound]);
  useEffect(() => { try { const value = readStored("sessionStorage", storageKey); if (value) { pending.current = JSON.parse(value); setStake(pending.current!.stake); setUncertain(true); } } catch { writeStored("sessionStorage", storageKey, null); } }, [storageKey]);
  useEffect(() => { const timer = setInterval(() => setClock(performance.now()), 200); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!data) return;
    const latest = data.rounds[0], saved = pending.current && data.rounds.find(r => r.requestKey === pending.current!.requestKey);
    if (latest && latest.engine < 8 && ["FLYING", "AWAITING_RESULT"].includes(latest.status) && latest.id !== dismissedLegacy) setLegacyId(latest.id);
    const value = saved ?? latest;
    if (value?.engine === 8 && value.id !== dismissed.current && (saved || value.status === "FLYING" || round?.id === value.id)) {
      setRound(current => canObserveRound(current, value) ? value : current);
      if (saved) { pending.current = null; setUncertain(false); writeStored("sessionStorage", storageKey, null); }
    }
  }, [data, dismissedLegacy, round?.id, storageKey]);
  const sceneId = round?.id, sceneStatus = round?.status;
  useEffect(() => { if (sceneId || preview !== null) scene.current?.scrollIntoView({ block: "start", behavior: "auto" }); }, [sceneId, sceneStatus, preview]);
  const active = round?.status === "FLYING", done = !!round && !active;
  const age = data ? Math.max(0, clock - receivedAt) : Infinity, stale = age > 5000;
  const duration = round ? Date.parse(round.endsAt) - Date.parse(round.startedAt) : 8000;
  const elapsed = round ? Math.max(0, Date.parse(round.serverNow) - Date.parse(round.startedAt) + Math.max(0, clock - receivedAt)) : preview !== null ? Math.max(0, clock - preview) : 0;
  const progress = done ? 1 : active || preview !== null ? Math.min(1, elapsed / duration) : .18;
  const recover = useCallback(async () => {
    if (!round || busy) return;
    setBusy(true);
    try { const response = await api<{ result: Round }>("/api/flight", { action: "recover", id: round.id }, 10000); observe(response.result); setMessage(""); }
    catch { setMessage("Connection delayed. Your entry is saved. We will keep checking its result."); }
    finally { setBusy(false); void refresh(); }
  }, [round, busy, observe, refresh]);
  useEffect(() => { if (active && !busy && (elapsed >= duration || stale) && clock >= retryAt.current) { retryAt.current = clock + 4000; void recover(); } }, [active, busy, elapsed, duration, stale, clock, recover]);
  const ready = !round && preview === null, hasAccount = !!data;
  useEffect(() => {
    if (!ready || !hasAccount) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    setOffer(null);
    const load = async () => {
      if (!/^\d{1,8}(\.\d{1,2})?$/.test(stake.trim()) || Number(stake) <= 0) return;
      try { const response = await api<{ offer: DrawOffer }>("/api/flight/offer", { stake }); if (!cancelled) { setOffer(response.offer); setMessage(""); } }
      catch (err) { if (!cancelled) setMessage((err as Error).message); }
      if (!cancelled) timer = setTimeout(load, 30000);
    };
    timer = setTimeout(load, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ready, hasAccount, stake, revision]);
  const launch = async () => {
    if (busy || active) return;
    setBusy(true); setMessage(""); setPreview(null);
    const request = pending.current ?? { stake, requestKey: crypto.randomUUID(), offerId: offer?.id, offerCommitment: offer?.commitment };
    pending.current = request; save(request); setUncertain(true);
    try { const response = await api<{ result: Round }>("/api/flight", { action: "start", ...request, rulesVersion: data?.termsVersion }, 12000); observe(response.result); pending.current = null; save(null); setUncertain(false); }
    catch (err) {
      const status = (err as { status?: number }).status;
      if (status && status < 500 && status !== 429) { pending.current = null; save(null); setUncertain(false); setMessage((err as Error).message); setRevision(v => v + 1); }
      else setMessage("Your request is saved. Recover this entry before starting another round.");
    } finally { setBusy(false); void refresh(); }
  };
  const consent = async () => { setBusy(true); try { await api("/api/flight", { action: "consent", accepted: true, rulesVersion: data?.termsVersion }); await refresh(); } catch (err) { setMessage((err as Error).message); } finally { setBusy(false); } };
  const reset = () => { entryPanel.current?.scrollIntoView({ block: "start", behavior: "auto" }); dismissed.current = round?.id ?? ""; setRound(null); setPreview(null); setMessage(""); setOffer(null); setRevision(v => v + 1); void refresh(); };
  const stakeCents = /^\d{1,8}(\.\d{1,2})?$/.test(stake.trim()) ? Math.round(Number(stake) * 100) : NaN, fee = Math.ceil(stakeCents * .03);
  const valid = data && Number.isFinite(stakeCents) && stakeCents >= data.control.minStakeCents && stakeCents <= data.control.maxStakeCents && stakeCents + fee <= data.availableCents;
  const won = done && (round.payoutCents ?? 0) > round.totalCostCents, net = round ? (round.payoutCents ?? 0) - round.totalCostCents : 0;
  if (legacyId) return <Suspense fallback={<p className="f-muted">Loading your accepted flight...</p>}><LegacyDeck accountId={accountId} onExit={() => { setDismissedLegacy(legacyId); setLegacyId(""); }}/></Suspense>;
  return <>
    <div className="f-deck-heading"><div><div className="f-eyebrow">NISTER FLIGHT / YOUR NEXT MOMENT</div><h1>Ready for takeoff<span>?</span></h1></div><div className="f-deck-balance"><small>AVAILABLE - USD</small><strong>${data ? money(data.availableCents) : "--"}</strong><Link href="/dashboard/wallet">Add funds &#8599;</Link></div></div>
    <Notice error>{message || error}</Notice>
    {data?.isTestAccount && <div className="f-session-label">Test session - Gameplay balance - Cleared at public launch</div>}
    <section ref={scene} className="f-draw-game" aria-label="Flight draw"><div className="f-draw-stage">
      <div className="f-draw-top"><span className={`f-airspace-status ${active ? "active" : ""}`}><i/>{done ? "ROUND COMPLETE" : active ? "DRAW IN PROGRESS" : preview !== null ? "PREVIEW - NO MONEY" : "READY WHEN YOU ARE"}</span><span>FLIGHT / {round ? round.id.slice(-7).toUpperCase() : "NISTER"}</span></div>
      <Reveal progress={progress} active={!!active || preview !== null && progress < 1} preview={preview !== null}/>
      {done ? <div className={`f-draw-result ${won ? "is-win" : ""}`} role="status" aria-live="polite"><span className="f-draw-result-icon">{won ? "✦" : "—"}</span><small>CONFIRMED RESULT</small><h2>{won ? "Your moment. Your win." : "No win this round."}</h2><strong>${money(round.payoutCents ?? 0)}<em>USD returned</em></strong><p>{net >= 0 ? "+" : "-"}${money(Math.abs(net))} net, including the ${money(round.feeCents)} play fee.</p><button className="f-button" onClick={reset}>Play another round <Icon name="arrow"/></button><Link href="/dashboard/activity" className="f-text-link">View receipt &#8599;</Link></div> : <div className="f-draw-title"><span>{active ? "YOUR ENTRY IS SAVED" : preview !== null ? "A LOOK AT YOUR NEXT FLIGHT" : "ONE ENTRY. ONE MOMENT."}</span><h2>{active ? progress < 1 ? "Enjoy the flight." : "Confirming your result..." : preview !== null ? progress < 1 ? "Just a little suspense." : "Preview complete." : <>Choose your stake.<br/>Catch your moment.</>}</h2><p>{active ? "Your result will appear here automatically." : preview !== null ? "Free preview. No stake, prize or wallet movement." : "A random draw, revealed through a short flight."}</p></div>}
      <div className="f-draw-bottom">{active ? <><div className="f-draw-progress" role="progressbar" aria-label="Flight reveal" aria-valuenow={Math.round(progress * 100)}><i style={{ width: `${progress * 100}%` }}/></div><span>{stale ? "Reconnecting - your entry is saved" : progress < 1 ? `${Math.max(1, Math.ceil((duration - elapsed) / 1000))}s to reveal` : "Checking result..."}</span><button className="f-text-link" onClick={recover} disabled={busy}>Check result</button></> : preview !== null ? <button className="f-button f-button-secondary" onClick={reset}>Back to entry</button> : !done ? <><span>Choose. Start. Discover.</span><button className="f-text-link" disabled={busy || uncertain} onClick={() => setPreview(performance.now())}>Watch a free preview &#8599;</button></> : <span>Round closed. Your receipt is saved in Activity.</span>}</div>
    </div><aside ref={entryPanel} className="f-draw-entry"><div className="f-panel-heading"><h2>{round ? "Your entry" : "Make your move"}</h2><Icon name="flight"/></div>
      {round ? <div className="f-flight-details"><div><span>Stake</span><strong>${money(round.stakeCents)}</strong></div><div><span>Play fee - 3%</span><strong>${money(round.feeCents)}</strong></div><div className="f-cost-total"><span>Total paid</span><strong>${money(round.totalCostCents)}</strong></div><div><span>Winning prize</span><strong>${money(round.draw?.prizeCents ?? 0)}</strong></div></div> : <><label className="f-field-label" htmlFor="stake">YOUR STAKE - USD</label><div className="f-amount-input"><span>$</span><input id="stake" aria-label="Stake in USD" inputMode="decimal" value={stake} onChange={e => setStake(e.target.value)} disabled={busy || uncertain || preview !== null}/><b>USD</b></div><div className="f-quick-amounts">{[1, 2, 3, 5].map(value => <button key={value} className={Number(stake) === value ? "selected" : ""} disabled={busy || uncertain || preview !== null || !data || value * 100 > data.control.maxStakeCents} onClick={() => setStake(value.toFixed(2))}>${value}</button>)}</div><div className="f-draw-prize"><small>IF YOUR ENTRY WINS</small><strong>${offer ? money(offer.prizeCents) : "--"}<span>USD</span></strong><p>Includes your stake.</p></div><div className="f-flight-details"><div><span>Play fee - 3%</span><strong>{Number.isFinite(fee) ? `$${money(fee)}` : "--"}</strong></div><div className="f-cost-total"><span>Total from wallet</span><strong>{Number.isFinite(stakeCents) ? `$${money(stakeCents + fee)}` : "--"}</strong></div></div>
        {data && !data.termsAccepted ? <div className="f-consent"><p>This is a random draw. You can lose your stake plus the play fee. Read the <Link href="/dashboard/help">game rules</Link>.</p><button className="f-button f-button-full" onClick={consent} disabled={busy}>I&#39;m 18+ and accept the rules</button></div> : <button className="f-button f-button-full" onClick={launch} disabled={busy || preview !== null || !uncertain && (!data || stale || !data.eligible || !data.control.enabled || !valid || !offer?.available)}>{busy ? "Checking your entry..." : uncertain ? "Recover this entry" : "Start flight"} <Icon name="arrow"/></button>}
        {offer && !offer.available && <p className="f-helper">Rounds at this stake are currently unavailable. Try another amount or check again shortly.</p>}
        {data && !data.control.enabled && <p className="f-helper">Paid rounds are paused. Your wallet remains available.</p>}{data && !data.eligible && <p className="f-helper">{!data.control.isLive && !data.isTestAccount && data.user.role !== "ADMIN" ? "Public play is preparing for launch." : "Your account needs an eligibility review before paid play."}</p>}
        {data && <p className="f-helper">Stake range ${money(data.control.minStakeCents)}-${money(data.control.maxStakeCents)}. The 3% fee applies once, win or lose.</p>}</>}
      <div className="f-draw-note"><Icon name="shield" size={18}/><p>Results come from a random draw. The flight animation reveals the outcome. Refreshing keeps your accepted entry.</p></div><Link href="/dashboard/help" className="f-text-link">How it works &#8599;</Link>
    </aside></section><section className="f-panel f-recent-flights"><div className="f-panel-heading"><h2>Your recent rounds</h2><Link href="/dashboard/activity" className="f-text-link">All activity &#8599;</Link></div><div className="f-table-scroll"><table className="f-table"><thead><tr><th>ROUND</th><th>STAKE</th><th>RETURN</th><th>RESULT</th><th>TIME - UTC</th></tr></thead><tbody>{data?.rounds.slice(0, 5).map(r => <tr key={r.id}><td><code>{r.id.slice(-7).toUpperCase()}</code></td><td>${money(r.stakeCents)}</td><td>{["FLYING", "AWAITING_RESULT"].includes(r.status) ? "Pending" : `$${money(r.payoutCents ?? 0)}`}</td><td><Status value={r.draw?.result ?? r.mission?.result ?? r.status}/></td><td>{date(r.startedAt)}</td></tr>)}</tbody></table>{!data?.rounds.length && <div className="f-empty">Your completed rounds will appear here.</div>}</div></section>
  </>;
}
