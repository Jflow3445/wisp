"use client";

import { ArrowRight, BadgeCheck, MapPin, ShieldCheck, Truck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { CategoryRail } from "./category-rail";
import { ProductGrid } from "./product-grid";
import { ProductGridSkeleton, QueryError } from "./query-states";

export function HomePage() {
  const products = useQuery({ queryKey: queryKeys.products({ sort: "featured" }), queryFn: () => api.getProducts({ sort: "featured" }) });

  return (
    <>
      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="page-shell flex min-h-14 flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <p className="flex items-center gap-2 font-bold"><MapPin className="size-4 text-[var(--accent)]" />Delivering to <button className="underline underline-offset-4">Accra</button></p>
          <div className="hidden items-center gap-6 text-xs font-semibold text-[var(--muted)] sm:flex"><span className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-[var(--green)]" />Secure checkout</span><span className="flex items-center gap-1.5"><BadgeCheck className="size-4 text-[var(--green)]" />Verified vendors</span></div>
        </div>
      </section>

      <section className="page-shell pt-7 md:pt-10">
        <div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Browse the market</p><h1 className="page-title mt-2 max-w-3xl">Good finds, from trusted shops across Ghana.</h1></div><Link href="/search" className="button-quiet hidden sm:flex">See everything <ArrowRight className="size-4" /></Link></div>
        <div className="mt-7"><CategoryRail /></div>
      </section>

      <section className="page-shell section-space">
        <div className="mb-6 flex items-end justify-between gap-4"><div><p className="eyebrow">Popular right now</p><h2 className="section-title mt-1">Picked for your basket</h2></div><Link href="/search" className="text-sm font-black text-[var(--green)] sm:hidden">See all</Link></div>
        {products.isLoading && <ProductGridSkeleton />}
        {products.isError && <QueryError retry={() => products.refetch()} />}
        {products.data && <ProductGrid products={products.data} />}
      </section>

      <section className="bg-[#f0d655]">
        <div className="page-shell grid min-h-80 items-stretch overflow-hidden md:grid-cols-[.9fr_1.1fr]">
          <div className="flex flex-col justify-center py-10 pr-6 md:py-16 md:pr-12"><p className="eyebrow !text-[var(--ink)]">Fresh this week</p><h2 className="mt-2 max-w-lg text-3xl font-black leading-tight sm:text-4xl">Market produce, packed the morning it leaves.</h2><p className="mt-4 max-w-lg text-sm leading-6">Seasonal boxes from Accra Fresh Co., selected for quality and delivered with fewer plastic bags.</p><Link href="/product/market-day-produce-box" className="button-primary mt-6 w-fit">Shop the produce box <ArrowRight className="size-4" /></Link></div>
          <div className="relative min-h-64 md:min-h-full"><Image src="/products/produce.jpg" alt="Colourful fresh vegetables arranged at a market" fill sizes="(max-width: 768px) 100vw, 55vw" className="object-cover" /></div>
        </div>
      </section>

      <section className="page-shell grid gap-4 py-10 sm:grid-cols-3">
        {[[Truck, "Delivery you can follow", "Clear updates from vendor to doorstep."], [BadgeCheck, "Shops checked by NISTER", "Know who you are buying from."], [ShieldCheck, "Pay with confidence", "Mobile money and card checkout secured."]].map(([Icon, title, detail]) => {
          const FeatureIcon = Icon as typeof Truck;
          return <div className="flex gap-3 border-t border-[var(--border)] pt-4" key={title as string}><FeatureIcon className="mt-0.5 size-5 shrink-0 text-[var(--green)]" /><div><h3 className="text-sm font-black">{title as string}</h3><p className="mt-1 text-sm leading-5 text-[var(--muted)]">{detail as string}</p></div></div>;
        })}
      </section>
    </>
  );
}
