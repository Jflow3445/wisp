import Link from "next/link";
import { isExplicitAuthNextPath, safeAuthNextPath } from "@/lib/auth-redirects";

type SocialAuthIntent = "login" | "signup";

type SocialAuthButtonsProps = {
  settings: unknown;
  intent: SocialAuthIntent;
  next?: string;
};

type SocialAuthSettings = {
  googleSocialAuthEnabled?: boolean;
  googleSocialAuthClientId?: string | null;
  googleSocialAuthConfigured?: boolean;
  facebookSocialAuthEnabled?: boolean;
  facebookSocialAuthClientId?: string | null;
  facebookSocialAuthConfigured?: boolean;
};

type SocialProvider = {
  key: "google" | "facebook";
  label: string;
  mark: string;
};

const providers: SocialProvider[] = [
  { key: "google", label: "Google", mark: "G" },
  { key: "facebook", label: "Facebook", mark: "f" },
];

function getAvailableProviders(settings: SocialAuthSettings): SocialProvider[] {
  return providers.filter((provider) => {
    if (provider.key === "google") {
      return Boolean(settings.googleSocialAuthConfigured);
    }
    return Boolean(settings.facebookSocialAuthConfigured);
  });
}

function getSocialAuthTitle(intent: SocialAuthIntent, availableProviders: SocialProvider[]): string {
  const providerNames = availableProviders.map((provider) => provider.label).join(" or ");
  const action = intent === "login" ? "Continue" : "Create account";

  return `${action} with ${providerNames}`;
}

export function SocialAuthButtons({ settings, intent, next }: SocialAuthButtonsProps) {
  const socialSettings = settings as SocialAuthSettings;
  const availableProviders = getAvailableProviders(socialSettings);
  const nextPath = safeAuthNextPath(next);

  if (!availableProviders.length) {
    return null;
  }

  const title = getSocialAuthTitle(intent, availableProviders);
  const copy =
    intent === "signup"
      ? "Use a social account to create your Nister AI login faster, or continue with email below."
      : "Use a social account to reopen your Nister AI workspace, or sign in with email below.";

  return (
    <section className="authx-social" aria-label={title}>
      <div className="authx-social-head">
        <p className="authx-social-label">{title}</p>
        <p className="authx-social-copy">{copy}</p>
      </div>
      <div className="authx-social-grid">
        {availableProviders.map((provider) => {
          const searchParams = new URLSearchParams({ intent });
          if (isExplicitAuthNextPath(nextPath)) {
            searchParams.set("next", nextPath);
          }
          const href = `/api/auth/social/${provider.key}/start?${searchParams.toString()}`;
          return (
            <Link
              key={provider.key}
              href={href}
              prefetch={false}
              className={`premium-btn premium-btn-secondary premium-btn-md authx-social-button authx-social-button-${provider.key}`}
              aria-label={`${intent === "login" ? "Continue" : "Create account"} with ${provider.label}`}
            >
              <span className="authx-social-mark" aria-hidden="true">
                {provider.mark}
              </span>
              <span>{intent === "login" ? "Continue" : "Create account"} with {provider.label}</span>
            </Link>
          );
        })}
      </div>
      <p className="authx-social-note">Email and password remain available for this account.</p>
    </section>
  );
}
