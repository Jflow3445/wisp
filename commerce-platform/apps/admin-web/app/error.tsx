"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="grid min-h-screen place-items-center p-6"><section className="panel max-w-md p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-red-600" /><h1 className="mt-4 text-lg font-bold">Admin portal unavailable</h1><p className="mt-2 text-sm text-slate-600">The page could not be loaded. No administrative command was submitted.</p><button type="button" className="btn-primary mt-5" onClick={reset}><RotateCcw className="h-4 w-4" />Try again</button></section></main>;
}
