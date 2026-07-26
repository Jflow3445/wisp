"use client";

import { ArrowLeft, BadgeCheck, Check, Minus, Plus, RotateCcw, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { categories, vendors } from "@/lib/demo-data";
import { discountPercentage, formatMoney } from "@/lib/money";
import { queryKeys } from "@/lib/query-keys";
import { useCart } from "@/providers/cart-provider";
import { ProductGrid } from "./product-grid";
import { QueryError } from "./query-states";
import { Rating } from "./rating";

export function ProductPage({ slug }: { slug: string }) {
  const product = useQuery({ queryKey: queryKeys.product(slug), queryFn: () => api.getProduct(slug) });
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItem } = useCart();
  const related = useQuery({
    queryKey: queryKeys.products({ category: product.data?.categorySlug }),
    queryFn: () => api.getProducts({ category: product.data?.categorySlug }),
    enabled: Boolean(product.data),
  });

  if (product.isLoading) return <div className="page-shell grid gap-8 py-8 md:grid-cols-2"><div className="skeleton aspect-square" /><div className="space-y-4"><div className="skeleton h-5 w-28" /><div className="skeleton h-16 w-full" /><div className="skeleton h-8 w-40" /></div></div>;
  if (product.isError || !product.data) return <div className="page-shell py-10"><QueryError retry={() => product.refetch()} message="This product may no longer be available." /></div>;

  const item = product.data;
  const vendor = vendors.find((entry) => entry.slug === item.vendorSlug);
  const category = categories.find((entry) => entry.slug === item.categorySlug);
  const maxQuantity = Number.parseInt(item.availableQuantity, 10);
  const unavailable = item.stockStatus === "OUT_OF_STOCK";
  const discount = discountPercentage(item.priceMinor, item.previousPriceMinor);

  const add = () => {
    addItem(item.offerId, quantity.toString());
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };

  return (
    <>
      <div className="page-shell py-5 md:py-8">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold text-[var(--muted)]"><Link href={category ? `/category/${category.slug}` : "/search"} className="flex items-center gap-1 hover:text-[var(--ink)]"><ArrowLeft className="size-3.5" />{category?.name ?? "All products"}</Link><span>/</span><span className="truncate">{item.name}</span></div>
        <article className="grid gap-7 md:grid-cols-[minmax(0,1.1fr)_minmax(21rem,.9fr)] md:gap-12 lg:gap-16">
          <div className="relative aspect-square overflow-hidden bg-[var(--surface)]"><Image src={item.image} alt={item.imageAlt} fill priority sizes="(max-width: 768px) 100vw, 55vw" className="object-cover" />{item.badge && <span className="absolute left-3 top-3 bg-white px-3 py-2 text-xs font-black text-[var(--green)] shadow-sm">{item.badge}</span>}</div>
          <div className="md:pt-3">
            <Link href={`/vendor/${item.vendorSlug}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--green)] hover:underline">{vendor?.name ?? item.vendorSlug}<BadgeCheck className="size-4 fill-[var(--green)] text-white" /></Link>
            <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{item.name}</h1>
            <div className="mt-3"><Rating value={item.rating} count={item.reviewCount} /></div>
            <div className="mt-5 flex flex-wrap items-baseline gap-3"><span className="text-2xl font-black">{formatMoney(item.priceMinor)}</span>{item.previousPriceMinor && <span className="text-sm text-[var(--muted)] line-through">{formatMoney(item.previousPriceMinor)}</span>}{discount > 0 && <span className="bg-[#ffebe6] px-2 py-1 text-xs font-black text-[var(--accent-dark)]">Save {discount}%</span>}</div>
            <p className="mt-6 text-[.95rem] leading-7 text-[var(--muted)]">{item.description}</p>
            <ul className="mt-5 grid gap-2 text-sm">{item.highlights.map((highlight) => <li key={highlight} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[var(--green)]" />{highlight}</li>)}</ul>
            <div className="mt-7 border-y border-[var(--border)] py-5">
              <div className="mb-4 flex items-center justify-between"><span className="text-sm font-black">Quantity</span><span className={`text-xs font-bold ${item.stockStatus === "LOW_STOCK" ? "text-[var(--accent)]" : "text-[var(--green)]"}`}>{item.stockStatus === "LOW_STOCK" ? `Only ${item.availableQuantity} left` : "In stock"}</span></div>
              <div className="grid grid-cols-[7.75rem_1fr] gap-3">
                <div className="grid h-12 grid-cols-3 border border-[var(--border-strong)]"><button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="grid place-items-center" aria-label="Decrease quantity"><Minus className="size-4" /></button><output className="grid place-items-center text-sm font-black" aria-label="Quantity">{quantity}</output><button type="button" onClick={() => setQuantity((current) => Math.min(maxQuantity, current + 1))} className="grid place-items-center" aria-label="Increase quantity"><Plus className="size-4" /></button></div>
                <button type="button" onClick={add} disabled={unavailable} className="button-primary h-12">{added ? <><Check className="size-4" />Added to basket</> : <><ShoppingBag className="size-4" />Add to basket</>}</button>
              </div>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-[var(--muted)]"><p className="flex gap-2"><Truck className="size-4 shrink-0 text-[var(--green)]" />Delivery fee and arrival time confirmed at checkout.</p><p className="flex gap-2"><ShieldCheck className="size-4 shrink-0 text-[var(--green)]" />Secure Mobile Money and card payments.</p><p className="flex gap-2"><RotateCcw className="size-4 shrink-0 text-[var(--green)]" />Returns accepted within the seller’s stated return window.</p></div>
          </div>
        </article>
      </div>
      {related.data && related.data.filter((entry) => entry.id !== item.id).length > 0 && <section className="page-shell section-space border-t border-[var(--border)]"><h2 className="section-title mb-6">More in {category?.name}</h2><ProductGrid products={related.data.filter((entry) => entry.id !== item.id).slice(0, 5)} /></section>}
    </>
  );
}
