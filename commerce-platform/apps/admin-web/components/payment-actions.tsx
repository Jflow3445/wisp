import { CheckCircle2, SearchCheck, XCircle } from "lucide-react";
import type { Payment } from "@/lib/types";
import { ActionDialog } from "./action-dialog";

export function PaymentActions({ payment }: { payment: Payment }) {
  const endpoint = `/admin/payments/${payment.id}/actions`;
  if (payment.status === "UNDER_REVIEW") return <div className="flex justify-end gap-1.5"><ActionDialog endpoint={endpoint} action="FAIL" title={`Decline ${payment.reference}?`} description="Close the payment attempt only when provider verification confirms a failed, reversed, expired, or abandoned outcome." confirmLabel="Decline payment" requireReason requireEvidence tone="danger" trigger={<span className="inline-grid h-8 w-8 place-items-center rounded-md border border-red-200 text-red-700 hover:bg-red-50" title="Decline payment"><XCircle className="h-4 w-4" /></span>} /><ActionDialog endpoint={endpoint} action="CONFIRM_SUCCESS" title={`Confirm ${payment.reference}?`} description="Success may only be recorded from verified provider evidence. This will create the corresponding financial transaction." confirmLabel="Confirm verified success" requireEvidence trigger={<span className="inline-grid h-8 w-8 place-items-center rounded-md bg-navy text-white hover:bg-blue-950" title="Confirm verified payment"><CheckCircle2 className="h-4 w-4" /></span>} /></div>;
  if (payment.status === "PENDING" || payment.status === "FAILED") return <ActionDialog endpoint={endpoint} action="RECONCILE" title={`Reconcile ${payment.reference}?`} description="Fetch the provider status and compare the verified outcome against the internal payment state." confirmLabel="Start reconciliation" requireReason trigger={<span className="btn-secondary h-8 px-2.5 text-xs"><SearchCheck className="h-3.5 w-3.5" />Reconcile</span>} />;
  return <span className="text-xs text-slate-400">No action</span>;
}
