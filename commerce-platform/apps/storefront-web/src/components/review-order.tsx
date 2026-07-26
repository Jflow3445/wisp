"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, LockKeyhole, MapPin, Pencil, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { useCart } from "@/providers/cart-provider";
import { useCheckout } from "@/providers/checkout-provider";
import { CheckoutSummary, useCartSummary } from "./checkout-summary";

export function ReviewOrder() {
  const router = useRouter();
  const checkout = useCheckout();
  const cart = useCart();
  const summary = useCartSummary();
  const liveApiConfigured = Boolean(process.env.NEXT_PUBLIC_MARKETPLACE_API_URL);
  const order = useMutation({
    mutationFn: () => api.createCheckout({ cartVersion: 1, currency: "GHS", items: cart.lines, deliveryAddress: checkout.delivery!, payment: checkout.payment! }, crypto.randomUUID()),
    onSuccess: (createdOrder) => {
      checkout.setCompletedOrder(createdOrder);
      cart.clearCart();
      router.replace(`/order-confirmed/${createdOrder.publicReference}`);
    },
  });

  if (!checkout.ready || !cart.ready || summary.isLoading) return <div className="skeleton h-72 w-full" role="status"><span className="sr-only">Loading order review</span></div>;
  if (!checkout.delivery || !checkout.payment) return <div className="py-16 text-center"><h1 className="text-2xl font-black">Checkout details are incomplete</h1><p className="mt-2 text-sm text-[var(--muted)]">Add your delivery and payment details before reviewing the order.</p><Link href="/checkout/start" className="button-primary mt-5">Return to checkout</Link></div>;
  if (summary.lines.length === 0) return <div className="py-16 text-center"><h1 className="text-2xl font-black">Your basket is empty</h1><Link href="/" className="button-primary mt-5">Return to the market</Link></div>;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
      <section><h1 className="section-title">Review and place your order</h1><p className="mt-2 text-sm text-[var(--muted)]">Prices, delivery and stock are checked again when you continue.</p>
        {!liveApiConfigured && <div className="mt-6 flex gap-3 border border-[#e4bd42] bg-[#fff9df] p-4 text-sm leading-6" role="note"><AlertCircle className="mt-0.5 size-5 shrink-0" /><p><strong>Demo checkout:</strong> this local order creates no payment or fulfilment. A production order requires confirmation from the marketplace API.</p></div>}
        <div className="mt-7 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          <section className="grid gap-4 py-5 sm:grid-cols-[10rem_1fr_auto]"><h2 className="flex items-center gap-2 text-sm font-black"><MapPin className="size-4 text-[var(--green)]" />Delivery</h2><address className="text-sm not-italic leading-6 text-[var(--muted)]"><strong className="text-[var(--ink)]">{checkout.delivery.recipientName}</strong><br />{checkout.delivery.streetAddress}, {checkout.delivery.city}<br />{checkout.delivery.region} · {checkout.delivery.phone}</address><Link href="/checkout/start" className="button-quiet h-fit"><Pencil className="size-3.5" />Edit</Link></section>
          <section className="grid gap-4 py-5 sm:grid-cols-[10rem_1fr_auto]"><h2 className="flex items-center gap-2 text-sm font-black"><Smartphone className="size-4 text-[var(--green)]" />Payment</h2><p className="text-sm capitalize text-[var(--muted)]">{checkout.payment.method.replaceAll("_", " ").toLowerCase()}{checkout.payment.network ? ` · ${checkout.payment.network}` : ""}</p><Link href="/checkout/payment" className="button-quiet h-fit"><Pencil className="size-3.5" />Edit</Link></section>
        </div>
        {order.isError && <div className="mt-6 flex gap-3 border border-[#efb5ae] bg-[#fff0ee] p-4 text-sm text-[var(--error)]" role="alert"><AlertCircle className="size-5 shrink-0" /><p>{order.error instanceof Error ? order.error.message : "Checkout could not be completed."} Your basket has not been charged.</p></div>}
        <div className="mt-8 flex flex-col-reverse justify-between gap-3 sm:flex-row"><Link href="/checkout/payment" className="button-secondary"><ArrowLeft className="size-4" />Back</Link><button type="button" onClick={() => order.mutate()} disabled={order.isPending} className="button-primary min-w-52"><LockKeyhole className="size-4" />{order.isPending ? "Checking your order…" : liveApiConfigured ? "Place order securely" : "Create demo order"}</button></div>
      </section>
      <CheckoutSummary />
    </div>
  );
}
