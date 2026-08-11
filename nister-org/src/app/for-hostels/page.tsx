import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "For Hostels",
  description:
    "Nister Wi-Fi helps hostel owners and operators plan shared resident internet with clearer access, billing, coverage, and support flows.",
  alternates: {
    canonical: canonical("/for-hostels"),
  },
  openGraph: {
    title: "For Hostels | Nister Wi-Fi",
    description:
      "Owner-facing Wi-Fi planning for hostels, apartment blocks, and shared student housing.",
    url: canonical("/for-hostels"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const painPoints = [
  "Residents ask different people for Wi-Fi help because the login and payment flow is unclear.",
  "Some rooms or blocks receive weak coverage even when the property already pays for internet.",
  "Shared passwords make support, payment, and fair access harder to manage.",
  "Owners need a practical commercial model before committing to equipment or resident billing changes.",
] as const;

const operatorBenefits = [
  {
    title: "Clear resident access",
    body:
      "Residents get a simple path: connect to Nister Wi-Fi, open wifi.nister.org, log in or manage access, and browse after access is approved.",
  },
  {
    title: "A review before commitments",
    body:
      "The installation request captures the property shape, existing provider, pain points, and preferred deployment model before owner account creation.",
  },
  {
    title: "Billing options that fit the property",
    body:
      "Nister can discuss owner-funded, property-paid, resident-paid, or funding-review models after the site details are known.",
  },
] as const;

export default function ForHostelsPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "For Hostels", path: "/for-hostels" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="for-hostels" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">For hostel owners and operators</p>
            <h1>Turn property Wi-Fi into a managed resident access experience.</h1>
            <p className="hero-lede">
              Nister Wi-Fi is built for hostels, shared properties, and campus-area accommodation where internet access
              needs more than a router password. Owners can request a site review, describe the property, and choose the
              deployment direction that fits their operation.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Request Installation
              </Link>
              <a className="button button-secondary" href={EXTERNAL_LINKS.network}>
                Get Online
              </a>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Hostel Wi-Fi summary">
            <strong>Owner request flow</strong>
            <span>Share property and location details</span>
            <span>Explain current coverage and billing issues</span>
            <span>Choose a deployment preference</span>
            <span>Nister reviews the site before account onboarding</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">The operator problem</p>
            <h2>Hostel Wi-Fi breaks down when access, payment, and support are not managed together.</h2>
          </div>
          <div className="check-list">
            {painPoints.map((point) => (
              <p key={point}>{point}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">What Nister adds</p>
            <h2>More than a connection, without unsupported promises.</h2>
            <p>
              Nister starts with the property reality: buildings, rooms, resident need, current provider, and the pain
              points owners already see. That keeps the conversation practical and avoids selling a package before the
              site has been assessed.
            </p>
          </div>
          <div className="service-grid">
            {operatorBenefits.map((benefit) => (
              <article className="service-card" key={benefit.title}>
                <h3>{benefit.title}</h3>
                <p>{benefit.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="shell cta-panel">
          <div>
            <p className="eyebrow">Ready for review?</p>
            <h2>Send the property details before you create an owner account.</h2>
            <p>
              The request form posts directly to the owner lead endpoint on pay.nister.org. No cross-origin app request
              is needed from this public page.
            </p>
          </div>
          <div className="button-row">
            <Link className="button button-primary" href="/request-installation">
              Request Installation
            </Link>
            <Link className="button button-secondary" href="/how-it-works">
              How It Works
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
