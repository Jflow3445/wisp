"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FlightChart } from "./chart";
import { Icon } from "./icons";
import { api, date, money, Notice, Status, useWallet, type Round } from "./client";

export function FlightDeck({ accountId }: { accountId: string }) {
  const { data, error, refresh, receivedAt, rememberRound } = useWallet(), [stake, setStake] = useState("5.00"), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [round, setRound] = useState<Round | null>(null), [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ stake: string; requestKey: string } | null>(null);
  const storageKey = `nister.flight.start.${accountId}`;
  useEffect(() => { try { const value = sessionStorage.getItem(storageKey); if (value) { pending.current = JSON.parse(value); setStake(pending.current!.stake); setUncertain(true); } } catch { /* unavailable storage */ } }, [storageKey]);
  useEffect(() => {
    if (!data) return;
    const latest = data.rounds[0];
    if (latest) setRound(current => !current || (latest.id === current.id ? Date.parse(latest.serverNow) >= Date.parse(current.serverNow) : Date.parse(latest.startedAt) >= Date.parse(current.startedAt)) ? latest : current);
    if (pending.current && data.rounds.some(r => r.requestKey === pending.current!.requestKey)) { pending.current = null; setUncertain(false); sessionStorage.removeItem(storageKey); }
  }, [data, storageKey]);
  const flying = round?.status === "FLYING", stale = !data || performance.now() - receivedAt > 15000;
  const stakeCents = /^\d{1,8}(\.\d{1,2})?$/.test(stake.trim()) ? Math.round(Number(stake) * 100) : NaN, feeCents = Math.ceil(stakeCents * 0.03);
  const launch = async () => {
    if (busy || flying) return;
    setBusy(true); setMessage("");
    const request = pending.current ?? { stake, requestKey: crypto.randomUUID() };
    pending.current = request; sessionStorage.setItem(storageKey, JSON.stringify(request)); setUncertain(true);
    try {
      const response = await api<{ result: Round }>("/api/flight", { action: "start", ...request });
      if (rememberRound(response.result)) setRound(response.result); pending.current = null; sessionStorage.removeItem(storageKey); setUncertain(false);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status && status < 500 && status !== 429) {
        pending.current = null; sessionStorage.removeItem(storageKey); setUncertain(false);
        setMessage((err as Error).message);
      } else setMessage((err as Error).message + " Your request key is saved. Use retry to recover the same flight.");
    }
    finally { setBusy(false); await refresh(); }
  };
  const collect = async () => {
    if (!round?.offerId || busy) return;
    setBusy(true); setMessage("");
    try { const response = await api<{ result: Round }>("/api/flight", { action: "collect", id: round.id, offerId: round.offerId }); if (rememberRound(response.result)) setRound(response.result); }
    catch (err) { setMessage((err as Error).message); }
    finally { setBusy(false); await refresh(); }
  };
  const consent = async () => { setBusy(true); try { await api("/api/flight", { action: "consent", accepted: true }); await refresh(); } catch (err) { setMessage((err as Error).message); } finally { setBusy(false); } };
  return <>
    <div className="f-page-heading"><div><div className="f-eyebrow">THE FLIGHT DECK <span>01 / LIVE EXPERIENCE</span></div><h1>Catch your moment<span>.</span></h1><p>A new perspective with every takeoff. Make your move.</p></div><Link href="/dashboard/help" className="f-text-link"><Icon name="help" size={16}/> How to play <span>↗︎</span></Link></div>
    <div className="f-stats-row"><div className="f-stat"><span className="f-stat-icon"><Icon name="wallet"/></span><div><small>AVAILABLE BALANCE</small><strong>{data ? money(data.availableCents) : "—"}<em>USD</em></strong></div><Link href="/dashboard/wallet" className="f-stat-link" aria-label="Open wallet">↗︎</Link></div><div className="f-stat"><span className="f-stat-icon f-icon-blue"><Icon name="lock"/></span><div><small>AWAITING WITHDRAWAL</small><strong>{data ? money(data.heldCents) : "—"}<em>USD</em></strong></div></div><div className="f-stat"><span className="f-stat-icon f-icon-purple"><Icon name="flight"/></span><div><small>REFERRAL REWARDS</small><strong>{data ? money(data.referral.earnedCents) : "\u2014"}<em>USD</em></strong></div><Link href="/dashboard/referrals" className="f-stat-link" aria-label="Invite and earn">&#8599;</Link></div></div>
    <Notice error>{error || message}</Notice>
    {data?.isTestAccount && <Notice>Test session: this balance is for gameplay only. It will be cleared when the administrator starts live play.</Notice>}
    {data && !data.eligible && <Notice>{!data.control.isLive && !data.isTestAccount && data.user.role !== "ADMIN" ? "Flight is preparing for public launch. Your account and wallet are ready for you." : <>Your account needs an eligibility review before your first flight. <Link href="/dashboard/help">View the requirements</Link></>}</Notice>}
    <section className="f-deck-grid" aria-label="Flight game"><FlightChart round={round}/><div className="f-panel f-stake-panel"><div className="f-panel-heading"><h2>Your next flight</h2><span className={`f-status ${data?.control.enabled ? "f-status-paid" : "f-status-pending"}`}>{data?.control.enabled ? "OPEN" : "PAUSED"}</span></div><p className="f-muted">Choose your stake. Find your moment.</p>
      <label className="f-field-label" htmlFor="stake">STAKE AMOUNT</label><div className="f-amount-input"><span>$</span><input id="stake" inputMode="decimal" value={stake} onChange={e => setStake(e.target.value)} disabled={!!flying || busy || uncertain} aria-label="Stake in USD"/><b>USD</b></div>
      <div className="f-quick-amounts">{[1, 2, 3, 5].map(value => <button key={value} className={Number(stake) === value ? "selected" : ""} onClick={() => setStake(value.toFixed(2))} disabled={!!flying || busy || uncertain || !data || value * 100 > data.control.maxStakeCents}>${value}</button>)}</div>
      <div className="f-flight-details"><div><span>Play fee - 3%</span><strong>{Number.isFinite(feeCents) && stakeCents > 0 ? `$${money(feeCents)}` : "\u2014"}</strong></div><div className="f-cost-total"><span>Total from your wallet</span><strong>{Number.isFinite(stakeCents) && stakeCents > 0 ? `$${money(stakeCents + feeCents)}` : "\u2014"} <small>USD</small></strong></div><div><span>Available stake range</span><strong>{data && data.control.maxStakeCents >= data.control.minStakeCents ? `$${money(data.control.minStakeCents)} to $${money(data.control.maxStakeCents)}` : "Temporarily full"}</strong></div></div><p className="f-helper">The 3% fee is charged once for every flight, win or lose, rounded up to the nearest cent.</p>
      {data && !data.termsAccepted ? <div className="f-consent"><p>Flight can rise, fall or reach zero. You can lose your full stake plus the play fee. Read the <Link href="/dashboard/help">game rules</Link> before playing.</p><button className="f-button f-button-full" onClick={consent} disabled={busy}>I’m 18+ and accept the game rules</button></div> : flying ? <button className="f-button f-button-full f-collect" disabled={busy || stale} onClick={collect}><Icon name="down"/>{busy ? "Collecting…" : `Stop & collect ${money(round.currentCents)} USD`}</button> : <button className="f-button f-button-full f-launch" disabled={busy || !data || stale || !!error || (!uncertain && (!data.eligible || !data.control.enabled || !Number.isFinite(stakeCents) || stakeCents < data.control.minStakeCents || stakeCents > data.control.maxStakeCents || stakeCents + feeCents > data.availableCents))} onClick={launch}><Icon name="flight"/>{busy ? "Preparing flight…" : uncertain ? "Recover this flight" : "Take flight"}<span>↗︎</span></button>}
      {uncertain && !flying && <button className="f-text-link f-recover-dismiss" disabled={busy} onClick={async () => { await refresh(); setMessage("Retry the saved request to establish whether a stake was accepted before starting another flight."); }}>Refresh request status</button>}
      <div className="f-stake-footnote"><Icon name="shield" size={14}/><span>One flight at a time. You choose when to collect.</span></div>
    </div></section>
    <div className="f-bottom-grid"><section className="f-panel"><div className="f-panel-heading"><h2>Recent flights <span className="f-count">{data?.rounds.length ?? 0}</span></h2><Link href="/dashboard/activity" className="f-text-link">All activity ↗︎</Link></div><div className="f-table-scroll"><table className="f-table"><thead><tr><th>FLIGHT</th><th>STAKE</th><th>RETURN</th><th>STATUS</th><th>TIME · UTC</th></tr></thead><tbody>{data?.rounds.slice(0, 5).map(r => <tr key={r.id}><td><span className="f-table-flight"><Icon name="flight" size={15}/> {r.id.slice(-7).toUpperCase()}</span></td><td>{money(r.stakeCents)}</td><td className={r.currentCents >= r.totalCostCents ? "f-positive" : ""}>{r.status === "FLYING" ? "Live" : money(r.payoutCents ?? 0)} <small>USD</small></td><td><Status value={r.status}/></td><td className="f-muted">{date(r.startedAt)}</td></tr>)}</tbody></table>{!data?.rounds.length && <div className="f-empty"><Icon name="flight" size={28}/><strong>Your flight log starts here</strong><p>Every takeoff and return will appear in this space.</p></div>}</div></section><section className="f-panel f-tips"><span className="f-section-number">THE FLIGHT MANUAL / 01</span><Icon name="flight" size={36}/><h2>A good flight<br/>starts with a plan.</h2><p>Set a stake you’re comfortable losing. Collect the current return at any point, or let your flight land automatically.</p><Link href="/dashboard/help" className="f-text-link">Get to know Flight <Icon name="arrow" size={16}/></Link></section></div>
  </>;
}
