"use client";

import { ArrowLeft, MapPin, MessageCircle, ReceiptText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { formatMoney, multiplyMoney } from "@/lib/money";
import { queryKeys } from "@/lib/query-keys";
import { useCheckout } from "@/providers/checkout-provider";
import { OrderStatus } from "./order-status";
import { QueryError } from "./query-states";

export function OrderDetail({ id }: { id: string }) {
  const checkout = useCheckout();
  const localOrder = checkout.completedOrder?.id === id ? checkout.completedOrder : undefined;
  const result = useQuery({ queryKey: queryKeys.order(id), queryFn: () => api.getOrder(id), enabled: checkout.ready && !localOrder });
  const order = localOrder ?? result.data;
  if (!checkout.ready || result.isLoading) return <div className="py-8"><div className="skeleton h-80" /></div>;
  if (result.isError && !order) return <div className="py-7"><QueryError retry={() => result.refetch()} message="We could not load this order." /></div>;
  if (!order) return null;

  return (
    <article className="py-7">
      <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm font-bold text-[var(--muted)] hover:text-[var(--ink)]"><ArrowLeft className="size-4" />All orders</Link>
      <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-3"><h2 className="section-title">Order {order.publicReference}</h2><OrderStatus status={order.status} /></div><p className="mt-2 text-sm text-[var(--muted)]">Placed {new Intl.DateTimeFormat("en-GH", { dateStyle: "long", timeStyle: "short" }).format(new Date(order.placedAt))}</p></div><button type="button" className="button-secondary w-fit"><MessageCircle className="size-4" />Get help</button></div>
      {order.isDemo && <p className="mt-5 border border-[#e4bd42] bg-[#fff9df] p-4 text-sm"><strong>Demo order:</strong> no payment or real delivery is associated with this reference.</p>}
      <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="space-y-7">
          <section className="border border-[var(--border)] p-5"><h3 className="text-base font-black">Delivery progress</h3><ol className="mt-5">{order.timeline.map((event, index) => <li className="relative flex min-h-16 gap-4 last:min-h-0" key={event.label}>{index < order.timeline.length - 1 && <span className={`absolute left-[.45rem] top-4 h-[calc(100%-0.25rem)] w-px ${event.complete ? "bg-[var(--green)]" : "bg-[var(--border-strong)]"}`} />}<span className={`relative z-10 mt-1 size-4 shrink-0 rounded-full border-4 ${event.complete ? "border-[#d9eee6] bg-[var(--green)]" : "border-[var(--surface-strong)] bg-[var(--border-strong)]"}`} /><div><p className={`text-sm font-bold ${event.complete ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>{event.label}</p>{event.at && <p className="mt-1 text-xs text-[var(--muted)]">{event.at}</p>}</div></li>)}</ol></section>
          <section className="border border-[var(--border)]"><h3 className="border-b border-[var(--border)] px-5 py-4 text-base font-black">Items</h3><div className="divide-y divide-[var(--border)]">{order.items.map((item) => <div className="flex items-center gap-4 p-4 sm:p-5" key={item.offerId}><div className="relative size-16 shrink-0 overflow-hidden bg-[var(--surface)]"><Image src={item.image} alt="" fill sizes="64px" className="object-cover" /></div><div className="min-w-0 flex-1"><p className="text-sm font-bold">{item.productName}</p><p className="mt-1 text-xs text-[var(--muted)]">Quantity {item.quantity}</p></div><p className="text-sm font-black">{formatMoney(multiplyMoney(item.unitPriceMinor, item.quantity))}</p></div>)}</div></section>
        </div>
        <aside className="space-y-4">
          <section className="border border-[var(--border)] p-5"><h3 className="flex items-center gap-2 text-sm font-black"><ReceiptText className="size-4 text-[var(--green)]" />Payment summary</h3><dl className="mt-4 grid gap-3 text-sm"><div className="flex justify-between"><dt className="text-[var(--muted)]">Delivery</dt><dd>{order.deliveryMinor === "0" ? "Free" : formatMoney(order.deliveryMinor)}</dd></div><div className="flex justify-between border-t border-[var(--border)] pt-3"><dt className="font-black">Total</dt><dd className="font-black">{formatMoney(order.totalMinor)}</dd></div></dl><p className="mt-4 text-xs capitalize text-[var(--muted)]">{order.paymentMethod.toLowerCase()}</p></section>
          <section className="border border-[var(--border)] p-5"><h3 className="flex items-center gap-2 text-sm font-black"><MapPin className="size-4 text-[var(--green)]" />Delivery address</h3><address className="mt-3 text-sm not-italic leading-6 text-[var(--muted)]"><strong className="text-[var(--ink)]">{order.address.recipientName}</strong><br />{order.address.streetAddress}<br />{order.address.city}, {order.address.region}<br />{order.address.phone}</address></section>
        </aside>
      </div>
    </article>
  );
}
