import type { Order } from "@/lib/types";

const labels: Record<Order["status"], string> = {
  PAYMENT_PENDING: "Payment pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Being prepared",
  OUT_FOR_DELIVERY: "Out for delivery",
  COMPLETED: "Delivered",
};

export function OrderStatus({ status }: { status: Order["status"] }) {
  const active = status !== "COMPLETED";
  return <span className={`inline-flex px-2.5 py-1 text-xs font-black ${active ? "bg-[#e6f4ee] text-[var(--green)]" : "bg-[var(--surface-strong)] text-[var(--muted)]"}`}>{labels[status]}</span>;
}
