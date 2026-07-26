import { humanizeStatus } from "@/lib/format";

const tones: Record<string, string> = {
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  COMPLETE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  POSTED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  READY_FOR_PICKUP: "border-cyan-200 bg-cyan-50 text-cyan-800",
  OUT_FOR_DELIVERY: "border-blue-200 bg-blue-50 text-blue-800",
  ACCEPTED: "border-blue-200 bg-blue-50 text-blue-800",
  PREPARING: "border-violet-200 bg-violet-50 text-violet-800",
  SUBMITTED: "border-blue-200 bg-blue-50 text-blue-800",
  IN_REVIEW: "border-blue-200 bg-blue-50 text-blue-800",
  AWAITING_VENDOR_RESPONSE: "border-amber-200 bg-amber-50 text-amber-900",
  PENDING: "border-amber-200 bg-amber-50 text-amber-900",
  REQUIRED: "border-amber-200 bg-amber-50 text-amber-900",
  CHANGES_REQUESTED: "border-orange-200 bg-orange-50 text-orange-900",
  CANCELLED: "border-slate-200 bg-slate-100 text-slate-700",
  SUSPENDED: "border-red-200 bg-red-50 text-red-800",
  DRAFT: "border-slate-200 bg-slate-50 text-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${tones[status] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>{humanizeStatus(status)}</span>;
}
