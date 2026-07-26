"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { api } from "@/lib/api-client";
import { addMoney, formatMoney, multiplyMoney } from "@/lib/money";
import { queryKeys } from "@/lib/query-keys";
import { useCart } from "@/providers/cart-provider";

export function useCartSummary() {
  const cart = useCart();
  const catalog = useQuery({ queryKey: queryKeys.products({}), queryFn: () => api.getProducts(), enabled: cart.ready && cart.lines.length > 0 });
  const lines = cart.lines.flatMap((line) => {
    const product = catalog.data?.find((item) => item.offerId === line.offerId);
    return product ? [{ ...line, product }] : [];
  });
  const subtotal = addMoney(...lines.map((line) => multiplyMoney(line.product.priceMinor, line.quantity)));
  const delivery = BigInt(subtotal) >= 65000n ? "0" : "3500";
  return { ...cart, ...catalog, lines, subtotal, delivery, total: addMoney(subtotal, delivery) };
}

export function CheckoutSummary({ compact = false }: { compact?: boolean }) {
  const summary = useCartSummary();
  return (
    <aside className="border border-[var(--border)] p-5 lg:sticky lg:top-32" aria-label="Order summary">
      <div className="flex items-center justify-between"><h2 className="text-lg font-black">Your order</h2><span className="text-xs font-bold text-[var(--muted)]">{summary.itemCount} items</span></div>
      {!compact && <div className="mt-4 max-h-64 divide-y divide-[var(--border)] overflow-y-auto">{summary.lines.map((line) => <div className="flex gap-3 py-3" key={line.offerId}><div className="relative size-14 shrink-0 overflow-hidden bg-[var(--surface)]"><Image src={line.product.image} alt="" fill sizes="56px" className="object-cover" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{line.product.name}</p><p className="mt-1 text-xs text-[var(--muted)]">Qty {line.quantity}</p></div><p className="text-xs font-black">{formatMoney(multiplyMoney(line.product.priceMinor, line.quantity))}</p></div>)}</div>}
      <dl className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4 text-sm"><div className="flex justify-between"><dt className="text-[var(--muted)]">Subtotal</dt><dd className="font-bold">{formatMoney(summary.subtotal)}</dd></div><div className="flex justify-between"><dt className="text-[var(--muted)]">Delivery</dt><dd className="font-bold">{summary.delivery === "0" ? "Free" : formatMoney(summary.delivery)}</dd></div><div className="flex justify-between border-t border-[var(--border)] pt-3 text-base"><dt className="font-black">Total</dt><dd className="font-black">{formatMoney(summary.total)}</dd></div></dl>
    </aside>
  );
}
