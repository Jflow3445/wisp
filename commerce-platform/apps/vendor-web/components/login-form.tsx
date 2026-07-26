"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    router.push("/dashboard");
  }

  return (
    <form className="mt-7 space-y-4" onSubmit={submit}>
      <label>
        <span className="field-label">Work email</span>
        <input className="field" type="email" defaultValue="esi@nanaspantry.demo" autoComplete="username" required />
      </label>
      <label>
        <span className="field-label">Password</span>
        <span className="relative block">
          <input className="field pr-11" type={showPassword ? "text" : "password"} defaultValue="vendor-demo" autoComplete="current-password" required />
          <button type="button" className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </span>
      </label>
      <div className="flex items-center justify-between gap-3 text-xs">
        <label className="flex items-center gap-2 text-slate-600"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-forest" />Keep me signed in</label>
        <button type="button" className="font-semibold text-forest hover:underline">Reset password</button>
      </div>
      <button type="submit" className="btn-primary h-11 w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}</button>
    </form>
  );
}
