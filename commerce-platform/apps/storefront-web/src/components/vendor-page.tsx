"use client";

import { BadgeCheck, Clock3, MapPin, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { CatalogView } from "./catalog-view";
import { QueryError } from "./query-states";

export function VendorPage({ slug }: { slug: string }) {
  const vendor = useQuery({ queryKey: queryKeys.vendor(slug), queryFn: () => api.getVendor(slug) });
  if (vendor.isLoading) return <div className="page-shell py-10"><div className="skeleton h-40 w-full" /></div>;
  if (vendor.isError || !vendor.data) return <div className="page-shell py-10"><QueryError retry={() => vendor.refetch()} message="We could not load this shop." /></div>;

  return (
    <>
      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="page-shell py-9 md:py-12">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div><p className="eyebrow">Verified seller</p><div className="mt-2 flex items-center gap-2"><h1 className="page-title">{vendor.data.name}</h1>{vendor.data.verified && <BadgeCheck className="size-6 fill-[var(--green)] text-white" aria-label="Verified vendor" />}</div><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">{vendor.data.description}</p></div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[var(--muted)]"><span className="flex items-center gap-1.5"><Star className="size-4 fill-[var(--yellow)] text-[var(--yellow)]" />{vendor.data.rating} ({vendor.data.reviewCount})</span><span className="flex items-center gap-1.5"><MapPin className="size-4" />{vendor.data.location}</span><span className="flex items-center gap-1.5"><Clock3 className="size-4" />{vendor.data.fulfilment}</span></div>
          </div>
        </div>
      </section>
      <CatalogView title={`Shop ${vendor.data.name}`} filters={{ vendor: slug }} />
    </>
  );
}
