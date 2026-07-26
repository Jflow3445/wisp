import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Order } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Orders" };

const columns: Column<Order>[] = [
  { key: "reference", label: "Order", render: (order) => <div><Link className="font-bold hover:text-forest" href={`/orders/${order.id}`}>{order.reference}</Link><div className="mt-0.5 text-xs text-slate-500">{order.customer}</div></div> },
  { key: "placed", label: "Placed", render: (order) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(order.placedAt)}</span> },
  { key: "items", label: "Items", render: (order) => order.itemCount },
  { key: "payment", label: "Payment", render: (order) => <span className="text-slate-600">{order.paymentMethod}</span> },
  { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
  { key: "total", label: "Total", align: "right", render: (order) => <span className="font-semibold tabular-nums">{formatMoney(order.amountMinor)}</span> },
  { key: "view", label: "", align: "right", render: (order) => <Link href={`/orders/${order.id}`} className="inline-grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label={`View ${order.reference}`}><ChevronRight className="h-4 w-4" /></Link> },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; status?: string }> }) {
  const query = await searchParams;
  const state = resolvePageState(query.state);
  const orders = await apiGet<Order[]>("/vendor/orders");
  const needle = query.q?.trim().toLowerCase() ?? "";
  const filtered = orders.filter((order) => (!needle || `${order.reference} ${order.customer}`.toLowerCase().includes(needle)) && (!query.status || order.status === query.status));
  const displayed = state === "empty" ? [] : filtered;

  return (
    <>
      <PageHeader title="Orders" description="Respond, prepare, and hand over marketplace orders" />
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
            {[['Needs response','2'],['Preparing','4'],['Ready','3'],['Completed today','18']].map(([label, value]) => <div key={label} className="px-4 py-3"><p className="text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}
          </div>
        </div>
        {state === "error" || state === "permission" ? <PageState state={state} resetHref="/orders" /> : (
          <>
            <div className="panel overflow-hidden"><FilterBar placeholder="Search order or customer" defaultQuery={query.q}><select className="field w-auto min-w-40" name="status" defaultValue={query.status ?? ""} aria-label="Order status"><option value="">All statuses</option><option value="AWAITING_VENDOR_RESPONSE">Needs response</option><option value="PREPARING">Preparing</option><option value="READY_FOR_PICKUP">Ready for pickup</option><option value="OUT_FOR_DELIVERY">Out for delivery</option><option value="DELIVERED">Delivered</option></select></FilterBar></div>
            {displayed.length ? <DataTable caption="Vendor orders" rows={displayed} columns={columns} getRowKey={(order) => order.id} /> : <PageState state="empty" resetHref="/orders" />}
            <p className="text-xs text-slate-500">Showing {displayed.length} of {orders.length} orders</p>
          </>
        )}
      </div>
    </>
  );
}
