import type { Metadata } from "next";
import { ArrowRight, Building2, Check, Circle, FileSignature, Landmark, MapPin } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { OnboardingStep } from "@/lib/types";
import { resolvePageState } from "@/lib/page-state";
import { PageHeader } from "@/components/page-header";
import { PageState } from "@/components/page-state";
import { StatusBadge } from "@/components/status-badge";
import { ActionDialog } from "@/components/action-dialog";

export const metadata: Metadata = { title: "Onboarding" };

const icons = { business: Building2, identity: Check, payout: Landmark, location: MapPin, agreement: FileSignature };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const query = await searchParams;
  const state = resolvePageState(query.state);
  const steps = await apiGet<OnboardingStep[]>("/vendor/onboarding");
  return (
    <>
      <PageHeader title="Onboarding" description="Approval requirements for Nana's Pantry" />
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
        {state !== "ready" ? <PageState state={state} resetHref="/onboarding" /> : <>
          <section className="panel overflow-hidden">
            <div className="grid gap-4 border-b border-line bg-[#17201d] p-5 text-white sm:grid-cols-[1fr_auto] sm:items-end sm:p-6"><div><p className="text-xs font-bold uppercase text-emerald-300">Application approved</p><h2 className="mt-2 text-xl font-bold">Final activation checks</h2><p className="mt-1 text-sm text-slate-300">Complete the agreement while the dispatch location review finishes.</p></div><div className="text-left sm:text-right"><p className="text-3xl font-bold">80%</p><p className="text-xs text-slate-400">4 of 5 reviewed</p></div></div>
            <ol className="divide-y divide-line">
              {steps.map((step) => { const Icon = icons[step.id as keyof typeof icons] ?? Circle; return <li key={step.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-6"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${step.status === "COMPLETE" ? "bg-emerald-50 text-emerald-700" : step.status === "IN_REVIEW" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{step.label}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{step.detail}</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><StatusBadge status={step.status} />{step.status === "REQUIRED" ? <ActionDialog endpoint="/vendor/onboarding/agreement" action="SIGN" title="Sign marketplace agreement?" description="Confirm you are authorised to accept the current marketplace agreement for Nana's Pantry." confirmLabel="Confirm signature" requireEvidence trigger={<span className="inline-grid h-8 w-8 place-items-center rounded-md border border-line hover:bg-slate-50" title="Review agreement"><ArrowRight className="h-4 w-4" /></span>} /> : null}</div></li>; })}
            </ol>
          </section>
          <p className="text-xs leading-5 text-slate-500">Reviews are completed by NISTER Marketplace operations. Information requests will appear here and are also sent to authorised operators.</p>
        </>}
      </div>
    </>
  );
}
