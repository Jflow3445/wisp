"use client";
import { useState } from "react";
import { Icon } from "./icons";
import { money, Notice, useWallet } from "./client";
export function Referrals() {
  const { data, error } = useWallet(), [message, setMessage] = useState("");
  const link = data?.referral.code ? `https://nisterai.com/invite/${encodeURIComponent(data.referral.code)}` : "";
  const rate = (data?.referral.bps ?? 0) / 100;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Nister Flight", text: "Commander! Are you ready to earn? Join me on Nister Flight. 18+; you can lose your stake.", url: link });
      else { await navigator.clipboard.writeText(link); setMessage("Invite link copied. Share it with your crew."); }
    } catch (err) { if ((err as Error).name !== "AbortError") setMessage("Use Copy link to share your invitation."); }
  };
  return <><div className="f-page-heading"><div><div className="f-eyebrow">BRING YOUR CREW</div><h1>Share the flight<span>.</span></h1><p>Your invitation. Their first takeoff. A reward for every eligible stake.</p></div></div><Notice error>{error}</Notice><Notice>{message}</Notice>
    <div className="f-stats-row">{[["YOUR REFERRAL RATE", `${rate}%`, "of eligible stakes"], ["REWARDS RECEIVED", data ? `$${money(data.referral.earnedCents)}` : "—", "USD"], ["AWAITING CREDIT", data ? `$${money(data.referral.pendingCents)}` : "—", "USD"]].map(([label, value, unit]) => <div className="f-stat" key={label}><div><small>{label}</small><strong>{value}<em>{unit}</em></strong></div></div>)}</div>
    <section className="f-panel f-share-panel"><Icon name="users" size={42}/><h2>A personal link. A simple invitation.</h2><p>{data?.referral.enabled ? `Earn ${rate}% of your friends’ eligible stakes once they deposit and play. Rewards arrive after each flight settles, whether your friend wins or loses.` : "Referral rewards are currently paused. Your existing invitation stays yours."}</p><label className="f-field-label" htmlFor="invite-link">YOUR INVITE LINK</label><div className="f-share-input"><input id="invite-link" value={link} readOnly placeholder="Preparing your invitation…"/><button className="f-button f-button-secondary" disabled={!link} onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage("Invite link copied."); } catch { setMessage("Select and copy your invite link above."); } }}><Icon name="copy" size={18}/> Copy link</button></div><div className="f-button-row"><button className="f-button" disabled={!link} onClick={share}>Share the game <Icon name="arrow" size={18}/></button>{link && <a className="f-button f-button-secondary" href={`https://wa.me/?text=${encodeURIComponent(`Commander! Are you ready to earn? Join me on Nister Flight. 18+; you can lose your stake. ${link}`)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp ↗</a>}</div></section>
    <div className="f-help-grid">{[["01", "Share your link", "Your friend must create a new account through your link. Existing accounts cannot be reassigned to a referrer."], ["02", "They deposit and play", "Only confirmed crypto deposits qualify. Signing up or receiving a test credit does not earn a reward. Self-referrals and duplicate identities are excluded."], ["03", "Receive wallet rewards", "Rewards are based on the stake, rounded down to whole cents, and credited after settlement. The current administrator-set rate applies when a flight starts. Verify your email to receive credits; restricted accounts wait for review."]].map(([n, title, text]) => <section className="f-panel f-help-card" key={n}><span className="f-section-number">{n}</span><h2>{title}</h2><p>{text}</p></section>)}</div></>;
}
