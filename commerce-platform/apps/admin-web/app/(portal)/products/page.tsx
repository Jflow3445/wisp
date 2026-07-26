import type { Metadata } from "next";
import { Flag } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { ProductReview } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { ProductActions } from "@/components/product-actions";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Product moderation" };

const columns: Column<ProductReview>[] = [
  { key: "product", label: "Product", render: (product) => <div><p className="font-bold">{product.name}</p><p className="mt-0.5 text-xs text-slate-500">{product.reference} - {product.vendor}</p></div> },
  { key: "category", label: "Category", render: (product) => <span className="text-slate-600">{product.category}</span> },
  { key: "price", label: "Price", render: (product) => <span className="font-semibold tabular-nums">{formatMoney(product.priceMinor)}</span> },
  { key: "submitted", label: "Submitted", render: (product) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(product.submittedAt)}</span> },
  { key: "flags", label: "Flags", render: (product) => <span className={`inline-flex items-center gap-1 font-semibold ${product.flags ? "text-red-700" : "text-slate-400"}`}><Flag className="h-3.5 w-3.5" />{product.flags}</span> },
  { key: "status", label: "Status", render: (product) => <StatusBadge status={product.status} /> },
  { key: "action", label: "Action", align: "right", render: (product) => <ProductActions product={product} /> },
];

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; status?: string }> }) {
  const query = await searchParams; const state = resolvePageState(query.state); const products = await apiGet<ProductReview[]>("/admin/products"); const needle = query.q?.toLowerCase().trim() ?? ""; const filtered = products.filter((product) => (!needle || `${product.name} ${product.reference} ${product.vendor}`.toLowerCase().includes(needle)) && (!query.status || product.status === query.status)); const displayed = state === "empty" ? [] : filtered;
  return <><PageHeader title="Product moderation" description="Catalogue policy, evidence, and listing controls" /><div className="mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6 lg:p-8">{state === "error" || state === "permission" ? <PageState state={state} resetHref="/products" /> : <><div className="panel overflow-hidden"><FilterBar placeholder="Search product, vendor, or reference" defaultQuery={query.q}><select className="field w-auto min-w-44" name="status" defaultValue={query.status ?? ""} aria-label="Product status"><option value="">All statuses</option><option value="SUBMITTED">Submitted</option><option value="UNDER_REVIEW">Under review</option><option value="CHANGES_REQUESTED">Changes requested</option><option value="APPROVED">Approved</option><option value="SUSPENDED">Suspended</option></select></FilterBar></div>{displayed.length ? <DataTable caption="Product moderation queue" rows={displayed} columns={columns} getRowKey={(product) => product.id} /> : <PageState state="empty" resetHref="/products" />}<p className="text-xs text-slate-500">{products.filter((product) => product.flags > 0).length} listings carry active moderation flags</p></>}</div></>;
}
