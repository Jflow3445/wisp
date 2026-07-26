import { CheckCheck, UserRoundPlus } from "lucide-react";
import type { ReconciliationCase } from "@/lib/types";
import { ActionDialog } from "./action-dialog";

export function ReconciliationActions({ item }: { item: ReconciliationCase }) {
  const endpoint = `/admin/reconciliation/${item.id}/actions`;
  if (item.status === "OPEN") return <ActionDialog endpoint={endpoint} action="ASSIGN" title={`Assign ${item.reference}?`} description="Take ownership of the case and begin provider and internal ledger comparison." confirmLabel="Assign to me" requireReason trigger={<span className="btn-secondary h-8 px-2.5 text-xs"><UserRoundPlus className="h-3.5 w-3.5" />Assign</span>} />;
  if (item.status === "INVESTIGATING") return <ActionDialog endpoint={endpoint} action="RESOLVE" title={`Resolve ${item.reference}?`} description="Record the verified provider evidence and correction transaction reference. Posted entries will not be edited." confirmLabel="Resolve case" requireReason requireEvidence trigger={<span className="btn-primary h-8 px-2.5 text-xs"><CheckCheck className="h-3.5 w-3.5" />Resolve</span>} />;
  return <span className="text-xs font-semibold text-emerald-700">Closed</span>;
}
