import type { Metadata } from "next";
import { Building2, CalendarClock, Download, ShieldCheck } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { FinanceEntry } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Finance" };

const columns: Column<FinanceEntry>[] = [
  { key: "reference", label: "Reference", render: (entry) => <span className="font-semibold">{entry.reference}</span> },
  { key: "type", label: "Type", render: (entry) => <span className="text-slate-600">{entry.type.toLowerCase().replaceAll("_", " ")}</span> },
  { key: "date", label: "Posted at", render: (entry) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(entry.occurredAt)}</span> },
  { key: "status", label: "Status", render: (entry) => <StatusBadge status={entry.status} /> },
  { key: "amount", label: "Amount", align: "right", render: (entry) => <span className={`font-bold tabular-nums ${entry.amountMinor.startsWith("-") ? "text-red-700" : "text-emerald-700"}`}>{formatMoney(entry.amountMinor)}</span> },
];

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const query = await searchParams;
  const state = resolvePageState(query.state);
  const entries = await apiGet<FinanceEntry[]>("/vendor/finance");
  return (
    <>
      <PageHeader title="Finance" description="Settlements, fees, refunds, and payout history" actions={<button type="button" className="btn-secondary"><Download className="h-4 w-4" />Export CSV</button>} />
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6 lg:p-8">
        {state !== "ready" ? <PageState state={state} resetHref="/finance" /> : <>
          <section className="grid gap-3 sm:grid-cols-3"><MetricCard label="Available to settle" value="GHS 8,642.30" change="52 completed orders" tone="good" /><MetricCard label="Pending clearance" value="GHS 1,126.40" change="7 active orders" tone="warning" /><MetricCard label="Fees this month" value="GHS 946.18" change="10.0% effective rate" tone="neutral" /></section>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
            <div className="min-w-0"><div className="mb-3"><h2 className="text-base font-bold">Recent activity</h2><p className="mt-0.5 text-xs text-slate-500">Posted ledger-derived movements and pending order proceeds</p></div><DataTable caption="Finance activity" rows={entries} columns={columns} getRowKey={(entry) => entry.id} /></div>
            <div className="space-y-4">
              <div className="panel p-5"><span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-50 text-emerald-700"><CalendarClock className="h-4 w-4" /></span><h2 className="mt-4 text-sm font-bold">Next payout</h2><p className="mt-1 text-2xl font-bold">GHS 8,642.30</p><p className="mt-2 text-xs text-slate-500">Scheduled for Thursday, 23 July</p><div className="mt-4 flex gap-2 border-t border-line pt-4 text-xs text-slate-600"><Building2 className="h-4 w-4 shrink-0" /><span>Fidelity Bank<br />Account ending 9041</span></div></div>
              <div className="panel flex gap-3 p-4 text-xs leading-5 text-slate-600"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest" /><span>Posted entries are immutable. Corrections are recorded as linked reversals.</span></div>
            </div>
          </section>
        </>}
      </div>
    </>
  );
}
