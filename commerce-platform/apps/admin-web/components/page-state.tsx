import Link from "next/link";
import { AlertTriangle, LockKeyhole, PackageOpen, RotateCcw } from "lucide-react";
import type { PageState as State } from "@/lib/page-state";

const content = { empty: { icon: PackageOpen, title: "No records found", detail: "There are no records matching the current view." }, error: { icon: AlertTriangle, title: "Could not load records", detail: "The administration API did not return a usable response. No changes were made." }, permission: { icon: LockKeyhole, title: "Permission required", detail: "Your administrative role does not include this control." } };

export function PageState({ state, resetHref }: { state: Exclude<State, "ready">; resetHref: string }) { const current = content[state]; const Icon = current.icon; return <section className="panel grid min-h-72 place-items-center p-8 text-center" role={state === "error" ? "alert" : undefined}><div className="max-w-sm"><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-600"><Icon className="h-5 w-5" /></span><h2 className="mt-4 text-base font-bold">{current.title}</h2><p className="mt-1.5 text-sm leading-6 text-slate-500">{current.detail}</p>{state === "error" ? <Link href={resetHref} className="btn-secondary mt-5"><RotateCcw className="h-4 w-4" />Retry</Link> : null}</div></section>; }
