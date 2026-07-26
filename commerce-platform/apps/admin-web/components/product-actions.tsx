import { Check, FileWarning, Play, ShieldBan } from "lucide-react";
import type { ProductReview } from "@/lib/types";
import { ActionDialog } from "./action-dialog";

export function ProductActions({ product }: { product: ProductReview }) {
  const endpoint = `/admin/products/${product.id}/actions`;
  if (product.status === "SUBMITTED") return <ActionDialog endpoint={endpoint} action="BEGIN_REVIEW" title={`Review ${product.name}?`} description="Lock the submitted catalogue version and assign the moderation review to your queue." confirmLabel="Begin review" trigger={<span className="btn-secondary h-8 px-2.5 text-xs"><Play className="h-3.5 w-3.5" />Review</span>} />;
  if (product.status === "UNDER_REVIEW") return <div className="flex justify-end gap-1.5"><ActionDialog endpoint={endpoint} action="REQUEST_CHANGES" title={`Request changes to ${product.name}?`} description="The listing will remain unavailable until the vendor addresses the specified policy issue and resubmits." confirmLabel="Request changes" requireReason requireEvidence trigger={<span className="inline-grid h-8 w-8 place-items-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50" title="Request changes"><FileWarning className="h-4 w-4" /></span>} /><ActionDialog endpoint={endpoint} action="APPROVE" title={`Approve ${product.name}?`} description="Confirm the listing, category, price presentation, media, and required evidence meet marketplace policy." confirmLabel="Approve product" requireEvidence trigger={<span className="inline-grid h-8 w-8 place-items-center rounded-md bg-navy text-white hover:bg-blue-950" title="Approve product"><Check className="h-4 w-4" /></span>} /></div>;
  if (product.status === "APPROVED") return <ActionDialog endpoint={endpoint} action="SUSPEND" title={`Suspend ${product.name}?`} description="The offer will become unavailable immediately while the incident is investigated." confirmLabel="Suspend listing" requireReason requireEvidence tone="danger" trigger={<span className="btn-secondary h-8 px-2.5 text-xs text-red-700"><ShieldBan className="h-3.5 w-3.5" />Suspend</span>} />;
  return <span className="text-xs text-slate-400">No action</span>;
}
