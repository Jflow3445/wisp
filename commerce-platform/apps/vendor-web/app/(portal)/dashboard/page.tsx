import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, PackageCheck, TriangleAlert } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DashboardData, Order } from "@/lib/types";
import { formatMoney, formatDateTime } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import { DataTable, type Column } from "@/components/data-table";

export const metadata: Metadata = { title: "Dashboard" };

const orderColumns: Column<Order>[] = [
  { key: "order", label: "Order", render: (order) => <div><Link href={`/orders/${order.id}`} className="font-bold text-ink hover:text-forest">{order.reference}</Link><div className="mt-0.5 text-xs text-slate-500">{order.customer}</div></div> },
  { key: "placed", label: "Placed", render: (order) => <span className="text-slate-600">{formatDateTime(order.placedAt)}</span> },
  { key: "items", label: "Items", render: (order) => <span>{order.itemCount}</span> },
  { key: "status", label: "Status", render: (order) => <StatusBadge status={order.status} /> },
  { key: "total", label: "Total", align: "right", render: (order) => <span className="font-semibold tabular-nums">{formatMoney(order.amountMinor)}</span> },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const query = await searchParams;
  const state = resolvePageState(query.state);
  const data = await apiGet<DashboardData>("/vendor/dashboard");

  return (
    <>
      <PageHeader title="Operations overview" description="Monday, 20 July - Nana's Pantry" actions={<Link href="/orders" className="btn-secondary">View all orders <ArrowRight className="h-4 w-4" /></Link>} />
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
        {state !== "ready" ? <PageState state={state} resetHref="/dashboard" /> : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Daily performance">
              {data.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
            </section>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
              <section className="min-w-0">
                <div className="mb-3 flex items-center justify-between"><div><h2 className="text-base font-bold">Active orders</h2><p className="mt-0.5 text-xs text-slate-500">Prioritised by response and fulfilment deadline</p></div><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Clock3 className="h-3.5 w-3.5" />2 due soon</span></div>
                <DataTable caption="Active orders" rows={data.orders} columns={orderColumns} getRowKey={(order) => order.id} />
              </section>
              <div className="space-y-4">
                <section className="panel p-4 sm:p-5">
                  <div className="flex items-start justify-between"><div><h2 className="text-sm font-bold">Onboarding</h2><p className="mt-1 text-xs text-slate-500">4 of 5 requirements complete</p></div><span className="text-lg font-bold text-forest">{data.onboardingPercent}%</span></div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-forest" style={{ width: `${data.onboardingPercent}%` }} /></div>
                  <Link href="/onboarding" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-forest hover:underline">Review requirement <ArrowRight className="h-3.5 w-3.5" /></Link>
                </section>
                <section className="panel overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-line px-4 py-3"><TriangleAlert className="h-4 w-4 text-amber-600" /><h2 className="text-sm font-bold">Low stock</h2></div>
                  <div className="divide-y divide-line">
                    {data.lowStock.map((product) => <div key={product.id} className="flex items-center gap-3 px-4 py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-50 text-amber-700"><PackageCheck className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{product.name}</p><p className="mt-0.5 text-[11px] text-slate-500">{product.sku}</p></div><span className="text-xs font-bold text-amber-700">{product.stock} left</span></div>)}
                  </div>
                  <Link href="/inventory" className="block border-t border-line px-4 py-3 text-center text-xs font-bold text-forest hover:bg-slate-50">Manage inventory</Link>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
