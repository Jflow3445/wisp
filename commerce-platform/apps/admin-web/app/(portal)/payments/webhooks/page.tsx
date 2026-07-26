import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, RotateCw } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { WebhookEvent } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { ActionDialog } from "@/components/action-dialog";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Payment webhooks" };

const columns: Column<WebhookEvent>[] = [
  { key: "event", label: "Event", render: (event) => <div><p className="font-bold">{event.eventType}</p><p className="mt-0.5 text-xs text-slate-500">{event.eventReference}</p></div> },
  { key: "provider", label: "Provider", render: (event) => event.provider },
  { key: "received", label: "Received", render: (event) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(event.receivedAt)}</span> },
  { key: "attempts", label: "Attempts", render: (event) => event.attempts },
  { key: "status", label: "Status", render: (event) => <StatusBadge status={event.status} /> },
  { key: "action", label: "Action", align: "right", render: (event) => event.status === "FAILED" ? <ActionDialog endpoint={`/admin/webhooks/${event.id}/actions`} action="RETRY" title={`Retry ${event.eventReference}?`} description="Replay processing from the stored, signature-verified provider event payload." confirmLabel="Queue retry" requireReason requireEvidence trigger={<span className="btn-secondary h-8 px-2.5 text-xs"><RotateCw className="h-3.5 w-3.5" />Retry</span>} /> : <span className="text-xs text-slate-400">No action</span> },
];

export default async function WebhooksPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; status?: string }> }) {
  const query = await searchParams; const state = resolvePageState(query.state); const events = await apiGet<WebhookEvent[]>("/admin/webhooks"); const needle = query.q?.toLowerCase().trim() ?? ""; const filtered = events.filter((event) => (!needle || `${event.eventType} ${event.eventReference}`.toLowerCase().includes(needle)) && (!query.status || event.status === query.status)); const displayed = state === "empty" ? [] : filtered;
  return <><PageHeader title="Webhook events" description="Stored provider events and idempotent processing outcomes" actions={<Link href="/payments" className="btn-secondary"><ArrowLeft className="h-4 w-4" />Payments</Link>} /><div className="mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6 lg:p-8">{state === "error" || state === "permission" ? <PageState state={state} resetHref="/payments/webhooks" /> : <><div className="panel overflow-hidden"><FilterBar placeholder="Search event type or reference" defaultQuery={query.q}><select className="field w-auto min-w-36" name="status" defaultValue={query.status ?? ""} aria-label="Webhook status"><option value="">All statuses</option><option value="PROCESSED">Processed</option><option value="PENDING">Pending</option><option value="DUPLICATE">Duplicate</option><option value="FAILED">Failed</option></select></FilterBar></div>{displayed.length ? <DataTable caption="Payment webhook events" rows={displayed} columns={columns} getRowKey={(event) => event.id} /> : <PageState state="empty" resetHref="/payments/webhooks" />}<p className="text-xs text-slate-500">Duplicate deliveries are retained and acknowledged without reapplying financial side effects.</p></>}</div></>;
}
