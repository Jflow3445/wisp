import type { Metadata } from "next";
import { apiGet } from "@/lib/api";
import type { AdminOrder } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Orders" };

const columns: Column<AdminOrder>[] = [
  { key: "order", label: "Order", render: (order) => <div><p className="font-bold">{order.reference}</p><p className="mt-0.5 text-xs text-slate-500">{order.customer}</p></div> },
  { key: "placed", label: "Placed", render: (order) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(order.placedAt)}</span> },
  { key: "vendors", label: "Vendors", render: (order) => order.vendors },
  { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
  { key: "sla", label: "Fulfilment SLA", render: (order) => <StatusBadge status={order.SLA} /> },
  { key: "amount", label: "Amount", align: "right", render: (order) => <span className="font-bold tabular-nums">{formatMoney(order.amountMinor)}</span> },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; status?: string }> }) {
  const query = await searchParams; const state = resolvePageState(query.state); const orders = await apiGet<AdminOrder[]>("/admin/orders"); const needle = query.q?.toLowerCase().trim() ?? ""; const filtered = orders.filter((order) => (!needle || `${order.reference} ${order.customer}`.toLowerCase().includes(needle)) && (!query.status || order.status === query.status)); const displayed = state === "empty" ? [] : filtered;
  return <><PageHeader title="Orders" description="Cross-vendor order and fulfilment oversight" /><div className="mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6 lg:p-8">{state === "error" || state === "permission" ? <PageState state={state} resetHref="/orders" /> : <><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Orders today","428"],["Payment review","1"],["SLA at risk","7"],["Breached","2"]].map(([label,value]) => <div className="panel px-4 py-3" key={label}><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}</div><div className="panel overflow-hidden"><FilterBar placeholder="Search order or customer" defaultQuery={query.q}><select className="field w-auto min-w-44" name="status" defaultValue={query.status ?? ""} aria-label="Order status"><option value="">All statuses</option><option value="PAYMENT_REVIEW">Payment review</option><option value="CONFIRMED">Confirmed</option><option value="PROCESSING">Processing</option><option value="PARTIALLY_FULFILLED">Partially fulfilled</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></FilterBar></div>{displayed.length ? <DataTable caption="Marketplace orders" rows={displayed} columns={columns} getRowKey={(order) => order.id} /> : <PageState state="empty" resetHref="/orders" />}<p className="text-xs text-slate-500">Showing {displayed.length} of {orders.length} seeded operational records</p></>}</div></>;
}
