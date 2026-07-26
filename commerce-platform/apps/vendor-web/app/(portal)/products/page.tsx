import type { Metadata } from "next";
import { FilePlus2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Product } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { StatusBadge } from "@/components/status-badge";
import { ActionDialog } from "@/components/action-dialog";

export const metadata: Metadata = { title: "Products" };

const columns: Column<Product>[] = [
  { key: "product", label: "Product", render: (product) => <div><p className="font-semibold">{product.name}</p><p className="mt-0.5 text-xs text-slate-500">{product.sku}</p></div> },
  { key: "category", label: "Category", render: (product) => <span className="text-slate-600">{product.category}</span> },
  { key: "status", label: "Moderation", render: (product) => <StatusBadge status={product.status} /> },
  { key: "stock", label: "Available", render: (product) => <span className={Number(product.stock) <= Number(product.reorderAt) ? "font-bold text-amber-700" : "font-semibold"}>{product.stock}</span> },
  { key: "price", label: "Price", align: "right", render: (product) => <span className="font-semibold tabular-nums">{formatMoney(product.priceMinor)}</span> },
  { key: "updated", label: "Updated", align: "right", render: (product) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDateTime(product.updatedAt)}</span> },
];

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; status?: string }> }) {
  const query = await searchParams;
  const state = resolvePageState(query.state);
  const products = await apiGet<Product[]>("/vendor/products");
  const needle = query.q?.toLowerCase().trim() ?? "";
  const filtered = products.filter((product) => (!needle || `${product.name} ${product.sku}`.toLowerCase().includes(needle)) && (!query.status || product.status === query.status));
  const displayed = state === "empty" ? [] : filtered;
  return (
    <>
      <PageHeader title="Products" description="Catalogue listings and moderation status" actions={<ActionDialog endpoint="/vendor/products" action="CREATE_DRAFT" title="Create product draft?" description="A new private draft will be created. Complete required product data before submitting it for moderation." confirmLabel="Create draft" trigger={<span className="btn-primary"><FilePlus2 className="h-4 w-4" />New product</span>} />} />
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6 lg:p-8">
        {state === "error" || state === "permission" ? <PageState state={state} resetHref="/products" /> : <>
          <div className="panel overflow-hidden"><FilterBar placeholder="Search name or SKU" defaultQuery={query.q}><select className="field w-auto min-w-40" name="status" defaultValue={query.status ?? ""} aria-label="Moderation status"><option value="">All statuses</option><option value="APPROVED">Approved</option><option value="SUBMITTED">Submitted</option><option value="CHANGES_REQUESTED">Changes requested</option><option value="DRAFT">Draft</option></select></FilterBar></div>
          {displayed.length ? <DataTable caption="Vendor products" rows={displayed} columns={columns} getRowKey={(product) => product.id} /> : <PageState state="empty" resetHref="/products" />}
          <p className="text-xs text-slate-500">{products.filter((product) => product.status === "APPROVED").length} approved products - {products.filter((product) => product.status === "SUBMITTED").length} awaiting review</p>
        </>}
      </div>
    </>
  );
}
