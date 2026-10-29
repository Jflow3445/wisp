import Link from "next/link";
import { redirect } from "next/navigation";
import { acceptLegalTermsAction } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { safeAuthNextPath } from "@/lib/auth-redirects";
import { AccessFrame } from "@/components/flight/access-frame";
import { LoadingSubmitButton } from "@/components/forms/loading-submit-button";
export const metadata = { title: "Review your terms" };
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [params, user] = await Promise.all([searchParams, requireUser()]);
  if (user.role === "ADMIN") redirect("/admin");
  return <AccessFrame label="BEFORE YOU CONTINUE" title="A clear understanding." description="Review the latest terms for your Flight account, wallet and game.">{params.error && <div className="f-notice f-notice-error" role="alert">{params.error}</div>}<form action={acceptLegalTermsAction} className="f-form"><input type="hidden" name="next" value={safeAuthNextPath(params.next)}/><label className="f-checkbox"><input type="checkbox" name="legalConsent" value="true" required/><span>I have read and agree to the <Link href="/terms">Terms</Link>, <Link href="/privacy">Privacy Policy</Link> and <Link href="/risk-disclosure">Risk Disclosure</Link>.</span></label><LoadingSubmitButton className="f-button f-button-full" pendingText="Saving your acceptance...">Accept and continue</LoadingSubmitButton></form></AccessFrame>;
}
