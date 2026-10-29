"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, money, Notice } from "./client";
import { Icon } from "./icons";
import { referralTreeLayout, type ReferralLayoutNode } from "@/lib/flight-referral-layout";
import type { referralNetwork } from "@/lib/flight-referral-network";
type Network = Awaited<ReturnType<typeof referralNetwork>>;
type Node = Network["nodes"][number];
const ROOT = "your-network";
export function ReferralTree({ onSummary, earnedCents, pendingCents }: { onSummary: (data: Network) => void; earnedCents: number; pendingCents: number }) {
  const [branches, setBranches] = useState<Record<string, Network>>({}), [expanded, setExpanded] = useState<Set<string>>(new Set([ROOT]));
  const [selected, setSelected] = useState(ROOT), [loading, setLoading] = useState<Set<string>>(new Set()), [error, setError] = useState(""), [scale, setScale] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewport = useRef<HTMLDivElement>(null), alive = useRef(true), initialized = useRef(false), fetching = useRef(new Set<string>()), drag = useRef<{ x: number; left: number } | null>(null);
  useEffect(() => { const element = viewport.current; if (!element) return; const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth)); observer.observe(element); return () => observer.disconnect(); }, []);
  const load = useCallback(async (parent: Node | null, page = 0, autoDepth = 0) => {
    const key = parent?.key ?? ROOT;
    if (fetching.current.has(key)) return;
    fetching.current.add(key); setLoading(value => new Set(value).add(key));
    try {
      const data = await api<Network>(`/api/flight/referrals?page=${page}${parent ? `&node=${encodeURIComponent(parent.reference)}` : ""}`, undefined, 12000);
      if (!alive.current) return;
      setBranches(value => ({ ...value, [key]: data })); setError("");
      if (!parent) onSummary(data);
      if (autoDepth && data.nodes.length <= 3) {
        for (const child of data.nodes.filter(node => node.level < 3 && node.children > 0)) {
          setExpanded(value => new Set(value).add(child.key));
          void load(child, 0, autoDepth - 1);
        }
      }
    } catch (err) { if (alive.current) setError((err as Error).message); }
    finally { fetching.current.delete(key); if (alive.current) setLoading(value => { const next = new Set(value); next.delete(key); return next; }); }
  }, [onSummary]);
  useEffect(() => { alive.current = true; if (!initialized.current) { initialized.current = true; void load(null, 0, 2); } return () => { alive.current = false; }; }, [load]);
  const nodes = useMemo(() => new Map(Object.values(branches).flatMap(branch => branch.nodes.map(node => [node.key, node] as const))), [branches]);
  const layout = useMemo(() => {
    function build(key: string, depth: number): ReferralLayoutNode { return { key, children: depth < 3 && expanded.has(key) ? (branches[key]?.nodes ?? []).map(node => build(node.key, depth + 1)) : [] }; }
    return referralTreeLayout(build(ROOT, 0));
  }, [branches, expanded]);
  const positions = new Map(layout.positions.map(position => [position.key, position]));
  const selectedNode = nodes.get(selected), currentBranch = branches[selected];
  useEffect(() => { const position = layout.positions.find(node => node.key === selected); if (position && viewport.current) viewport.current.scrollLeft = Math.max(0, position.x * scale - viewport.current.clientWidth / 2); }, [layout, selected, scale, viewportWidth]);
  const toggle = (key: string) => {
    setSelected(key);
    if (key === ROOT) return;
    const node = nodes.get(key); if (!node || node.level >= 3 || !node.children) return;
    setExpanded(value => { const next = new Set(value); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    if (!branches[key]) void load(node);
  };
  const refresh = () => { void load(null, branches[ROOT]?.page ?? 0); for (const key of expanded) { const node = nodes.get(key); if (node) void load(node, branches[key]?.page ?? 0); } };
  return <section className="f-panel f-network-panel f-referral-tree-panel"><div className="f-panel-heading"><div><div className="f-eyebrow">YOUR REFERRAL MAP</div><h2>Every connection. A new possibility.</h2></div><span className="f-network-pill">3 generations</span></div><p className="f-muted">Select a node to explore its members and the rewards it brings you. Private aliases protect everyone&#39;s identity.</p><Notice error>{error}</Notice>
    <div className="f-tree-toolbar"><div><button aria-label="Zoom out" onClick={() => setScale(value => Math.max(.4, value - .15))}>−</button><span>{Math.round(scale * 100)}%</span><button aria-label="Zoom in" onClick={() => setScale(value => Math.min(1.6, value + .15))}>+</button><button onClick={() => { setScale(Math.max(.4, Math.min(1, (viewport.current?.clientWidth ?? 600) / layout.width))); if (viewport.current) viewport.current.scrollLeft = 0; }}>Fit tree</button></div><button className="f-text-link" disabled={!!loading.size} onClick={refresh}>Refresh map</button></div>
    <div className="f-tree-workspace"><div ref={viewport} className="f-tree-viewport" tabIndex={0} aria-label="Interactive referral tree; scroll to explore branches" onPointerDown={event => { if ((event.target as HTMLElement).closest("button")) return; drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (drag.current) event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="f-tree-scaled" style={{ width: Math.max(layout.width * scale, viewportWidth, 320), height: Math.max(layout.height * scale, 260) }}><div className="f-tree-canvas" style={{ left: Math.max(0, (viewportWidth - layout.width * scale) / 2), width: layout.width, height: layout.height, transform: `scale(${scale})` }}><svg className="f-tree-edges" width={layout.width} height={layout.height} aria-hidden="true">{layout.edges.map(edge => { const parent = positions.get(edge.parent)!, child = positions.get(edge.child)!, start = parent.y + layout.nodeHeight, mid = (start + child.y) / 2; return <path key={`${edge.parent}:${edge.child}`} d={`M${parent.x},${start}V${mid}H${child.x}V${child.y}`} className={selected === edge.child || selected === edge.parent ? "is-selected" : ""}/>; })}</svg>
        {layout.positions.map(position => { const node = nodes.get(position.key), root = position.key === ROOT, hasChildren = root || !!node && node.level < 3 && node.children > 0; return <button key={position.key} className={`f-tree-node ${root ? "is-root" : ""} ${selected === position.key ? "is-selected" : ""}`} style={{ left: position.x - layout.nodeWidth / 2, top: position.y, width: layout.nodeWidth, height: layout.nodeHeight }} aria-label={root ? "You, root of your referral network" : `${node?.label}, level ${node?.level}, $${money(node?.branchEarnedCents ?? 0)} in branch rewards`} aria-expanded={hasChildren ? expanded.has(position.key) : undefined} aria-pressed={selected === position.key} onClick={() => toggle(position.key)}><span className="f-tree-node-top"><span className="f-tree-node-avatar"><Icon name={root ? "flight" : "users"} size={17}/></span><span>{root ? "YOU" : `LEVEL ${node?.level}`}</span>{hasChildren && !root && <b>{loading.has(position.key) ? "…" : expanded.has(position.key) ? "−" : "+"}</b>}</span><strong>{root ? "Your flight network" : node?.label}</strong><span className="f-tree-node-bottom"><b>${money(root ? earnedCents : node?.branchEarnedCents ?? 0)}</b><small>{root ? "rewards received" : node?.level === 3 ? `${node.rewardingPlays} rewarding plays` : `${node?.children ?? 0} direct invites`}</small></span></button>; })}
      </div></div>
    </div><aside className="f-tree-details" aria-live="polite"><span className="f-eyebrow">{selectedNode ? `LEVEL ${selectedNode.level} / SELECTED MEMBER` : "LEVEL 0 / ROOT"}</span><h3>{selectedNode?.label ?? "Your network"}</h3><dl><div><dt>Your branch rewards</dt><dd>${money(selectedNode?.branchEarnedCents ?? earnedCents)}</dd></div><div><dt>From this member</dt><dd>{selectedNode ? `$${money(selectedNode.earnedCents)}` : "—"}</dd></div><div><dt>Awaiting credit</dt><dd>${money(selectedNode?.branchPendingCents ?? pendingCents)}</dd></div><div><dt>Members below</dt><dd>{selectedNode?.descendants ?? branches[ROOT]?.levels.reduce((sum, level) => sum + level.count, 0) ?? 0}</dd></div></dl><p>{selectedNode ? "These amounts are rewards earned by you from this member and their visible branch." : "Choose any connected node to see what its branch brings to your account."}</p>
      {selectedNode && selectedNode.level < 3 && selectedNode.children > 0 && <button className="f-button f-button-secondary" onClick={() => toggle(selectedNode.key)}>{expanded.has(selectedNode.key) ? "Collapse branch" : "Explore branch"} <Icon name="arrow" size={15}/></button>}
      {currentBranch && currentBranch.total > currentBranch.pageSize && <div className="f-tree-page"><strong>Members under this node</strong><span>Page {currentBranch.page + 1} / {Math.ceil(currentBranch.total / currentBranch.pageSize)}</span><div><button className="f-text-link" disabled={loading.has(selected) || currentBranch.page === 0} onClick={() => void load(selectedNode ?? null, currentBranch.page - 1)}>Previous</button><button className="f-text-link" disabled={loading.has(selected) || (currentBranch.page + 1) * currentBranch.pageSize >= currentBranch.total} onClick={() => void load(selectedNode ?? null, currentBranch.page + 1)}>Next</button></div></div>}
      <small>Showing only your three-level network. Names, emails and other members&#39; balances stay private.</small></aside></div><div className="f-tree-legend"><span><i/> You</span><span>Level 1 · Direct invites</span><span>Level 2 · Their invites</span><span>Level 3 · Next generation</span><span>Drag or swipe to explore</span></div>{loading.size > 0 && <p className="f-helper" role="status">Updating your network...</p>}
  </section>;
}
