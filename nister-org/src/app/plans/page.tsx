import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "Plans",
  description:
    "Choose whether residents pay for internet, Wi-Fi is included with accommodation, or Nister reviews a funded setup for your hostel.",
  alternates: {
    canonical: canonical("/plans"),
  },
  openGraph: {
    title: "Plans | Nister Wi-Fi",
    description: "Compare the simple ways Nister Wi-Fi can work at your hostel.",
    url: canonical("/plans"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const choices = [
  {
    title: "Residents pay for internet",
    body: "Best if you want residents to choose and pay for their own access.",
    details: [
      "Residents buy what they need.",
      "Nister connects payment and access.",
      "You can see what your hostel earns where this applies.",
    ],
    cta: "I Want Residents to Pay",
  },
  {
    title: "Wi-Fi is included with accommodation",
    body: "Best if you want internet to be part of what residents receive when they stay at your hostel.",
    details: [
      "The resident promise is simpler.",
      "Internet becomes part of the hostel experience.",
      "Nister helps manage the service around it.",
    ],
    cta: "I Want Wi-Fi Included",
  },
  {
    title: "Nister-funded setup",
    body: "Available only for selected hostels where Nister decides the investment makes business sense.",
    details: [
      "Useful when setup cost is the main barrier.",
      "We review the hostel before deciding.",
      "Funding is not guaranteed.",
    ],
    cta: "Ask About Nister Funding",
  },
] as const;

export default function PlansPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Plans", path: "/plans" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="plans" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">Your Wi-Fi options</p>
            <h1>How do you want Wi-Fi to work at your hostel?</h1>
            <p className="hero-lede">
              You do not need to choose perfectly before talking to us. Tell us about your hostel and we&apos;ll recommend
              what makes sense.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Hostel
              </Link>
              <Link className="button button-secondary" href="/how-it-works">
                See How Nister Works
              </Link>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Wi-Fi choices">
            <strong>Three simple choices</strong>
            <span>Residents pay for internet</span>
            <span>Wi-Fi is included</span>
            <span>Nister may help with setup cost</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <h2>Start with the model that feels closest.</h2>
            <p>We can help you refine it after we understand your hostel, residents and current internet situation.</p>
          </div>
          <div className="service-grid">
            {choices.map((choice) => (
              <article className="service-card" key={choice.title}>
                <h3>{choice.title}</h3>
                <p>{choice.body}</p>
                <ul>
                  {choice.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
                <Link className="inline-link inline-link-bright" href="/request-installation">
                  {choice.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="shell cta-panel">
          <div>
            <h2>Not sure? That&apos;s fine.</h2>
            <p>Tell us about your hostel and we&apos;ll recommend what makes sense.</p>
          </div>
          <div className="button-row">
            <Link className="button button-primary" href="/request-installation">
              Assess My Hostel
            </Link>
            <Link className="button button-secondary" href="/resources">
              Read Practical Guides
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
