import type { Metadata } from "next";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { ReconciliationCase } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { ReconciliationActions } from "@/components/reconciliation-actions";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Reconciliation" };

const columns: Column<ReconciliationCase>[] = [
  { key: "case", label: "Case", render: (item) => <div><p className="font-bold">{item.reference}</p><p className="mt-0.5 text-xs text-slate-500">{item.provider}</p></div> },
  { key: "issue", label: "Issue", render: (item) => <span className="text-slate-700">{item.issue}</span> },
  { key: "difference", label: "Difference", align: "right", render: (item) => <span className={`font-bold tabular-nums ${item.differenceMinor !== "0" ? "text-red-700" : "text-slate-500"}`}>{formatMoney(item.differenceMinor)}</span> },
  { key: "age", label: "Age", render: (item) => <span className={item.ageHours > 24 ? "font-bold text-red-700" : "text-slate-600"}>{item.ageHours}h</span> },
  { key: "owner", label: "Owner", render: (item) => <span className="text-slate-600">{item.owner ?? "Unassigned"}</span> },
  { key: "status", label: "Status", render: (item) => <StatusBadge status={item.status} /> },
  { key: "action", label: "Action", align: "right", render: (item) => <ReconciliationActions item={item} /> },
];

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; status?: string }> }) {
  const query = await searchParams; const state = resolvePageState(query.state); const items = await apiGet<ReconciliationCase[]>("/admin/reconciliation"); const needle = query.q?.toLowerCase().trim() ?? ""; const filtered = items.filter((item) => (!needle || `${item.reference} ${item.issue} ${item.provider}`.toLowerCase().includes(needle)) && (!query.status || item.status === query.status)); const displayed = state === "empty" ? [] : filtered;
  return <><PageHeader title="Reconciliation" description="Provider, payment, payout, and ledger exception cases" actions={<span className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-900"><RefreshCw className="h-4 w-4" />Last sweep 2 min ago</span>} /><div className="mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6 lg:p-8">{state === "error" || state === "permission" ? <PageState state={state} resetHref="/reconciliation" /> : <><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Open cases","3"],["Unassigned","1"],["Beyond SLA","1"],["Value at risk","GHS 4,346.50"]].map(([label,value]) => <div className="panel px-4 py-3" key={label}><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}</div><div className="panel flex gap-3 border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" /><span>Resolution requires verified provider evidence and a linked correction reference. Reconciliation never edits posted financial entries.</span></div><div className="panel overflow-hidden"><FilterBar placeholder="Search case, issue, or provider" defaultQuery={query.q}><select className="field w-auto min-w-40" name="status" defaultValue={query.status ?? ""} aria-label="Case status"><option value="">All statuses</option><option value="OPEN">Open</option><option value="INVESTIGATING">Investigating</option><option value="RESOLVED">Resolved</option></select></FilterBar></div>{displayed.length ? <DataTable caption="Reconciliation cases" rows={displayed} columns={columns} getRowKey={(item) => item.id} /> : <PageState state="empty" resetHref="/reconciliation" />}</>}</div></>;
}
