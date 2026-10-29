"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "./icons";
import { api, money, Notice, useWallet } from "./client";
import type { referralNetwork } from "@/lib/flight-referral-network";
type Network = Awaited<ReturnType<typeof referralNetwork>>;
type Node = Network["nodes"][number];
function NetworkColumn({ parent, level, selected, onSelect, onSummary, onPageChange }: { parent: Node | null; level: number; selected?: string; onSelect: (node: Node) => void; onSummary?: (data: Network) => void; onPageChange: () => void }) {
  const [data, setData] = useState<Network | null>(null), [page, setPage] = useState(0), [error, setError] = useState(""), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const reference = parent?.reference;
  useEffect(() => { setPage(0); setData(null); }, [reference]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      setBusy(true);
      try { const value = await api<Network>(`/api/flight/referrals?page=${page}${reference ? `&node=${encodeURIComponent(reference)}` : ""}`, undefined, 12000); if (alive) { setData(value); setError(""); onSummary?.(value); } }
      catch (err) { if (alive) setError((err as Error).message); }
      finally { if (alive) setBusy(false); }
    };
    void load(); const timer = setInterval(load, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [reference, page, revision, onSummary]);
  const max = Math.max(1, ...data?.nodes.map(n => n.branchEarnedCents) ?? []);
  return <section className="f-network-column" aria-label={`Level ${level} referrals`}><div className="f-network-column-heading"><div><small>LEVEL {level}</small><h3>{parent ? parent.label : "Your direct referrals"}</h3></div><span>{data?.total ?? "--"}</span></div><Notice error>{error}</Notice>
    {busy && !data && <p className="f-muted" role="status">Loading your network...</p>}
    {data && data.nodes.length === 0 && <div className="f-network-empty"><Icon name="users" size={26}/><strong>No referrals here yet</strong><p>{level === 1 ? "Your direct invitations appear here after registration." : "This member has no referrals at this level yet."}</p></div>}
    <div className="f-network-nodes">{data?.nodes.map(node => <button key={node.key} onClick={() => onSelect(node)} className={`f-network-node ${selected === node.key ? "is-selected" : ""}`} aria-pressed={selected === node.key}>
      <div className="f-network-node-title"><span className="f-network-dot"><Icon name="users" size={18}/></span><span>{node.label}<small>Level {node.level} / {node.rewardingPlays} rewarding {node.rewardingPlays === 1 ? "play" : "plays"}</small></span>{node.level < 3 && <Icon name="arrow" size={16}/>}</div>
      <div className="f-network-node-return"><span>Your branch rewards</span><strong>${money(node.branchEarnedCents)}</strong></div><div className="f-network-meter"><i style={{ width: `${100 * node.branchEarnedCents / max}%` }}/></div>
      <div className="f-network-node-meta"><span>From this member <b>${money(node.earnedCents)}</b></span><span>{node.descendants} {node.descendants === 1 ? "member" : "members"} below</span>{node.branchPendingCents > 0 && <span className="f-network-pending">${money(node.branchPendingCents)} awaiting credit</span>}</div>
    </button>)}</div>
    {data && data.total > data.pageSize && <div className="f-network-pagination"><button className="f-text-link" disabled={busy || page === 0} onClick={() => { onPageChange(); setPage(p => p - 1); }}>Previous</button><span>{page + 1} / {Math.ceil(data.total / data.pageSize)}</span><button className="f-text-link" disabled={busy || (page + 1) * data.pageSize >= data.total} onClick={() => { onPageChange(); setPage(p => p + 1); }}>Next</button></div>}
    {error && <button className="f-text-link" onClick={() => setRevision(v => v + 1)}>Refresh branch</button>}
  </section>;
}
export function Referrals() {
  const { data, error } = useWallet(), [message, setMessage] = useState(""), [selected, setSelected] = useState<Node[]>([]), [counts, setCounts] = useState([0, 0, 0]);
  const summarize = useCallback((value: Network) => setCounts(value.levels.map(l => l.count)), []);
  const choose = (level: number, node: Node) => {
    setSelected(value => [...value.slice(0, level - 1), node]);
    if (level < 3) requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[aria-label="Level ${level + 1} referrals"]`);
      if (!target) return;
      const box = target.getBoundingClientRect();
      if (box.top < 80 || box.top > window.innerHeight - 200) target.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  };
  const rates = data?.referral.ratesBps ?? [0, 0, 0], enabled = data?.referral.enabled && rates.some(Boolean);
  const link = data?.referral.code ? `https://nisterai.com/invite/${encodeURIComponent(data.referral.code)}` : "";
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: "Nister Flight", text: "Commander! Are you ready to earn? Join me on Nister Flight. 18+; you can lose your stake.", url: link }); else { await navigator.clipboard.writeText(link); setMessage("Invite link copied. Share it with your crew."); } }
    catch (err) { if ((err as Error).name !== "AbortError") setMessage("Use Copy link to share your invitation."); }
  };
  return <><div className="f-page-heading"><div><div className="f-eyebrow">YOUR CREW. THREE LEVELS.</div><h1>Grow your flight network<span>.</span></h1><p>Earn on eligible stakes across three referral levels, whether the player wins or loses.</p></div></div><Notice error>{error}</Notice><Notice>{message}</Notice>
    <div className="f-stats-row">{[["REWARDS RECEIVED", data ? `$${money(data.referral.earnedCents)}` : "--", "USD this season"], ["AWAITING CREDIT", data ? `$${money(data.referral.pendingCents)}` : "--", "USD"], ["YOUR NETWORK", counts.reduce((a,b) => a+b,0).toLocaleString(), "members across 3 levels"]].map(([label,value,unit]) => <div className="f-stat" key={label}><div><small>{label}</small><strong>{value}<em>{unit}</em></strong></div></div>)}</div>
    <div className="f-referral-levels">{rates.map((rate,index) => <article className="f-referral-level-card" key={index}><span>LEVEL {index + 1}</span><strong>{(rate / 100).toLocaleString("en-US")}%</strong><h2>{["Your direct referrals", "Your referrals' referrals", "The next generation"][index]}</h2><p>{counts[index].toLocaleString()} members / percentage of their eligible stakes</p></article>)}</div>
    <section className="f-panel f-share-panel"><Icon name="users" size={36}/><h2>A personal link. A growing crew.</h2><p>{enabled ? "The current rates above apply to newly accepted stakes. A confirmed deposit qualifies a player; only their completed bets generate commissions. Loading funds alone earns no reward." : "Referral rewards are paused or set to zero. Your existing network and invitation stay yours."}</p><label className="f-field-label" htmlFor="invite-link">YOUR INVITE LINK</label><div className="f-share-input"><input id="invite-link" value={link} readOnly placeholder="Preparing your invitation..."/><button className="f-button f-button-secondary" disabled={!link} onClick={async () => { try { await navigator.clipboard.writeText(link); setMessage("Invite link copied."); } catch { setMessage("Select and copy your invite link above."); } }}><Icon name="copy" size={18}/> Copy link</button></div><div className="f-button-row"><button className="f-button" disabled={!link} onClick={share}>Share the game <Icon name="arrow" size={18}/></button>{link && <a className="f-button f-button-secondary" href={`https://wa.me/?text=${encodeURIComponent(`Commander! Are you ready to earn? Join me on Nister Flight. 18+; you can lose your stake. ${link}`)}`} target="_blank" rel="noopener noreferrer">Share on WhatsApp &#8599;</a>}</div></section>
    <section className="f-panel f-network-panel"><div className="f-panel-heading"><div><div className="f-eyebrow">YOUR REFERRAL MAP</div><h2>See what your network brings home.</h2></div><span className="f-network-pill">Top branches first</span></div><p className="f-muted">Select a member to explore the next level. Each amount shows rewards earned by you. Private aliases protect members&#39; identities.</p><div className="f-network-root"><span className="f-avatar"><Icon name="users" size={22}/></span><div><small>YOUR NETWORK STARTS HERE</small><strong>You</strong></div><span>3 levels / USD rewards</span></div>
      <div className="f-network-grid"><NetworkColumn level={1} parent={null} selected={selected[0]?.key} onSelect={node => choose(1, node)} onSummary={summarize} onPageChange={() => setSelected([])}/>{selected[0] ? <NetworkColumn level={2} parent={selected[0]} selected={selected[1]?.key} onSelect={node => choose(2, node)} onPageChange={() => setSelected(v => v.slice(0,1))}/> : <div className="f-network-placeholder"><Icon name="arrow" size={24}/><h3>Explore level 2</h3><p>Choose a direct referral to see their branch.</p></div>}{selected[1] ? <NetworkColumn level={3} parent={selected[1]} selected={selected[2]?.key} onSelect={node => choose(3, node)} onPageChange={() => setSelected(v => v.slice(0,2))}/> : <div className="f-network-placeholder"><Icon name="arrow" size={24}/><h3>Explore level 3</h3><p>Choose a level 2 member to see the final level.</p></div>}</div>
    </section><div className="f-help-grid">{[["01", "Three generations of invitations", "A friend who joins through your link is your level 1. Their direct referrals are your level 2. The following generation is your level 3. Existing accounts keep their original referrer."], ["02", "Deposits qualify. Bets earn.", "A confirmed crypto deposit makes a player eligible. The commission is a percentage of each accepted stake, rounded down to cents, and paid after settlement whether they win or lose. Deposits, signups and test credits alone earn nothing."], ["03", "A clear reward record", "An administrator sets each level's percentage. Each bet keeps the rates accepted at its start. Self-referrals and duplicate identities do not qualify. Restricted or full wallets wait for credit without interrupting the player's settlement."]].map(([n,title,text]) => <section className="f-panel f-help-card" key={n}><span className="f-section-number">{n}</span><h2>{title}</h2><p>{text}</p></section>)}</div></>;
}
