"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "@/lib/api-client";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your full name"),
  email: z.email("Enter a valid email address"),
  phone: z.string().regex(/^\+233\d{9}$/, "Use the format +233241234567"),
  password: z.string().min(8, "Use at least 8 characters").regex(/[A-Z]/, "Add one uppercase letter").regex(/\d/, "Add one number"),
  accepted: z.boolean().refine(Boolean, "Accept the terms to continue"),
});
type Values = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", phone: "+233", password: "", accepted: false } });
  const registration = useMutation({ mutationFn: ({ accepted: _, ...values }: Values) => api.register(values), onSuccess: (user) => { window.localStorage.setItem("nister-buyer", JSON.stringify(user)); router.push("/account/orders"); } });
  return (
    <form className="mt-7 grid gap-4" onSubmit={handleSubmit((values) => registration.mutate(values))} noValidate>
      <div><label className="field-label" htmlFor="name">Full name</label><input id="name" autoComplete="name" className="field-input" aria-invalid={Boolean(errors.name)} {...register("name")} />{errors.name && <p className="field-error">{errors.name.message}</p>}</div>
      <div><label className="field-label" htmlFor="register-email">Email address</label><input id="register-email" type="email" autoComplete="email" className="field-input" aria-invalid={Boolean(errors.email)} {...register("email")} />{errors.email && <p className="field-error">{errors.email.message}</p>}</div>
      <div><label className="field-label" htmlFor="register-phone">Mobile number</label><input id="register-phone" inputMode="tel" autoComplete="tel" className="field-input" aria-invalid={Boolean(errors.phone)} {...register("phone")} />{errors.phone && <p className="field-error">{errors.phone.message}</p>}</div>
      <div><label className="field-label" htmlFor="register-password">Password</label><input id="register-password" type="password" autoComplete="new-password" className="field-input" aria-invalid={Boolean(errors.password)} {...register("password")} />{errors.password && <p className="field-error">{errors.password.message}</p>}</div>
      <div><label className="flex items-start gap-3 text-xs leading-5 text-[var(--muted)]"><input type="checkbox" className="mt-0.5 size-4 accent-[var(--green)]" {...register("accepted")} /><span>I agree to the marketplace terms and privacy notice.</span></label>{errors.accepted && <p className="field-error">{errors.accepted.message}</p>}</div>
      {registration.isError && <p className="flex gap-2 bg-[#fff0ee] p-3 text-sm text-[var(--error)]" role="alert"><AlertCircle className="size-4 shrink-0" />{registration.error.message}</p>}
      <button type="submit" className="button-primary w-full" disabled={registration.isPending}>{registration.isPending ? "Creating account…" : <>Create account <ArrowRight className="size-4" /></>}</button>
    </form>
  );
}
