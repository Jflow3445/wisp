import { humanizeStatus } from "@/lib/format";

const tones: Record<string, string> = {
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800", SUCCESSFUL: "border-emerald-200 bg-emerald-50 text-emerald-800", PROCESSED: "border-emerald-200 bg-emerald-50 text-emerald-800", COMPLETED: "border-emerald-200 bg-emerald-50 text-emerald-800", RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-800", SUCCESS: "border-emerald-200 bg-emerald-50 text-emerald-800", ON_TRACK: "border-emerald-200 bg-emerald-50 text-emerald-800",
  UNDER_REVIEW: "border-blue-200 bg-blue-50 text-blue-800", INVESTIGATING: "border-blue-200 bg-blue-50 text-blue-800", PROCESSING: "border-blue-200 bg-blue-50 text-blue-800", CONFIRMED: "border-blue-200 bg-blue-50 text-blue-800", PARTIALLY_FULFILLED: "border-cyan-200 bg-cyan-50 text-cyan-800",
  SUBMITTED: "border-violet-200 bg-violet-50 text-violet-800", DUPLICATE: "border-slate-200 bg-slate-100 text-slate-700", PENDING: "border-amber-200 bg-amber-50 text-amber-900", OPEN: "border-amber-200 bg-amber-50 text-amber-900", PAYMENT_REVIEW: "border-amber-200 bg-amber-50 text-amber-900", AT_RISK: "border-amber-200 bg-amber-50 text-amber-900", MORE_INFORMATION_REQUIRED: "border-orange-200 bg-orange-50 text-orange-900", CHANGES_REQUESTED: "border-orange-200 bg-orange-50 text-orange-900",
  SUSPENDED: "border-red-200 bg-red-50 text-red-800", FAILED: "border-red-200 bg-red-50 text-red-800", DENIED: "border-red-200 bg-red-50 text-red-800", BREACHED: "border-red-200 bg-red-50 text-red-800", REVERSED: "border-red-200 bg-red-50 text-red-800", CANCELLED: "border-slate-200 bg-slate-100 text-slate-700", REFUNDED: "border-slate-200 bg-slate-100 text-slate-700",
  LOW: "border-emerald-200 bg-emerald-50 text-emerald-800", MEDIUM: "border-amber-200 bg-amber-50 text-amber-900", HIGH: "border-red-200 bg-red-50 text-red-800",
};

export function StatusBadge({ status }: { status: string }) { return <span className={`inline-flex min-h-6 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${tones[status] ?? "border-slate-200 bg-slate-50 text-slate-700"}`}>{humanizeStatus(status)}</span>; }
