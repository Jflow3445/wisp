"use client";

import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { addMoney, formatMoney, multiplyMoney } from "@/lib/money";
import { queryKeys } from "@/lib/query-keys";
import { useCart } from "@/providers/cart-provider";

export function CartPage() {
  const cart = useCart();
  const catalog = useQuery({ queryKey: queryKeys.products({}), queryFn: () => api.getProducts(), enabled: cart.ready && cart.lines.length > 0 });

  if (!cart.ready || catalog.isLoading) return <div className="page-shell py-10" role="status"><div className="skeleton h-10 w-52" /><div className="skeleton mt-8 h-48 w-full" /><span className="sr-only">Loading basket</span></div>;
  if (cart.lines.length === 0) return <div className="page-shell grid min-h-[55vh] place-items-center py-16 text-center"><div className="max-w-sm"><ShoppingBag className="mx-auto size-11 text-[var(--muted)]" /><h1 className="mt-5 text-3xl font-black">Your basket is empty</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Find something useful, delicious or just right for you.</p><Link href="/" className="button-primary mt-7">Start shopping</Link></div></div>;

  const lines = cart.lines.flatMap((line) => {
    const product = catalog.data?.find((item) => item.offerId === line.offerId);
    return product ? [{ ...line, product }] : [];
  });
  const subtotal = addMoney(...lines.map((line) => multiplyMoney(line.product.priceMinor, line.quantity)));
  const delivery = BigInt(subtotal) >= 65000n ? "0" : "3500";
  const total = addMoney(subtotal, delivery);

  return (
    <div className="page-shell py-8 md:py-12">
      <div className="flex items-end justify-between border-b border-[var(--border)] pb-6"><div><p className="eyebrow">Your order</p><h1 className="page-title mt-2">Basket <span className="text-[var(--muted)]">({cart.itemCount})</span></h1></div><button type="button" onClick={cart.clearCart} className="button-danger"><Trash2 className="size-4" />Clear</button></div>
      <div className="mt-7 grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
        <section aria-label="Basket items" className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {lines.map(({ product, quantity }) => {
            const count = Number.parseInt(quantity, 10);
            const max = Number.parseInt(product.availableQuantity, 10);
            return (
              <article key={product.offerId} className="grid grid-cols-[6.5rem_1fr] gap-4 py-5 sm:grid-cols-[8rem_1fr_auto]">
                <Link href={`/product/${product.slug}`} className="relative aspect-square overflow-hidden bg-[var(--surface)]"><Image src={product.image} alt={product.imageAlt} fill sizes="128px" className="object-cover" /></Link>
                <div className="min-w-0"><p className="text-xs font-bold uppercase text-[var(--muted)]">{product.vendorSlug.replaceAll("-", " ")}</p><h2 className="mt-1 font-black leading-5"><Link href={`/product/${product.slug}`}>{product.name}</Link></h2><p className="mt-2 font-black">{formatMoney(product.priceMinor)}</p><button type="button" className="mt-3 text-xs font-bold text-[var(--error)] underline underline-offset-4" onClick={() => cart.removeItem(product.offerId)}>Remove</button></div>
                <div className="col-start-2 flex items-center justify-between sm:col-start-3 sm:flex-col sm:items-end"><div className="grid h-10 grid-cols-3 border border-[var(--border-strong)]"><button className="grid w-9 place-items-center" type="button" onClick={() => cart.setQuantity(product.offerId, String(count - 1))} aria-label={`Decrease ${product.shortName} quantity`}><Minus className="size-3.5" /></button><output className="grid w-9 place-items-center text-sm font-black" aria-label={`${product.shortName} quantity`}>{count}</output><button className="grid w-9 place-items-center" type="button" disabled={count >= max} onClick={() => cart.setQuantity(product.offerId, String(count + 1))} aria-label={`Increase ${product.shortName} quantity`}><Plus className="size-3.5" /></button></div><p className="font-black sm:mt-auto">{formatMoney(multiplyMoney(product.priceMinor, quantity))}</p></div>
              </article>
            );
          })}
        </section>
        <aside className="border border-[var(--border)] p-5 lg:sticky lg:top-32">
          <h2 className="text-lg font-black">Order summary</h2>
          <dl className="mt-5 grid gap-3 text-sm"><div className="flex justify-between"><dt className="text-[var(--muted)]">Subtotal</dt><dd className="font-bold">{formatMoney(subtotal)}</dd></div><div className="flex justify-between"><dt className="text-[var(--muted)]">Delivery</dt><dd className="font-bold">{delivery === "0" ? "Free" : formatMoney(delivery)}</dd></div><div className="mt-2 flex justify-between border-t border-[var(--border)] pt-4 text-base"><dt className="font-black">Total</dt><dd className="font-black">{formatMoney(total)}</dd></div></dl>
          {delivery !== "0" && <p className="mt-4 flex gap-2 bg-[var(--surface)] p-3 text-xs leading-5 text-[var(--muted)]"><Truck className="mt-0.5 size-4 shrink-0 text-[var(--green)]" />Add {formatMoney((65000n - BigInt(subtotal)).toString())} more for free delivery.</p>}
          <Link href="/checkout/start" className="button-primary mt-5 w-full">Continue to checkout <ArrowRight className="size-4" /></Link>
          <Link href="/" className="button-quiet mt-2 w-full">Keep shopping</Link>
        </aside>
      </div>
    </div>
  );
}
