import type { Metadata } from "next";
import { Fingerprint, LockKeyhole } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Audit trail" };

const columns: Column<AuditEvent>[] = [
  { key: "time", label: "Occurred", render: (event) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(event.occurredAt)}</span> },
  { key: "actor", label: "Actor", render: (event) => <span className="font-semibold">{event.actor}</span> },
  { key: "action", label: "Action", render: (event) => <div><p className="font-mono text-xs font-semibold">{event.action}</p><p className="mt-0.5 text-xs text-slate-500">{event.target}</p></div> },
  { key: "reason", label: "Reason", render: (event) => <span className="text-xs text-slate-600">{event.reason ?? "System transition"}</span> },
  { key: "request", label: "Request", render: (event) => <span className="font-mono text-xs text-slate-500">{event.requestId}</span> },
  { key: "outcome", label: "Outcome", align: "right", render: (event) => <StatusBadge status={event.outcome} /> },
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; outcome?: string }> }) {
  const query = await searchParams; const state = resolvePageState(query.state); const events = await apiGet<AuditEvent[]>("/admin/audit"); const needle = query.q?.toLowerCase().trim() ?? ""; const filtered = events.filter((event) => (!needle || `${event.actor} ${event.action} ${event.target} ${event.requestId}`.toLowerCase().includes(needle)) && (!query.outcome || event.outcome === query.outcome)); const displayed = state === "empty" ? [] : filtered;
  return <><PageHeader title="Audit trail" description="Immutable actor, command, reason, and request history" actions={<span className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700"><LockKeyhole className="h-4 w-4" />Read only</span>} /><div className="mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6 lg:p-8">{state === "error" || state === "permission" ? <PageState state={state} resetHref="/audit" /> : <><div className="panel overflow-hidden"><FilterBar placeholder="Search actor, action, target, or request" defaultQuery={query.q}><select className="field w-auto min-w-36" name="outcome" defaultValue={query.outcome ?? ""} aria-label="Audit outcome"><option value="">All outcomes</option><option value="SUCCESS">Success</option><option value="DENIED">Denied</option><option value="FAILED">Failed</option></select></FilterBar></div>{displayed.length ? <DataTable caption="Administrative audit trail" rows={displayed} columns={columns} getRowKey={(event) => event.id} /> : <PageState state="empty" resetHref="/audit" />}<p className="flex items-center gap-1.5 text-xs text-slate-500"><Fingerprint className="h-3.5 w-3.5" />Audit records include actor identity, request ID, command, target, outcome, and review context.</p></>}</div></>;
}
