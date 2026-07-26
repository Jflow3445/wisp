"use client";

import { SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { CatalogFilters } from "@/lib/types";
import { EmptyState, ProductGridSkeleton, QueryError } from "./query-states";
import { ProductGrid } from "./product-grid";

interface CatalogViewProps {
  title: string;
  description?: string;
  filters?: Pick<CatalogFilters, "category" | "vendor">;
  query?: string;
}

export function CatalogView({ title, description, filters = {}, query }: CatalogViewProps) {
  const router = useRouter();
  const params = useSearchParams();
  const sort = (params.get("sort") ?? "featured") as CatalogFilters["sort"];
  const catalogFilters = { ...filters, query, sort };
  const result = useQuery({ queryKey: queryKeys.products(catalogFilters), queryFn: () => api.getProducts(catalogFilters) });

  const changeSort = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "featured") next.delete("sort"); else next.set("sort", value);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="page-shell py-8 md:py-12">
      <div className="flex flex-col gap-5 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="eyebrow">Shop Ghana</p><h1 className="page-title mt-2">{title}</h1>{description && <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">{description}</p>}</div>
        <label className="flex items-center gap-2 text-sm font-bold"><SlidersHorizontal className="size-4" /><span className="sr-only sm:not-sr-only">Sort</span><select value={sort} onChange={(event) => changeSort(event.target.value)} className="field-select min-w-44" aria-label="Sort products"><option value="featured">Featured</option><option value="rating">Top rated</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label>
      </div>
      <div className="pt-8">
        {result.isLoading && <ProductGridSkeleton />}
        {result.isError && <QueryError retry={() => result.refetch()} />}
        {result.data && result.data.length === 0 && <EmptyState title={query ? `No results for “${query}”` : "No products here yet"} />}
        {result.data && result.data.length > 0 && <><p className="mb-5 text-sm text-[var(--muted)]">{result.data.length} {result.data.length === 1 ? "product" : "products"}</p><ProductGrid products={result.data} /></>}
      </div>
    </div>
  );
}
