"use client";

import { Check } from "lucide-react";
import { usePathname } from "next/navigation";

const steps = [
  { path: "/checkout/start", label: "Delivery" },
  { path: "/checkout/payment", label: "Payment" },
  { path: "/checkout/review", label: "Review" },
];

export function CheckoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = Math.max(0, steps.findIndex((step) => step.path === pathname));
  return (
    <div className="page-shell py-7 md:py-10">
      <div className="mb-8 border-b border-[var(--border)] pb-6">
        <p className="eyebrow">Secure checkout</p>
        <ol className="mt-4 flex max-w-xl" aria-label="Checkout progress">
          {steps.map((step, index) => (
            <li key={step.path} className="flex min-w-0 flex-1 items-center last:flex-none" aria-current={index === current ? "step" : undefined}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs font-black ${index < current ? "border-[var(--green)] bg-[var(--green)] text-white" : index === current ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--border-strong)] text-[var(--muted)]"}`}>{index < current ? <Check className="size-3.5" /> : index + 1}</span>
              <span className={`ml-2 hidden text-xs font-bold sm:inline ${index === current ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>{step.label}</span>
              {index < steps.length - 1 && <span className={`mx-2 h-px min-w-4 flex-1 sm:mx-4 ${index < current ? "bg-[var(--green)]" : "bg-[var(--border)]"}`} />}
            </li>
          ))}
        </ol>
      </div>
      {children}
    </div>
  );
}
