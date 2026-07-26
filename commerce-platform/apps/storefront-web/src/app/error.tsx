"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="page-shell grid min-h-[55vh] place-items-center py-16">
      <div className="max-w-md text-center" role="alert">
        <AlertTriangle className="mx-auto size-10 text-[var(--accent)]" aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-black">We could not load this page</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Check your connection and try again. Your basket is saved on this device.</p>
        <button type="button" onClick={reset} className="button-primary mt-6"><RotateCcw className="size-4" />Try again</button>
      </div>
    </div>
  );
}
