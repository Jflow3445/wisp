"use client";

import { useId, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, X } from "lucide-react";
import { apiCommand } from "@/lib/api";

interface ActionDialogProps {
  endpoint: string;
  trigger: React.ReactNode;
  title: string;
  description: string;
  action: string;
  confirmLabel: string;
  requireReason?: boolean;
  requireEvidence?: boolean;
  tone?: "primary" | "danger";
}

export function ActionDialog({ endpoint, trigger, title, description, action, confirmLabel, requireReason = false, requireEvidence = false, tone = "primary" }: ActionDialogProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function close() { setOpen(false); setReason(""); setEvidence(""); setError(""); setSuccess(false); }
  async function submit() {
    if ((requireReason && !reason.trim()) || (requireEvidence && !evidence.trim())) { setError("Complete all required review fields before confirming."); return; }
    setBusy(true); setError("");
    try { await apiCommand(endpoint, { action, reason: reason || null, evidence: evidence ? { reference: evidence } : null, expectedVersion: 1 }); setSuccess(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The command could not be completed."); }
    finally { setBusy(false); }
  }

  return <><button type="button" className="contents" onClick={() => setOpen(true)}>{trigger}</button>{open ? <div className="fixed inset-0 z-50 grid place-items-center p-4"><button type="button" className="absolute inset-0 bg-slate-950/60" aria-label="Close dialog" onClick={close} /><section role="dialog" aria-modal="true" aria-labelledby={titleId} className="panel relative z-10 w-full max-w-lg p-5 shadow-2xl sm:p-6"><button type="button" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={close} aria-label="Close"><X className="h-4 w-4" /></button>{success ? <div className="py-5 text-center" role="status"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" /><h2 id={titleId} className="mt-3 text-lg font-bold">Command recorded</h2><p className="mt-2 text-sm text-slate-600">The transition and review context were written to the audit trail.</p><button type="button" className="btn-primary mt-5" onClick={close}>Done</button></div> : <><div className="flex items-start gap-3 pr-8"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${tone === "danger" ? "bg-red-50 text-red-700" : "bg-blue-50 text-navy"}`}><ShieldAlert className="h-4 w-4" /></span><div><h2 id={titleId} className="text-lg font-bold">{title}</h2><p className="mt-1.5 text-sm leading-6 text-slate-600">{description}</p></div></div><div className="mt-5 space-y-4">{requireReason ? <label><span className="field-label">Decision reason <span className="text-red-600">*</span></span><textarea className="field min-h-24 resize-y py-2" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Provide a specific policy or operational reason" /></label> : null}{requireEvidence ? <label><span className="field-label">Evidence reference <span className="text-red-600">*</span></span><input className="field" value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Provider trace, case, document, or ticket reference" /></label> : null}{error ? <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}</div><div className="mt-6 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={close}>Cancel</button><button type="button" className={tone === "danger" ? "btn-danger" : "btn-primary"} disabled={busy} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{confirmLabel}</button></div></>}</section></div> : null}</>;
}
