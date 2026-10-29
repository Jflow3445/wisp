import Link from "next/link";

export type DashboardBannerKey =
  | "activation_incomplete"
  | "under_review"
  | "environment_active"
  | "action_required"
  | "subscription_issue"
  | "broker_not_connected";

type BannerCopy = {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

const bannerCopy: Record<DashboardBannerKey, BannerCopy> = {
  activation_incomplete: {
    headline: "Activation gate blocked",
    body: "Finish setup before Nister AI can receive eligible trade commands. Activation still waits for risk policy, app connection, and a valid signal.",
    ctaLabel: "Finish setup",
    ctaHref: "/dashboard/setup",
  },
  under_review: {
    headline: "Activation under review",
    body: "Your setup is submitted. Nister AI cannot receive new eligible commands until activation is approved.",
    ctaLabel: "Review activation status",
    ctaHref: "/dashboard/setup",
  },
  environment_active: {
    headline: "Ready and monitoring",
    body: "All required setup gates are valid. Nister AI can still stay idle until a valid market signal appears.",
    ctaLabel: "View status",
    ctaHref: "/dashboard/trading",
  },
  action_required: {
    headline: "Action required",
    body: "An issue is blocking setup or runtime. Resolve it before Nister AI can issue new eligible commands.",
    ctaLabel: "Resolve now",
    ctaHref: "/dashboard/alerts",
  },
  subscription_issue: {
    headline: "Billing gate blocked",
    body: "Renew or resolve billing before Nister AI can receive new trade commands.",
    ctaLabel: "Open billing",
    ctaHref: "/dashboard/billing",
  },
  broker_not_connected: {
    headline: "Broker gate blocked",
    body: "Connect an approved broker account that matches the account logged into the Nister AI App.",
    ctaLabel: "Connect broker",
    ctaHref: "/dashboard/broker-accounts",
  },
};

type DashboardStatusBannerProps = {
  banner: DashboardBannerKey | null;
};

export function DashboardStatusBanner({ banner }: DashboardStatusBannerProps) {
  if (!banner) {
    return null;
  }

  const copy = bannerCopy[banner];

  return (
    <section className="ops-card">
      <div className="ops-status-banner">
        <div>
          <p className="ops-status-title">{copy.headline}</p>
          <p>{copy.body}</p>
        </div>
        <div className="ops-hero-actions">
          <Link href={copy.ctaHref} className="premium-btn premium-btn-primary premium-btn-md">
            {copy.ctaLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
