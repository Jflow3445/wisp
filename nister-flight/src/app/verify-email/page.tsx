import Link from "next/link";
import { redirect } from "next/navigation";
import { resendVerificationEmailAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { AccessFrame } from "@/components/flight/access-frame";
import { LoadingSubmitButton } from "@/components/forms/loading-submit-button";
export const metadata = { title: "Verify your email" };
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; email?: string }> }) {
  const [params, user] = await Promise.all([searchParams, getCurrentUser()]);
  if (user?.role === "ADMIN") redirect("/admin");
  if (user?.emailVerifiedAt) redirect("/dashboard");
  const email = String(user?.email || params.email || "").trim().toLowerCase();
  return <AccessFrame label="ONE QUICK CONFIRMATION" title="Check your inbox." description="Open the verification link to confirm your email and continue. Check your spam folder if it has not arrived.">{params.sent && <div className="f-notice" role="status">Verification email sent. Check your inbox and spam folder.</div>}{params.error && <div className="f-notice f-notice-error" role="alert">{params.error}</div>}<form action={resendVerificationEmailAction} className="f-form"><label>Email address<input name="email" type="email" defaultValue={email} autoComplete="email" required/></label><LoadingSubmitButton className="f-button f-button-full" pendingText="Sending your link...">Resend verification email</LoadingSubmitButton></form><p className="f-auth-switch">Need a different account? <Link href="/login">Sign in</Link></p></AccessFrame>;
}
