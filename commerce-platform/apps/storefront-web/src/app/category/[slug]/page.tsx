import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CatalogView } from "@/components/catalog-view";
import { categories } from "@/lib/demo-data";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  return <Suspense><CatalogView title={category.name} description={category.description} filters={{ category: slug }} /></Suspense>;
}
