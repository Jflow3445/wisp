"use client";

import { ArrowRight, MapPin } from "lucide-react";
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
        </div>
      </section>

      <section className="page-shell pt-7 md:pt-10">
        <div className="flex items-end justify-between gap-4"><div><h1 className="page-title mt-2 max-w-3xl">Shop</h1></div><Link href="/search" className="button-quiet hidden sm:flex">See everything <ArrowRight className="size-4" /></Link></div>
        <div className="mt-7"><CategoryRail /></div>
      </section>

      <section className="page-shell section-space">
        <div className="mb-6 flex items-end justify-between gap-4"><div><h2 className="section-title mt-1">Products</h2></div><Link href="/search" className="text-sm font-black text-[var(--green)] sm:hidden">See all</Link></div>
        {products.isLoading && <ProductGridSkeleton />}
        {products.isError && <QueryError retry={() => products.refetch()} />}
        {products.data && <ProductGrid products={products.data} />}
      </section>

      <section className="bg-[#f0d655]">
        <div className="page-shell grid min-h-80 items-stretch overflow-hidden md:grid-cols-[.9fr_1.1fr]">
          <div className="flex flex-col justify-center py-10 pr-6 md:py-16 md:pr-12"><h2 className="mt-2 max-w-lg text-3xl font-black leading-tight sm:text-4xl">Fresh produce</h2><p className="mt-4 max-w-lg text-sm leading-6">Produce boxes from Accra Fresh Co.</p><Link href="/product/market-day-produce-box" className="button-primary mt-6 w-fit">Shop the produce box <ArrowRight className="size-4" /></Link></div>
          <div className="relative min-h-64 md:min-h-full"><Image src="/products/produce.jpg" alt="Colourful fresh vegetables arranged at a market" fill sizes="(max-width: 768px) 100vw, 55vw" className="object-cover" /></div>
        </div>
      </section>


    </>
  );
}
