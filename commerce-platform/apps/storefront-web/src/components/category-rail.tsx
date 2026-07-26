"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function CategoryRail() {
  const { data, isLoading } = useQuery({ queryKey: queryKeys.categories, queryFn: api.getCategories });
  if (isLoading) return <div className="flex gap-3 overflow-hidden" role="status">{Array.from({ length: 5 }, (_, index) => <div className="skeleton h-24 min-w-44" key={index} />)}<span className="sr-only">Loading categories</span></div>;
  if (!data) return null;

  return (
    <div className="-mx-2 flex snap-x gap-3 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {data.map((category) => (
        <Link href={`/category/${category.slug}`} key={category.id} className="group relative h-28 min-w-[11rem] snap-start overflow-hidden sm:h-32 sm:min-w-[13rem]" style={{ backgroundColor: category.accent }}>
          <Image src={category.image} alt="" fill sizes="208px" className="object-cover opacity-65 transition group-hover:scale-[1.03] group-hover:opacity-75" />
          <span className="absolute inset-x-0 bottom-0 bg-white/90 px-3 py-2 text-sm font-black backdrop-blur-sm">{category.name}</span>
        </Link>
      ))}
    </div>
  );
}
