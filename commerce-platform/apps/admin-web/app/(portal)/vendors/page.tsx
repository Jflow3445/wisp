import type { Metadata } from "next";
import { apiGet } from "@/lib/api";
import type { VendorReview } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { StatusBadge } from "@/components/status-badge";
import { VendorActions } from "@/components/vendor-actions";

export const metadata: Metadata = { title: "Vendor moderation" };

const columns: Column<VendorReview>[] = [
  { key: "vendor", label: "Vendor", render: (vendor) => <div><p className="font-bold">{vendor.name}</p><p className="mt-0.5 text-xs text-slate-500">{vendor.reference} - {vendor.owner}</p></div> },
  { key: "category", label: "Category", render: (vendor) => <div className="text-slate-600">{vendor.category}<div className="mt-0.5 text-xs text-slate-400">{vendor.region}</div></div> },
  { key: "submitted", label: "Submitted", render: (vendor) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(vendor.submittedAt)}</span> },
  { key: "risk", label: "Risk", render: (vendor) => <StatusBadge status={vendor.risk} /> },
  { key: "status", label: "Status", render: (vendor) => <StatusBadge status={vendor.status} /> },
  { key: "action", label: "Action", align: "right", render: (vendor) => <VendorActions vendor={vendor} /> },
];

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; status?: string }> }) {
  const query = await searchParams; const state = resolvePageState(query.state); const vendors = await apiGet<VendorReview[]>("/admin/vendors"); const needle = query.q?.toLowerCase().trim() ?? ""; const filtered = vendors.filter((vendor) => (!needle || `${vendor.name} ${vendor.reference} ${vendor.owner}`.toLowerCase().includes(needle)) && (!query.status || vendor.status === query.status)); const displayed = state === "empty" ? [] : filtered;
  return <><PageHeader title="Vendor moderation" description="Application review and operational vendor controls" /><div className="mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6 lg:p-8">{state === "error" || state === "permission" ? <PageState state={state} resetHref="/vendors" /> : <><div className="panel overflow-hidden"><FilterBar placeholder="Search vendor, owner, or reference" defaultQuery={query.q}><select className="field w-auto min-w-44" name="status" defaultValue={query.status ?? ""} aria-label="Vendor status"><option value="">All statuses</option><option value="SUBMITTED">Submitted</option><option value="UNDER_REVIEW">Under review</option><option value="MORE_INFORMATION_REQUIRED">Information required</option><option value="APPROVED">Approved</option><option value="SUSPENDED">Suspended</option></select></FilterBar></div>{displayed.length ? <DataTable caption="Vendor moderation queue" rows={displayed} columns={columns} getRowKey={(vendor) => vendor.id} /> : <PageState state="empty" resetHref="/vendors" />}<p className="text-xs text-slate-500">Showing {displayed.length} of {vendors.length} vendor applications</p></>}</div></>;
}
