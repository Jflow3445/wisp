import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Webhook } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Payment } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { PaymentActions } from "@/components/payment-actions";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Payments" };

const columns: Column<Payment>[] = [
  { key: "payment", label: "Payment", render: (payment) => <div><p className="font-bold">{payment.reference}</p><p className="mt-0.5 text-xs text-slate-500">{payment.orderReference}</p></div> },
  { key: "provider", label: "Provider", render: (payment) => <div><p className="font-semibold">{payment.provider}</p><p className="mt-0.5 text-xs text-slate-500">{payment.providerReference}</p></div> },
  { key: "updated", label: "Updated", render: (payment) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(payment.updatedAt)}</span> },
  { key: "status", label: "Status", render: (payment) => <StatusBadge status={payment.status} /> },
  { key: "amount", label: "Amount", align: "right", render: (payment) => <span className="font-bold tabular-nums">{formatMoney(payment.amountMinor)}</span> },
  { key: "action", label: "Action", align: "right", render: (payment) => <PaymentActions payment={payment} /> },
];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; status?: string }> }) {
  const query = await searchParams; const state = resolvePageState(query.state); const payments = await apiGet<Payment[]>("/admin/payments"); const needle = query.q?.toLowerCase().trim() ?? ""; const filtered = payments.filter((payment) => (!needle || `${payment.reference} ${payment.orderReference} ${payment.providerReference}`.toLowerCase().includes(needle)) && (!query.status || payment.status === query.status)); const displayed = state === "empty" ? [] : filtered;
  return <><PageHeader title="Payments" description="Provider-verified payment outcomes and exceptions" actions={<Link href="/payments/webhooks" className="btn-secondary"><Webhook className="h-4 w-4" />Webhook events</Link>} /><div className="mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6 lg:p-8">{state === "error" || state === "permission" ? <PageState state={state} resetHref="/payments" /> : <><div className="panel flex gap-3 border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>Payment success can only be confirmed with verified provider evidence. Review actions cannot route provider checkout attempts into a manual credit path.</span></div><div className="panel overflow-hidden"><FilterBar placeholder="Search payment, order, or provider reference" defaultQuery={query.q}><select className="field w-auto min-w-40" name="status" defaultValue={query.status ?? ""} aria-label="Payment status"><option value="">All statuses</option><option value="UNDER_REVIEW">Under review</option><option value="PENDING">Pending</option><option value="SUCCESSFUL">Successful</option><option value="FAILED">Failed</option><option value="REVERSED">Reversed</option><option value="REFUNDED">Refunded</option></select></FilterBar></div>{displayed.length ? <DataTable caption="Marketplace payments" rows={displayed} columns={columns} getRowKey={(payment) => payment.id} /> : <PageState state="empty" resetHref="/payments" />}<p className="text-xs text-slate-500">{payments.filter((payment) => payment.status === "UNDER_REVIEW").length} payment requires provider verification review</p></>}</div></>;
}
