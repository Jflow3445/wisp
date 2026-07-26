import { Suspense } from "react";
import { VendorPage } from "@/components/vendor-page";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Suspense><VendorPage slug={slug} /></Suspense>;
}
