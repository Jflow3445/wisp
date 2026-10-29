import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { getPlatformSettings } from "@/lib/site";
import { AccessFrame } from "@/components/flight/access-frame";
import { TurnstileChallenge } from "@/components/forms/turnstile-challenge";
import { LoadingSubmitButton } from "@/components/forms/loading-submit-button";
export const metadata = { title: "Recover your account" };
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const [params, settings] = await Promise.all([searchParams, getPlatformSettings()]);
  return <AccessFrame label="ACCOUNT RECOVERY" title="Back in the air." description="Enter your account email. We will send a single-use password reset link if the account exists.">{params.error && <div className="f-notice f-notice-error" role="alert">{params.error}</div>}{params.success && <div className="f-notice" role="status">{params.success}</div>}<form action={requestPasswordResetAction} className="f-form"><label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com"/></label><TurnstileChallenge settings={settings} action="forgot-password"/><LoadingSubmitButton className="f-button f-button-full" pendingText="Requesting your link...">Send reset link</LoadingSubmitButton></form><p className="f-auth-switch">Remembered your password? <Link href="/login">Sign in</Link></p></AccessFrame>;
}
