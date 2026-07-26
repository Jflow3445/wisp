import { Check, PackageCheck, Truck, XCircle } from "lucide-react";
import { ActionDialog } from "./action-dialog";
import type { Order } from "@/lib/types";

export function OrderActions({ order }: { order: Order }) {
  const endpoint = `/vendor/orders/${order.id}/actions`;
  if (order.status === "AWAITING_VENDOR_RESPONSE") {
    return (
      <>
        <ActionDialog endpoint={endpoint} action="REJECT" title={`Reject ${order.reference}?`} description="The stock reservation will be released and the customer payment will enter the refund workflow." confirmLabel="Reject order" requireReason tone="danger" trigger={<span className="btn-secondary text-red-700"><XCircle className="h-4 w-4" />Reject</span>} />
        <ActionDialog endpoint={endpoint} action="ACCEPT" title={`Accept ${order.reference}?`} description="Confirm that every line is in stock and can be prepared within the stated fulfilment window." confirmLabel="Accept order" trigger={<span className="btn-primary"><Check className="h-4 w-4" />Accept</span>} />
      </>
    );
  }
  if (order.status === "PREPARING") {
    return <ActionDialog endpoint={endpoint} action="MARK_READY" title={`Mark ${order.reference} ready?`} description="Only confirm when all items are packed, sealed, and available at the pickup point." confirmLabel="Mark ready" trigger={<span className="btn-primary"><PackageCheck className="h-4 w-4" />Mark ready</span>} />;
  }
  if (order.status === "READY_FOR_PICKUP") {
    return <ActionDialog endpoint={endpoint} action="HAND_OVER" title={`Hand over ${order.reference}?`} description="Verify the assigned driver and record the pickup evidence before releasing the package." confirmLabel="Confirm handover" requireEvidence trigger={<span className="btn-primary"><Truck className="h-4 w-4" />Hand over</span>} />;
  }
  return null;
}
