"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowRight } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "@/lib/api-client";

const schema = z.object({ email: z.email("Enter a valid email address"), password: z.string().min(8, "Password must have at least 8 characters") });
type Values = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const login = useMutation({ mutationFn: api.signIn, onSuccess: (user) => { window.localStorage.setItem("nister-buyer", JSON.stringify(user)); router.push("/account/orders"); } });
  return (
    <form className="mt-7 grid gap-5" onSubmit={handleSubmit((values) => login.mutate(values))} noValidate>
      <div><label className="field-label" htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" className="field-input" aria-invalid={Boolean(errors.email)} {...register("email")} />{errors.email && <p className="field-error">{errors.email.message}</p>}</div>
      <div><div className="flex items-center justify-between"><label className="field-label" htmlFor="password">Password</label><button type="button" className="mb-2 text-xs font-bold text-[var(--green)]">Forgot password?</button></div><input id="password" type="password" autoComplete="current-password" className="field-input" aria-invalid={Boolean(errors.password)} {...register("password")} />{errors.password && <p className="field-error">{errors.password.message}</p>}</div>
      {login.isError && <p className="flex gap-2 bg-[#fff0ee] p-3 text-sm text-[var(--error)]" role="alert"><AlertCircle className="size-4 shrink-0" />{login.error.message}</p>}
      <button type="submit" className="button-primary w-full" disabled={login.isPending}>{login.isPending ? "Signing in…" : <>Sign in <ArrowRight className="size-4" /></>}</button>
    </form>
  );
}
