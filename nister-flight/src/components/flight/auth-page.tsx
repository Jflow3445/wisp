import { validateReferralCode } from "@/lib/referrals";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction, signupAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";
import { safeAuthNextPath } from "@/lib/auth-redirects";
import { getPlatformSettings } from "@/lib/site";
import { TurnstileChallenge } from "@/components/forms/turnstile-challenge";
import { SocialAuthButtons } from "@/components/forms/social-auth-buttons";
import { LoadingSubmitButton } from "@/components/forms/loading-submit-button";
import { PasswordField } from "@/components/ui/password-field";
import { FlightChart } from "./chart";
import { Icon, Wordmark } from "./icons";

export async function AuthPage({ signup = false, params }: { signup?: boolean; params: { error?: string; success?: string; email?: string; next?: string; ref?: string } }) {
  const [user, settings] = await Promise.all([getCurrentUser(), getPlatformSettings()]);
  const rawReferral = params.ref || (await cookies()).get("nister_ref")?.value || "";
  const referralCheck = signup && /^[A-Za-z0-9]{4,24}$/.test(rawReferral) ? await validateReferralCode(rawReferral) : null;
  const referral = referralCheck?.valid ? referralCheck.normalizedCode || "" : "";
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
  return <main className="f-auth"><section className="f-auth-story"><Link href="/" className="f-logo"><Wordmark/></Link><div className="f-auth-story-copy"><div className="f-eyebrow">A DIFFERENT ALTITUDE</div><h1>Your moment.<br/>Your move<span>.</span></h1><p>A considered flight experience.<br/>One wallet. A clear view of every move.</p></div><FlightChart compact/><div className="f-auth-story-foot"><span><Icon name="shield" size={16}/> Secure account access</span><span>USDT · TRC20</span></div></section><section className="f-auth-form-wrap"><div className="f-auth-card"><Link className="f-text-link f-auth-back" href="/">← Back to Flight</Link><span className="f-eyebrow">{signup ? "YOUR NEXT CHAPTER" : "WELCOME BACK"}</span><h2>{signup ? "A fresh perspective." : "Ready for takeoff?"}</h2><p>{signup ? "Create your account and make yourself at home." : "Sign in with your existing Nister account."}</p>{params.error && <div className="f-notice f-notice-error" role="alert">{params.error}</div>}{params.success && <div className="f-notice" role="status">{params.success}</div>}
    <SocialAuthButtons settings={settings} intent={signup ? "signup" : "login"} next={safeAuthNextPath(params.next)}/>
    <form className="f-form" action={signup ? signupAction : loginAction}>{signup && <input type="hidden" name="referralCode" value={/^[A-Za-z0-9]{4,24}$/.test(referral) ? referral : ""}/>}<input type="hidden" name="next" value={safeAuthNextPath(params.next)}/>{signup && <label>Full name<input name="name" autoComplete="name" placeholder="Your full name" required minLength={2} maxLength={80}/></label>}<label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" defaultValue={params.email} required/></label><PasswordField name="password" label="Password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 10 : 8} required placeholder={signup ? "At least 10 characters" : "Your password"}/>{!signup && <Link className="f-text-link f-forgot" href="/forgot-password">Forgot password?</Link>}{signup && <label className="f-checkbox f-signup-consent"><input type="checkbox" name="legalConsent" value="true" required/><span>I’m 18 or older and agree to the <Link href="/terms">Terms</Link>, <Link href="/privacy">Privacy Policy</Link> and <Link href="/risk-disclosure">Risk Disclosure</Link>.</span></label>}<TurnstileChallenge settings={settings} action={signup ? "signup" : "login"}/><LoadingSubmitButton className="f-button f-button-full" pendingText={signup ? "Creating your account…" : "Signing in…"}>{signup ? "Create my account" : "Sign in"}<Icon name="arrow" size={17}/></LoadingSubmitButton></form><p className="f-auth-switch">{signup ? "Already part of Nister?" : "New around here?"} <Link href={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"} ↗︎</Link></p><div className="f-auth-secure"><Icon name="lock" size={13}/> Your existing registration and password stay with you.</div></div></section></main>;
}
