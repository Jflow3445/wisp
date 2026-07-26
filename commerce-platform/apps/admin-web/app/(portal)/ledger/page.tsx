import type { Metadata } from "next";
import { BookLock, Download, Scale } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { LedgerEntry } from "@/lib/types";
import { formatDateTime, formatMoney } from "@/lib/format";
import { resolvePageState } from "@/lib/page-state";
import { DataTable, type Column } from "@/components/data-table";
import { FilterBar } from "@/components/filter-bar";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";

export const metadata: Metadata = { title: "Ledger" };

const columns: Column<LedgerEntry>[] = [
  { key: "transaction", label: "Transaction", render: (entry) => <div><p className="font-bold">{entry.transactionReference}</p><p className="mt-0.5 text-xs text-slate-500">Source {entry.source}</p></div> },
  { key: "account", label: "Account", render: (entry) => <span className="text-slate-700">{entry.account}</span> },
  { key: "posted", label: "Posted", render: (entry) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(entry.postedAt)}</span> },
  { key: "debit", label: "Debit", align: "right", render: (entry) => <span className="font-semibold tabular-nums">{entry.side === "DEBIT" ? formatMoney(entry.amountMinor) : "-"}</span> },
  { key: "credit", label: "Credit", align: "right", render: (entry) => <span className="font-semibold tabular-nums">{entry.side === "CREDIT" ? formatMoney(entry.amountMinor) : "-"}</span> },
];

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ state?: string; q?: string }> }) {
  const query = await searchParams; const state = resolvePageState(query.state); const entries = await apiGet<LedgerEntry[]>("/admin/ledger"); const needle = query.q?.toLowerCase().trim() ?? ""; const filtered = entries.filter((entry) => !needle || `${entry.transactionReference} ${entry.account} ${entry.source}`.toLowerCase().includes(needle)); const displayed = state === "empty" ? [] : filtered; const csv = ["transaction,account,side,amount_minor,source,posted_at", ...entries.map((entry) => [entry.transactionReference, `"${entry.account}"`, entry.side, entry.amountMinor, entry.source, entry.postedAt].join(","))].join("\n");
  return <><PageHeader title="Ledger" description="Immutable posted double-entry marketplace transactions" actions={<a className="btn-secondary" download="nister-ledger-demo.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}><Download className="h-4 w-4" />Export CSV</a>} /><div className="mx-auto max-w-[1680px] space-y-4 p-4 sm:p-6 lg:p-8">{state === "error" || state === "permission" ? <PageState state={state} resetHref="/ledger" /> : <><section className="grid gap-3 sm:grid-cols-3"><MetricCard label="Provider clearing" value="GHS 184,221.90" change="Across active providers" tone="neutral" /><MetricCard label="Vendor payables" value="GHS 142,806.32" change="Eligible and held balances" tone="neutral" /><MetricCard label="Trial balance" value="GHS 0.00" change="Balanced as of 12:45" tone="good" /></section><div className="panel flex gap-3 border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><BookLock className="mt-0.5 h-4 w-4 shrink-0" /><span>Posted entries cannot be edited. Corrections must be balanced reversal transactions linked to the original posting.</span></div><div className="panel overflow-hidden"><FilterBar placeholder="Search transaction, account, or source" defaultQuery={query.q} /></div>{displayed.length ? <DataTable caption="General ledger entries" rows={displayed} columns={columns} getRowKey={(entry) => entry.id} /> : <PageState state="empty" resetHref="/ledger" />}<p className="flex items-center gap-1.5 text-xs text-slate-500"><Scale className="h-3.5 w-3.5" />Displayed debits and credits balance by transaction reference.</p></>}</div></>;
}
