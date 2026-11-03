import Link from "next/link";
import { Logo } from "./logo";

export function AuthShell({ title, alternate, children }: { title: string; alternate: { label: string; href: string; action: string }; children: React.ReactNode }) {
  return (
    <div className="page-shell flex justify-center py-8 md:py-12">
      <section className="w-full max-w-md rounded-xl border border-[var(--border)] p-6 sm:p-8">
        <Logo />
        <h1 className="mt-8 text-2xl font-semibold">{title}</h1>
        {children}
        <p className="mt-7 text-center text-sm text-[var(--muted)]">{alternate.label} <Link href={alternate.href} className="font-semibold text-[var(--green)] underline underline-offset-4">{alternate.action}</Link></p>
      </section>
    </div>
  );
}
