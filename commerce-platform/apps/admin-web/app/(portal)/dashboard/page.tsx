import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleAlert, Clock3, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { AdminDashboard, Payment, VendorReview } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Dashboard" };

const vendorColumns: Column<VendorReview>[] = [
  { key: "vendor", label: "Vendor", render: (vendor) => <div><p className="font-semibold">{vendor.name}</p><p className="mt-0.5 text-xs text-slate-500">{vendor.reference} - {vendor.category}</p></div> },
  { key: "submitted", label: "Submitted", render: (vendor) => <span className="text-slate-600">{formatDateTime(vendor.submittedAt)}</span> },
  { key: "risk", label: "Risk", render: (vendor) => <StatusBadge status={vendor.risk} /> },
  { key: "status", label: "Status", align: "right", render: (vendor) => <StatusBadge status={vendor.status} /> },
];

const paymentColumns: Column<Payment>[] = [
  { key: "payment", label: "Payment", render: (payment) => <div><p className="font-semibold">{payment.reference}</p><p className="mt-0.5 text-xs text-slate-500">{payment.orderReference}</p></div> },
  { key: "provider", label: "Provider", render: (payment) => payment.provider },
  { key: "status", label: "Status", render: (payment) => <StatusBadge status={payment.status} /> },
  { key: "amount", label: "Amount", align: "right", render: (payment) => <span className="font-bold tabular-nums">{formatMoney(payment.amountMinor)}</span> },
];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const query = await searchParams;
  const state = resolvePageState(query.state);
  const data = await apiGet<AdminDashboard>("/admin/dashboard");
  return <><PageHeader title="Marketplace control" description="Monday, 20 July - Live operational overview" actions={<span className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"><ShieldCheck className="h-4 w-4" />All core services healthy</span>} /><div className="mx-auto max-w-[1680px] space-y-5 p-4 sm:p-6 lg:p-8">{state !== "ready" ? <PageState state={state} resetHref="/dashboard" /> : <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}</section><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Link href="/vendors" className="panel flex items-center gap-3 p-4 transition hover:border-slate-400"><span className="grid h-9 w-9 place-items-center rounded-md bg-violet-50 text-violet-700"><Clock3 className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs text-slate-500">Vendor reviews</span><span className="mt-0.5 block text-sm font-bold">3 awaiting action</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></Link><Link href="/products" className="panel flex items-center gap-3 p-4 transition hover:border-slate-400"><span className="grid h-9 w-9 place-items-center rounded-md bg-blue-50 text-blue-700"><Clock3 className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs text-slate-500">Product moderation</span><span className="mt-0.5 block text-sm font-bold">4 in queue</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></Link><Link href="/payments" className="panel flex items-center gap-3 p-4 transition hover:border-slate-400"><span className="grid h-9 w-9 place-items-center rounded-md bg-amber-50 text-amber-700"><CircleAlert className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs text-slate-500">Payment review</span><span className="mt-0.5 block text-sm font-bold">1 ambiguous outcome</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></Link><Link href="/reconciliation" className="panel flex items-center gap-3 p-4 transition hover:border-slate-400"><span className="grid h-9 w-9 place-items-center rounded-md bg-red-50 text-red-700"><CircleAlert className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs text-slate-500">Reconciliation</span><span className="mt-0.5 block text-sm font-bold">1 case beyond SLA</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></Link></section><div className="grid gap-5 2xl:grid-cols-2"><section className="min-w-0"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-base font-bold">Vendor review queue</h2><p className="mt-0.5 text-xs text-slate-500">Oldest submitted applications first</p></div><Link href="/vendors" className="text-xs font-bold text-navy hover:underline">Open queue</Link></div><DataTable caption="Vendor review queue" rows={data.vendors} columns={vendorColumns} getRowKey={(vendor) => vendor.id} /></section><section className="min-w-0"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-base font-bold">Recent payments</h2><p className="mt-0.5 text-xs text-slate-500">Verified and review-required outcomes</p></div><Link href="/payments" className="text-xs font-bold text-navy hover:underline">Open payments</Link></div><DataTable caption="Recent payments" rows={data.payments} columns={paymentColumns} getRowKey={(payment) => payment.id} /></section></div></>}</div></>;
}
