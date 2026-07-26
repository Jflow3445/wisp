"use client";

import { Check, Plus, ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { discountPercentage, formatMoney } from "@/lib/money";
import type { Product } from "@/lib/types";
import { useCart } from "@/providers/cart-provider";
import { Rating } from "./rating";

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const discount = discountPercentage(product.priceMinor, product.previousPriceMinor);
  const unavailable = product.stockStatus === "OUT_OF_STOCK";

  const add = () => {
    addItem(product.offerId);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };

  return (
    <article className="group min-w-0">
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--surface)]">
        <Link href={`/product/${product.slug}`} aria-label={`View ${product.name}`} className="absolute inset-0 z-10">
          <Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
        </Link>
        {product.badge && <span className="absolute left-2 top-2 z-20 max-w-[calc(100%-1rem)] bg-white px-2 py-1 text-[10px] font-black uppercase text-[var(--green)] shadow-sm">{product.badge}</span>}
        {discount > 0 && <span className="absolute bottom-2 left-2 z-20 bg-[var(--accent)] px-2 py-1 text-[10px] font-black text-white">-{discount}%</span>}
        <button type="button" onClick={add} disabled={unavailable} className="absolute bottom-2 right-2 z-20 grid size-10 place-items-center bg-[var(--ink)] text-white shadow-md transition hover:bg-[var(--green)] disabled:bg-[var(--muted)]" aria-label={`Add ${product.name} to basket`} title={`Add ${product.shortName} to basket`}>
          {added ? <Check className="size-5" /> : <Plus className="size-5" />}
        </button>
      </div>
      <div className="pt-3">
        <p className="truncate text-[11px] font-bold uppercase text-[var(--muted)]">{product.vendorSlug.replaceAll("-", " ")}</p>
        <h3 className="mt-1 min-h-10 text-sm font-bold leading-5 sm:text-[.94rem]"><Link href={`/product/${product.slug}`} className="hover:text-[var(--accent)]">{product.name}</Link></h3>
        <div className="mt-1"><Rating value={product.rating} count={product.reviewCount} /></div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="font-black">{formatMoney(product.priceMinor)}</span>
          {product.previousPriceMinor && <span className="text-xs text-[var(--muted)] line-through">{formatMoney(product.previousPriceMinor)}</span>}
        </div>
        {added && <p className="mt-1 flex items-center gap-1 text-xs font-bold text-[var(--green)]" role="status"><ShoppingBag className="size-3" />Added to basket</p>}
      </div>
    </article>
  );
}
