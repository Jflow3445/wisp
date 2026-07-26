import { BadgeCheck, ShoppingBag, Truck } from "lucide-react";
import Link from "next/link";
import { Logo } from "./logo";

export function AuthShell({ title, description, alternate, children }: { title: string; description: string; alternate: { label: string; href: string; action: string }; children: React.ReactNode }) {
  return (
    <div className="page-shell grid min-h-[42rem] items-stretch overflow-hidden py-8 lg:grid-cols-[.8fr_1.2fr] lg:py-12">
      <aside className="hidden bg-[var(--ink)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="[&_span]:!text-white"><Logo /></div>
        <div><p className="max-w-md text-3xl font-black leading-tight">Your orders, payments and delivery updates in one place.</p><div className="mt-8 grid gap-4 text-sm text-white/75"><p className="flex items-center gap-3"><ShoppingBag className="size-5 text-[var(--yellow)]" />Keep track of every purchase</p><p className="flex items-center gap-3"><Truck className="size-5 text-[var(--yellow)]" />Follow delivery progress</p><p className="flex items-center gap-3"><BadgeCheck className="size-5 text-[var(--yellow)]" />Buy from verified vendors</p></div></div>
      </aside>
      <section className="flex items-center justify-center border border-[var(--border)] px-5 py-10 sm:px-10">
        <div className="w-full max-w-md"><p className="eyebrow">NISTER account</p><h1 className="mt-2 text-3xl font-black">{title}</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p>{children}<p className="mt-7 text-center text-sm text-[var(--muted)]">{alternate.label} <Link href={alternate.href} className="font-black text-[var(--green)] underline underline-offset-4">{alternate.action}</Link></p></div>
      </section>
    </div>
  );
}
