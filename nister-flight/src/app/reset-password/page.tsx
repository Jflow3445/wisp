import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth";
import { AccessFrame } from "@/components/flight/access-frame";
import { LoadingSubmitButton } from "@/components/forms/loading-submit-button";
import { PasswordField } from "@/components/ui/password-field";
export const metadata = { title: "Choose a new password" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams, token = String(params.token || "").trim();
  return <AccessFrame label="A FRESH START" title="Make it yours again." description="Choose a unique password with at least 10 characters. This reset link can be used only once.">{!token && <div className="f-notice f-notice-error" role="alert">Open your reset email, or <Link href="/forgot-password">request a new link</Link>.</div>}{params.error && <div className="f-notice f-notice-error" role="alert">{params.error}</div>}<form action={resetPasswordAction} className="f-form"><input type="hidden" name="token" value={token}/><PasswordField name="password" label="New password" autoComplete="new-password" minLength={10} required/><PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" minLength={10} required/><LoadingSubmitButton className="f-button f-button-full" pendingText="Updating your password..." disabled={!token}>Update password</LoadingSubmitButton></form><p className="f-auth-switch">Back to <Link href="/login">sign in</Link></p></AccessFrame>;
}
