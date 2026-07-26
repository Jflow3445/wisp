"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, BadgeDollarSign, BookOpenCheck, Boxes, ChevronDown, FileClock, LayoutDashboard, LogOut, Menu, RefreshCw, Search, ShieldCheck, ShoppingBag, Users, Webhook, X } from "lucide-react";

const groups = [
  { label: "Operations", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/vendors", label: "Vendor moderation", icon: Users, count: 3 },
    { href: "/products", label: "Product moderation", icon: Boxes, count: 4 },
    { href: "/orders", label: "Orders", icon: ShoppingBag },
  ] },
  { label: "Finance & control", items: [
    { href: "/payments", label: "Payments", icon: BadgeDollarSign, count: 1 },
    { href: "/payments/webhooks", label: "Webhooks", icon: Webhook },
    { href: "/ledger", label: "Ledger", icon: BookOpenCheck },
    { href: "/reconciliation", label: "Reconciliation", icon: RefreshCw, count: 3 },
    { href: "/audit", label: "Audit trail", icon: FileClock },
  ] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navigation = <><div className="flex h-16 items-center gap-3 border-b border-white/10 px-5"><span className="grid h-8 w-8 place-items-center rounded-md bg-sky-300 text-blue-950"><ShieldCheck className="h-4 w-4" /></span><div><div className="text-sm font-extrabold text-white">NISTER</div><div className="text-[11px] text-slate-400">Marketplace control</div></div></div><div className="space-y-5 px-3 py-4">{groups.map((group) => <div key={group.label}><div className="mb-2 px-2 text-[10px] font-bold uppercase text-slate-500">{group.label}</div><nav className="space-y-1" aria-label={group.label}>{group.items.map((item) => { const active = pathname === item.href || (item.href !== "/payments" && pathname.startsWith(`${item.href}/`)); const Icon = item.icon; return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={`flex h-9 items-center gap-3 rounded-md px-3 text-xs font-medium transition ${active ? "bg-white text-ink" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{item.label}</span>{item.count ? <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold ${active ? "bg-amber-100 text-amber-800" : "bg-white/10"}`}>{item.count}</span> : null}</Link>; })}</nav></div>)}</div><div className="mt-auto border-t border-white/10 p-3"><button type="button" className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-white/10"><span className="grid h-8 w-8 place-items-center rounded-full bg-sky-200 text-xs font-bold text-blue-950">AN</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white">Ama Nortey</span><span className="block truncate text-[11px] text-slate-400">Finance administrator</span></span><ChevronDown className="h-4 w-4 text-slate-400" /></button><Link href="/login" className="mt-1 flex h-9 items-center gap-3 rounded-md px-3 text-xs text-slate-400 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" />Sign out</Link></div></>;
  return <div className="min-h-screen bg-paper lg:pl-64"><aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#18201e] lg:flex">{navigation}</aside>{open ? <div className="fixed inset-0 z-40 lg:hidden"><button type="button" className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} aria-label="Close navigation" /><aside className="relative flex h-full w-[min(19rem,86vw)] flex-col overflow-y-auto bg-[#18201e]">{navigation}<button type="button" className="absolute right-3 top-4 grid h-8 w-8 place-items-center text-slate-300" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button></aside></div> : null}<header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6"><button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-line lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button><label className="relative hidden max-w-sm flex-1 sm:block"><span className="sr-only">Global search</span><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="field h-9 bg-slate-50 pl-9" placeholder="Search order, vendor, payment..." /></label><div className="ml-auto flex items-center gap-3"><span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-800 sm:inline-flex"><Activity className="h-3 w-3" />Production healthy</span><span className="grid h-8 w-8 place-items-center rounded-full bg-sky-200 text-xs font-bold text-blue-950">AN</span></div></header><main className="min-w-0">{children}</main></div>;
}
