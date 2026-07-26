"use client";

import { useId, useState } from "react";
import { CheckCircle2, ListPlus, Loader2, X } from "lucide-react";
import { apiCommand } from "@/lib/api";
import type { Product } from "@/lib/types";

export function InventoryAdjustmentDialog({ product }: { product: Product }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");

  function close() {
    setOpen(false); setSuccess(false); setError(""); setQuantity(""); setReason(""); setEvidence("");
  }

  async function submit() {
    if (!/^-?\d+(\.\d{1,6})?$/.test(quantity) || quantity === "0" || !reason.trim() || !evidence.trim()) {
      setError("Enter a non-zero quantity, reason, and evidence reference.");
      return;
    }
    setBusy(true); setError("");
    try {
      await apiCommand(`/vendor/inventory/${product.id}/adjustments`, { quantity, reason, evidence: { reference: evidence } });
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Adjustment failed.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={() => setOpen(true)}><ListPlus className="h-3.5 w-3.5" />Adjust</button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button type="button" className="absolute inset-0 bg-slate-950/55" onClick={close} aria-label="Close dialog" />
          <section className="panel relative z-10 w-full max-w-lg p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button type="button" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100" onClick={close} aria-label="Close"><X className="h-4 w-4" /></button>
            {success ? <div className="py-5 text-center" role="status"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" /><h2 id={titleId} className="mt-3 text-lg font-bold">Adjustment recorded</h2><p className="mt-2 text-sm text-slate-600">The inventory movement is now the stock source of truth.</p><button type="button" className="btn-primary mt-5" onClick={close}>Done</button></div> : (
              <>
                <h2 id={titleId} className="pr-8 text-lg font-bold">Adjust inventory</h2>
                <p className="mt-1 text-sm text-slate-500">{product.name} - {product.sku}</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label><span className="field-label">Quantity change *</span><input className="field" inputMode="decimal" placeholder="e.g. -2 or 12" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
                  <label><span className="field-label">Reason *</span><select className="field" value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Select reason</option><option value="CYCLE_COUNT">Cycle count</option><option value="DAMAGED">Damaged stock</option><option value="RESTOCK">Supplier restock</option><option value="RETURN">Customer return</option></select></label>
                  <label className="sm:col-span-2"><span className="field-label">Evidence reference *</span><input className="field" placeholder="Count sheet, delivery note, or incident reference" value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label>
                </div>
                {error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">{error}</p> : null}
                <div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={close}>Cancel</button><button type="button" className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Post adjustment</button></div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
