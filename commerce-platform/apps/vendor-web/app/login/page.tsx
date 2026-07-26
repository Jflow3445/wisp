import type { Metadata } from "next";
import { BarChart3, CheckCircle2, ShieldCheck, Store } from "lucide-react";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Vendor sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(20rem,0.8fr)_minmax(28rem,1.2fr)]">
      <aside className="hidden flex-col justify-between bg-[#17201d] p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-400 text-emerald-950"><Store className="h-5 w-5" /></span>
          <div><div className="text-base font-extrabold">NISTER</div><div className="text-xs text-slate-400">Vendor operations</div></div>
        </div>
        <div className="max-w-md">
          <p className="text-3xl font-bold leading-tight">Run daily marketplace operations from one workspace.</p>
          <div className="mt-8 grid gap-4 text-sm text-slate-300">
            <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><span>Respond to orders within the active reservation window.</span></div>
            <div className="flex gap-3"><BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" /><span>Track stock, settlement balances, and fulfilment performance.</span></div>
            <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" /><span>Controlled actions are versioned and written to the audit trail.</span></div>
          </div>
        </div>
        <p className="text-xs text-slate-500">NISTER Commerce Platform</p>
      </aside>
      <section className="grid place-items-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-forest text-white"><Store className="h-5 w-5" /></span>
            <div className="font-extrabold">NISTER <span className="font-medium text-slate-500">Vendor</span></div>
          </div>
          <p className="text-xs font-bold uppercase text-forest">Secure vendor access</p>
          <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">Sign in to Nana&apos;s Pantry</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Use your authorised operator account to continue.</p>
          <LoginForm />
          <div className="mt-6 flex items-center gap-2 border-t border-line pt-5 text-xs text-slate-500"><ShieldCheck className="h-4 w-4" />Access is monitored and audit logged.</div>
        </div>
      </section>
    </main>
  );
}
