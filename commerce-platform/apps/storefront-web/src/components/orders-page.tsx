"use client";

import { ChevronRight, PackageSearch } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import { queryKeys } from "@/lib/query-keys";
import { useCheckout } from "@/providers/checkout-provider";
import { QueryError } from "./query-states";
import { OrderStatus } from "./order-status";

export function OrdersPage() {
  const checkout = useCheckout();
  const result = useQuery({ queryKey: queryKeys.orders, queryFn: api.getOrders });
  if (result.isLoading) return <div className="space-y-3 py-7" role="status">{Array.from({ length: 2 }, (_, index) => <div className="skeleton h-40" key={index} />)}<span className="sr-only">Loading orders</span></div>;
  if (result.isError) return <div className="py-7"><QueryError retry={() => result.refetch()} message="We could not load your order history." /></div>;
  const allOrders = [checkout.completedOrder, ...(result.data ?? [])].filter((order, index, values) => order && values.findIndex((entry) => entry?.id === order.id) === index);

  if (allOrders.length === 0) return <div className="grid min-h-80 place-items-center py-12 text-center"><div><PackageSearch className="mx-auto size-10 text-[var(--muted)]" /><h2 className="mt-4 text-xl font-black">No orders yet</h2><p className="mt-2 text-sm text-[var(--muted)]">Your purchases will appear here.</p><Link href="/" className="button-primary mt-5">Start shopping</Link></div></div>;
  return (
    <section className="py-7"><div className="mb-5 flex items-end justify-between"><div><h2 className="section-title">Orders</h2><p className="mt-1 text-sm text-[var(--muted)]">Follow current orders and find previous purchases.</p></div><span className="text-xs font-bold text-[var(--muted)]">{allOrders.length} orders</span></div>
      <div className="grid gap-4">{allOrders.map((order) => order && <article key={order.id} className="border border-[var(--border)] transition hover:border-[var(--border-strong)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5"><div><p className="text-xs text-[var(--muted)]">Order <strong className="text-[var(--ink)]">{order.publicReference}</strong></p><p className="mt-1 text-xs text-[var(--muted)]">{new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(order.placedAt))}</p></div><OrderStatus status={order.status} /></div><div className="flex items-center gap-4 p-4 sm:p-5"><div className="flex -space-x-3">{order.items.slice(0, 3).map((item) => <div key={item.offerId} className="relative size-14 overflow-hidden border-2 border-white bg-[var(--surface)]"><Image src={item.image} alt="" fill sizes="56px" className="object-cover" /></div>)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{order.items.map((item) => item.productName).join(", ")}</p><p className="mt-1 text-sm font-black">{formatMoney(order.totalMinor)}</p></div><Link href={`/account/orders/${order.id}`} className="icon-button" aria-label={`View order ${order.publicReference}`}><ChevronRight className="size-5" /></Link></div></article>)}</div>
    </section>
  );
}
