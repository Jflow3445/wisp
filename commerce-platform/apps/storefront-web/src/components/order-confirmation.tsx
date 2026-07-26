"use client";

import { CheckCircle2, Clock3, MapPin, PackageCheck } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { useCheckout } from "@/providers/checkout-provider";

export function OrderConfirmation({ reference }: { reference: string }) {
  const checkout = useCheckout();
  if (!checkout.ready) return <div className="page-shell py-12"><div className="skeleton mx-auto h-72 max-w-2xl" /></div>;
  const order = checkout.completedOrder?.publicReference === reference || checkout.completedOrder?.id === reference ? checkout.completedOrder : undefined;

  if (!order) return (
    <div className="page-shell grid min-h-[55vh] place-items-center py-16 text-center"><div className="max-w-md"><PackageCheck className="mx-auto size-11 text-[var(--muted)]" /><h1 className="mt-5 text-2xl font-black">Order details are no longer on this device</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Sign in to view confirmed orders and live delivery updates.</p><Link href="/account/orders" className="button-primary mt-6">View my orders</Link></div></div>
  );

  return (
    <div className="page-shell max-w-4xl py-10 md:py-16">
      <div className="text-center"><CheckCircle2 className="mx-auto size-14 text-[var(--green)]" /><p className="eyebrow mt-5">{order.isDemo ? "Demo order created" : "Order confirmed"}</p><h1 className="page-title mt-2">{order.isDemo ? "Your checkout flow worked." : "Thank you. We have your order."}</h1><p className="mt-3 text-sm text-[var(--muted)]">Reference <strong className="text-[var(--ink)]">{order.publicReference}</strong></p></div>
      {order.isDemo && <div className="mx-auto mt-7 max-w-2xl border border-[#e4bd42] bg-[#fff9df] p-4 text-center text-sm leading-6"><strong>No payment was taken.</strong> This confirmation exists only in your local demo session.</div>}
      <div className="mt-9 grid gap-4 sm:grid-cols-3">
        <div className="border border-[var(--border)] p-4"><Clock3 className="size-5 text-[var(--green)]" /><h2 className="mt-3 text-sm font-black">Next update</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">We’ll notify you when vendors accept and start packing.</p></div>
        <div className="border border-[var(--border)] p-4"><MapPin className="size-5 text-[var(--green)]" /><h2 className="mt-3 text-sm font-black">Delivering to</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{order.address.streetAddress}, {order.address.city}</p></div>
        <div className="border border-[var(--border)] p-4"><PackageCheck className="size-5 text-[var(--green)]" /><h2 className="mt-3 text-sm font-black">Order total</h2><p className="mt-1 text-lg font-black">{formatMoney(order.totalMinor)}</p></div>
      </div>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Link href={`/account/orders/${order.id}`} className="button-primary">View order details</Link><Link href="/" className="button-secondary">Continue shopping</Link></div>
    </div>
  );
}
