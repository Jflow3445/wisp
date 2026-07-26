"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Banknote, CreditCard, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCheckout } from "@/providers/checkout-provider";
import { CheckoutSummary } from "./checkout-summary";

const paymentSchema = z.object({
  method: z.enum(["MOBILE_MONEY", "CARD", "CASH_ON_DELIVERY"]),
  network: z.enum(["MTN", "TELECEL", "AT"]).optional(),
  phone: z.string().optional(),
}).superRefine((value, context) => {
  if (value.method === "MOBILE_MONEY" && !value.network) context.addIssue({ code: "custom", path: ["network"], message: "Choose your mobile money network" });
  if (value.method === "MOBILE_MONEY" && !/^\+233\d{9}$/.test(value.phone ?? "")) context.addIssue({ code: "custom", path: ["phone"], message: "Use the format +233241234567" });
});

type PaymentValues = z.infer<typeof paymentSchema>;

const methods = [
  { value: "MOBILE_MONEY", label: "Mobile Money", detail: "MTN, Telecel or AT", icon: Smartphone },
  { value: "CARD", label: "Debit or credit card", detail: "Visa and Mastercard", icon: CreditCard },
  { value: "CASH_ON_DELIVERY", label: "Cash on delivery", detail: "Available for eligible orders", icon: Banknote },
] as const;

export function PaymentForm() {
  const router = useRouter();
  const checkout = useCheckout();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<PaymentValues>({ resolver: zodResolver(paymentSchema), defaultValues: checkout.payment ?? { method: "MOBILE_MONEY", network: "MTN", phone: checkout.delivery?.phone ?? "+233" } });
  const method = watch("method");

  if (!checkout.ready) return <div className="skeleton h-72 w-full" />;
  if (!checkout.delivery) return <div className="py-16 text-center"><h1 className="text-2xl font-black">Add a delivery address first</h1><button type="button" onClick={() => router.replace("/checkout/start")} className="button-primary mt-5">Return to delivery</button></div>;

  const submit = (values: PaymentValues) => {
    checkout.setPayment(values);
    router.push("/checkout/review");
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
      <section><h1 className="section-title">How would you like to pay?</h1><p className="mt-2 text-sm text-[var(--muted)]">Payment is only requested after price and stock are rechecked.</p>
        <form onSubmit={handleSubmit(submit)} className="mt-7" noValidate>
          <fieldset><legend className="sr-only">Payment method</legend><div className="grid gap-3">{methods.map(({ value, label, detail, icon: Icon }) => <label key={value} className={`flex cursor-pointer items-center gap-4 border p-4 transition ${method === value ? "border-[var(--green)] bg-[#eff8f4] ring-1 ring-[var(--green)]" : "border-[var(--border)] hover:border-[var(--border-strong)]"}`}><input type="radio" value={value} className="size-4 accent-[var(--green)]" {...register("method")} /><Icon className="size-5 text-[var(--green)]" /><span><span className="block text-sm font-black">{label}</span><span className="mt-0.5 block text-xs text-[var(--muted)]">{detail}</span></span></label>)}</div></fieldset>
          {method === "MOBILE_MONEY" && <div className="mt-6 grid gap-5 border-t border-[var(--border)] pt-6 sm:grid-cols-2"><div><label className="field-label" htmlFor="network">Network</label><select id="network" className="field-select" aria-invalid={Boolean(errors.network)} {...register("network")}><option value="MTN">MTN MoMo</option><option value="TELECEL">Telecel Cash</option><option value="AT">AT Money</option></select>{errors.network && <p className="field-error">{errors.network.message}</p>}</div><div><label className="field-label" htmlFor="momo-phone">Mobile Money number</label><input id="momo-phone" className="field-input" inputMode="tel" placeholder="+233241234567" aria-invalid={Boolean(errors.phone)} {...register("phone")} />{errors.phone && <p className="field-error">{errors.phone.message}</p>}</div></div>}
          {method === "CARD" && <p className="mt-6 border-l-4 border-[var(--green)] bg-[var(--surface)] p-4 text-sm leading-6">After review, you’ll continue to our payment provider to enter your card securely.</p>}
          {method === "CASH_ON_DELIVERY" && <p className="mt-6 border-l-4 border-[var(--yellow)] bg-[#fff9df] p-4 text-sm leading-6">Eligibility is confirmed during order review. Some vendors and higher-value orders require prepayment.</p>}
          <div className="mt-8 flex flex-col-reverse justify-between gap-3 sm:flex-row"><button type="button" onClick={() => router.back()} className="button-secondary"><ArrowLeft className="size-4" />Back</button><button type="submit" className="button-primary">Review order <ArrowRight className="size-4" /></button></div>
        </form>
      </section>
      <CheckoutSummary compact />
    </div>
  );
}
