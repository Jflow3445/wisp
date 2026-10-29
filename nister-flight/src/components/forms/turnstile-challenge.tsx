import Script from "next/script";
import { headers } from "next/headers";
import { getTurnstileActionState, getTurnstileWidgetScriptUrl, type TurnstileAction } from "@/lib/turnstile";

type TurnstileChallengeProps = {
  settings: unknown;
  action: TurnstileAction;
};

export async function TurnstileChallenge({ settings, action }: TurnstileChallengeProps) {
  const state = getTurnstileActionState(settings, action);
  if (!state.enabled || !state.protect || !state.siteKey) {
    return null;
  }

  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") || requestHeaders.get("x-csp-nonce") || undefined;

  return (
    <div className="authx-turnstile">
      <div
        className="cf-turnstile"
        data-action={action}
        data-response-field-name="cf-turnstile-response"
        data-sitekey={state.siteKey}
        data-theme="light"
      />
      <Script id={`turnstile-${action}`} src={getTurnstileWidgetScriptUrl()} strategy="afterInteractive" nonce={nonce} />
    </div>
  );
}
