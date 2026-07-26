"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCart } from "@/providers/cart-provider";
import { useCheckout } from "@/providers/checkout-provider";
import { CheckoutSummary } from "./checkout-summary";

const deliverySchema = z.object({
  recipientName: z.string().trim().min(2, "Enter the recipient’s full name"),
  phone: z.string().trim().regex(/^\+233\d{9}$/, "Use a Ghana number in the format +233241234567"),
  region: z.string().min(1, "Choose a region"),
  city: z.string().trim().min(2, "Enter a town or city"),
  streetAddress: z.string().trim().min(3, "Enter a street or area"),
  digitalAddress: z.string().trim().max(32, "Digital address is too long").optional(),
  landmark: z.string().trim().min(3, "Add a nearby landmark"),
  deliveryInstructions: z.string().trim().max(500, "Keep instructions under 500 characters").optional(),
});

type DeliveryValues = z.infer<typeof deliverySchema>;

const regions = ["Greater Accra", "Ashanti", "Central", "Eastern", "Volta", "Western", "Northern", "Bono", "Bono East", "Ahafo", "Oti", "Savannah", "North East", "Upper East", "Upper West", "Western North"];

export function DeliveryForm() {
  const router = useRouter();
  const checkout = useCheckout();
  const cart = useCart();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<DeliveryValues>({
    resolver: zodResolver(deliverySchema),
    defaultValues: checkout.delivery ?? { region: "Greater Accra", recipientName: "", phone: "+233", city: "", streetAddress: "", digitalAddress: "", landmark: "", deliveryInstructions: "" },
  });

  if (cart.ready && cart.lines.length === 0) return <div className="py-16 text-center"><h1 className="text-2xl font-black">Your basket is empty</h1><button className="button-primary mt-5" onClick={() => router.push("/")}>Return to the market</button></div>;

  const submit = (values: DeliveryValues) => {
    checkout.setDelivery(values);
    router.push("/checkout/payment");
  };

  const fieldError = (name: keyof DeliveryValues) => errors[name] && <p className="field-error" id={`${name}-error`}>{errors[name]?.message}</p>;
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
      <section><div className="flex items-center gap-3"><MapPin className="size-6 text-[var(--green)]" /><div><h1 className="section-title">Where should we deliver?</h1><p className="mt-1 text-sm text-[var(--muted)]">We’ll confirm availability and timing before payment.</p></div></div>
        <form onSubmit={handleSubmit(submit)} className="mt-7 grid gap-5 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2"><label className="field-label" htmlFor="recipientName">Recipient name</label><input id="recipientName" className="field-input" autoComplete="name" aria-invalid={Boolean(errors.recipientName)} aria-describedby={errors.recipientName ? "recipientName-error" : undefined} {...register("recipientName")} />{fieldError("recipientName")}</div>
          <div><label className="field-label" htmlFor="phone">Mobile number</label><input id="phone" className="field-input" inputMode="tel" autoComplete="tel" placeholder="+233241234567" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "phone-error" : undefined} {...register("phone")} />{fieldError("phone")}</div>
          <div><label className="field-label" htmlFor="region">Region</label><select id="region" className="field-select" aria-invalid={Boolean(errors.region)} {...register("region")}>{regions.map((region) => <option key={region}>{region}</option>)}</select>{fieldError("region")}</div>
          <div><label className="field-label" htmlFor="city">Town or city</label><input id="city" className="field-input" autoComplete="address-level2" aria-invalid={Boolean(errors.city)} {...register("city")} />{fieldError("city")}</div>
          <div><label className="field-label" htmlFor="digitalAddress">GhanaPost GPS <span className="font-normal text-[var(--muted)]">(optional)</span></label><input id="digitalAddress" className="field-input uppercase" placeholder="GA-184-9912" {...register("digitalAddress")} /></div>
          <div className="sm:col-span-2"><label className="field-label" htmlFor="streetAddress">Street, building or area</label><input id="streetAddress" className="field-input" autoComplete="street-address" aria-invalid={Boolean(errors.streetAddress)} {...register("streetAddress")} />{fieldError("streetAddress")}</div>
          <div className="sm:col-span-2"><label className="field-label" htmlFor="landmark">Nearest landmark</label><input id="landmark" className="field-input" placeholder="For example, opposite the community library" aria-invalid={Boolean(errors.landmark)} {...register("landmark")} />{fieldError("landmark")}</div>
          <div className="sm:col-span-2"><label className="field-label" htmlFor="deliveryInstructions">Delivery notes <span className="font-normal text-[var(--muted)]">(optional)</span></label><textarea id="deliveryInstructions" rows={3} className="field-textarea" {...register("deliveryInstructions")} /></div>
          <button type="submit" disabled={isSubmitting} className="button-primary sm:col-start-2">Continue to payment <ArrowRight className="size-4" /></button>
        </form>
      </section>
      <CheckoutSummary />
    </div>
  );
}
