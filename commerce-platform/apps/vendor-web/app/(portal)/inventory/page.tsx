import type { Metadata } from "next";
import { AlertTriangle, Boxes, PackageCheck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Product } from "@/lib/types";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { InventoryAdjustmentDialog } from "@/components/inventory-adjustment-dialog";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";

export const metadata: Metadata = { title: "Inventory" };

const columns: Column<Product>[] = [
  { key: "product", label: "Product", render: (product) => <div><p className="font-semibold">{product.name}</p><p className="mt-0.5 text-xs text-slate-500">{product.sku}</p></div> },
  { key: "stock", label: "Available", render: (product) => <div className="flex items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-md ${Number(product.stock) <= Number(product.reorderAt) ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{Number(product.stock) <= Number(product.reorderAt) ? <AlertTriangle className="h-3.5 w-3.5" /> : <PackageCheck className="h-3.5 w-3.5" />}</span><span className="font-bold tabular-nums">{product.stock}</span></div> },
  { key: "reserved", label: "Reserved", render: () => <span className="text-slate-600">2</span> },
  { key: "reorder", label: "Reorder at", render: (product) => <span className="text-slate-600">{product.reorderAt}</span> },
  { key: "location", label: "Location", render: () => <span className="text-slate-600">East Legon</span> },
  { key: "action", label: "Action", align: "right", render: (product) => <InventoryAdjustmentDialog product={product} /> },
];

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string; stock?: string }> }) {
  const query = await searchParams;
  const state = resolvePageState(query.state);
  const products = await apiGet<Product[]>("/vendor/products");
  const needle = query.q?.toLowerCase().trim() ?? "";
  const filtered = products.filter((product) => {
    const low = Number(product.stock) <= Number(product.reorderAt);
    return (!needle || `${product.name} ${product.sku}`.toLowerCase().includes(needle)) && (!query.stock || (query.stock === "low" ? low : Number(product.stock) === 0));
  });
  const displayed = state === "empty" ? [] : filtered;
  return (
    <>
      <PageHeader title="Inventory" description="Authoritative stock positions and controlled adjustments" />
      <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6 lg:p-8">
        {state === "error" || state === "permission" ? <PageState state={state} resetHref="/inventory" /> : <>
          <section className="grid gap-3 sm:grid-cols-3"><MetricCard label="Tracked SKUs" value="6" change="East Legon location" tone="neutral" /><MetricCard label="Low stock" value="3" change="Action recommended" tone="warning" /><MetricCard label="Stock accuracy" value="98.6%" change="Last 30 days" tone="good" /></section>
          <div className="panel overflow-hidden"><FilterBar placeholder="Search product or SKU" defaultQuery={query.q}><select className="field w-auto min-w-36" name="stock" defaultValue={query.stock ?? ""} aria-label="Stock state"><option value="">All stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></FilterBar></div>
          {displayed.length ? <DataTable caption="Inventory positions" rows={displayed} columns={columns} getRowKey={(product) => product.id} /> : <PageState state="empty" resetHref="/inventory" />}
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><Boxes className="h-3.5 w-3.5" />Stock is derived from posted inventory movements; adjustments do not overwrite balances directly.</p>
        </>}
      </div>
    </>
  );
}
