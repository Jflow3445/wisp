"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CatalogView } from "@/components/catalog-view";

function SearchResults() {
  const params = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  return <CatalogView title={query ? `Results for “${query}”` : "Explore the market"} description={query ? "Products and shops matching your search." : "Browse every product from verified shops on NISTER Market."} query={query || undefined} />;
}

export default function SearchPage() {
  return <Suspense fallback={<div className="page-shell py-12"><div className="skeleton h-12 w-2/3" /></div>}><SearchResults /></Suspense>;
}
