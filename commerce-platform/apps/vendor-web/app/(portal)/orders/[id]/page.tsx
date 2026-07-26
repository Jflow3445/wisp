import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, MapPin, Phone, ReceiptText, ShieldCheck } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api";
import type { Order } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { OrderActions } from "@/components/order-actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Order detail" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: Order;
  try { order = await apiGet<Order>(`/vendor/orders/${id}`); } catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }
  const subtotal = order.items.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n).toString();

  return (
    <>
      <PageHeader title={order.reference} description={`Placed ${formatDateTime(order.placedAt)} - ${order.itemCount} items`} actions={<OrderActions order={order} />} />
      <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6 lg:p-8">
        <Link href="/orders" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-forest"><ArrowLeft className="h-3.5 w-3.5" />Back to orders</Link>
        {order.status === "AWAITING_VENDOR_RESPONSE" ? <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center"><Clock3 className="h-4 w-4 shrink-0" /><span className="font-semibold">Response due in 9 minutes.</span><span className="text-amber-800">Unanswered orders are automatically rejected when the reservation window closes.</span></div> : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.8fr)]">
          <div className="space-y-4">
            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3.5 sm:px-5"><h2 className="text-sm font-bold">Order items</h2><StatusBadge status={order.status} /></div>
              <div className="divide-y divide-line">
                {order.items.map((item) => <div key={item.sku} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-4 sm:px-5"><div><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.sku} - Qty {item.quantity}</p></div><p className="text-sm font-semibold tabular-nums">{formatMoney(item.amountMinor)}</p></div>)}
              </div>
              <dl className="ml-auto grid max-w-xs grid-cols-2 gap-x-6 gap-y-2 border-t border-line px-4 py-4 text-sm sm:px-5"><dt className="text-slate-500">Subtotal</dt><dd className="text-right tabular-nums">{formatMoney(subtotal)}</dd><dt className="font-bold">Vendor receivable</dt><dd className="text-right font-bold tabular-nums">{formatMoney(order.amountMinor)}</dd></dl>
            </section>
            <section className="panel overflow-hidden">
              <div className="border-b border-line px-4 py-3.5 sm:px-5"><h2 className="text-sm font-bold">Activity</h2></div>
              <ol className="px-4 py-2 sm:px-5">{order.timeline.map((entry, index) => <li key={`${entry.label}-${entry.at}`} className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 py-3"><span className={`mt-1 grid h-5 w-5 place-items-center rounded-full ${index === order.timeline.length - 1 ? "bg-forest text-white" : "bg-slate-200 text-slate-600"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" /></span><div><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold">{entry.label}</p><time className="text-[11px] text-slate-500">{formatDateTime(entry.at)}</time></div><p className="mt-1 text-xs text-slate-500">{entry.detail}</p></div></li>)}</ol>
            </section>
          </div>
          <div className="space-y-4">
            <section className="panel p-4 sm:p-5"><h2 className="text-sm font-bold">Customer & delivery</h2><div className="mt-4 space-y-4 text-sm"><div><p className="font-semibold">{order.customer}</p><p className="mt-1 flex items-center gap-2 text-xs text-slate-500"><Phone className="h-3.5 w-3.5" />{order.customerPhone}</p></div><div className="flex gap-2 border-t border-line pt-4"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><p className="text-xs leading-5 text-slate-600">{order.deliveryAddress}</p></div></div></section>
            <section className="panel p-4 sm:p-5"><h2 className="flex items-center gap-2 text-sm font-bold"><ReceiptText className="h-4 w-4 text-slate-500" />Payment</h2><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><dt className="text-slate-500">Method</dt><dd className="text-right font-semibold">{order.paymentMethod}</dd><dt className="text-slate-500">Verification</dt><dd className="text-right font-semibold text-emerald-700">Confirmed</dd></dl><div className="mt-4 flex gap-2 rounded-md bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />Payment outcomes are controlled by verified provider events.</div></section>
          </div>
        </div>
      </div>
    </>
  );
}
