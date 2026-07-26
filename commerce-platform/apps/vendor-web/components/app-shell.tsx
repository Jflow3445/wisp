"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingBag, count: 2 },
  { href: "/products", label: "Products", icon: PackageSearch },
  { href: "/inventory", label: "Inventory", icon: Boxes, count: 3 },
  { href: "/finance", label: "Finance", icon: CircleDollarSign },
  { href: "/onboarding", label: "Onboarding", icon: ClipboardCheck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navigation = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-emerald-400 text-emerald-950"><Store className="h-4 w-4" /></div>
        <div>
          <div className="text-sm font-extrabold text-white">NISTER</div>
          <div className="text-[11px] font-medium text-slate-400">Vendor operations</div>
        </div>
      </div>
      <div className="px-3 py-4">
        <div className="mb-2 px-2 text-[10px] font-bold uppercase text-slate-500">Workspace</div>
        <nav className="space-y-1" aria-label="Vendor navigation">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${active ? "bg-white text-ink" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">{item.label}</span>
                {item.count ? <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold ${active ? "bg-amber-100 text-amber-800" : "bg-white/10 text-slate-200"}`}>{item.count}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto border-t border-white/10 p-3">
        <button type="button" className="flex w-full items-center gap-3 rounded-md p-2 text-left text-slate-200 hover:bg-white/10">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-300 text-xs font-bold text-amber-950">EA</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-white">Esi Addo</span>
            <span className="block truncate text-[11px] text-slate-400">Nana&apos;s Pantry</span>
          </span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <Link href="/login" className="mt-1 flex h-9 items-center gap-3 rounded-md px-3 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" />Sign out</Link>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-paper lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#17201d] lg:flex">{navigation}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-950/50" onClick={() => setOpen(false)} aria-label="Close navigation" />
          <aside className="relative flex h-full w-[min(18rem,86vw)] flex-col bg-[#17201d] shadow-2xl">
            {navigation}
            <button type="button" className="absolute right-3 top-4 grid h-8 w-8 place-items-center text-slate-300" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
          </aside>
        </div>
      ) : null}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6 lg:hidden">
        <button type="button" className="grid h-9 w-9 place-items-center rounded-md border border-line" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <div className="text-sm font-extrabold">NISTER <span className="font-medium text-slate-500">Vendor</span></div>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-amber-200 text-xs font-bold">EA</div>
      </header>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
