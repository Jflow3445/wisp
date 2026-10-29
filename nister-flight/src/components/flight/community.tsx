"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicFlightSummary } from "@/lib/flight-public";
import { Icon } from "./icons";
import { money } from "./client";

export function Community({ initial }: { initial: PublicFlightSummary }) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    let alive = true;
    const poll = async () => { try { const response = await fetch("/api/flight/public", { cache: "no-store", signal: AbortSignal.timeout(10000) }); if (response.ok && alive) setData(await response.json()); } catch { /* retain last snapshot only until its 30-minute window expires */ } };
    const timer = setInterval(() => { setData(value => ({ ...value, wins: value.wins.filter(w => Date.now() - new Date(w.minute).getTime() < 1800000) })); void poll(); }, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  return <>
    {data.referral.enabled && <section className="f-referral-banner" id="rewards"><span className="f-share-orbit"><Icon name="users" size={36}/></span><div><div className="f-eyebrow">GOOD MOMENTS ARE BETTER SHARED</div><h2>Invite your crew. Earn {(data.referral.bps / 100).toLocaleString("en-US")}%.</h2><p>Share your personal link. After a friend joins, makes a confirmed deposit and plays, earn {(data.referral.bps / 100).toLocaleString("en-US")}% of each eligible stake as a USD wallet reward. No reward for signing up alone.</p></div><Link href="/dashboard/referrals" className="f-button">Get my invite link <Icon name="arrow" size={18}/></Link></section>}
    {data.wins.length > 0 && <section className="f-public-wins" aria-label="Recent wins"><div className="f-panel-heading"><div><div className="f-eyebrow"><span className="f-dot"/> RECENT LANDINGS</div><h2>Wins in the last 30 mins</h2></div><span className="f-muted">Net wins after the play fee · USD</span></div><div className="f-win-grid">{data.wins.map(w => <article className="f-win-card" key={`${w.alias}:${w.minute}`}><span className="f-avatar"><Icon name="flight" size={20}/></span><span>{w.alias}<small>{new Date(w.minute).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC</small></span><strong>+${money(w.profitCents)}</strong></article>)}</div><p className="f-helper">Names are private. This shows profitable completed flights only; other players may lose. Past wins do not predict your outcome.</p></section>}
  </>;
}
