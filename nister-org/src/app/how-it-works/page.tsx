import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "How Nister Wi-Fi reviews property requests, assesses coverage needs, plans installation, supports resident access, and discusses billing models.",
  alternates: {
    canonical: canonical("/how-it-works"),
  },
  openGraph: {
    title: "How It Works | Nister Wi-Fi",
    description:
      "A practical explanation of the Nister Wi-Fi deployment and billing flow for property owners.",
    url: canonical("/how-it-works"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const deploymentSteps = [
  {
    title: "Request review",
    body:
      "The owner or operator submits the public installation form with contact, property, location, building, resident, current connection, and deployment preference details.",
  },
  {
    title: "Assess the site",
    body:
      "Nister reviews the address, map pin, building shape, known coverage complaints, current provider details, and whether the property is starting from scratch.",
  },
  {
    title: "Confirm the model",
    body:
      "The owner-facing commercial model is discussed before rollout. Options can include resident-paid access, property-paid Wi-Fi, owner-funded deployment, or funding review.",
  },
  {
    title: "Deploy and onboard",
    body:
      "The installation plan covers access points, resident instructions, login path, support routing, and how people should manage access after the network is live.",
  },
] as const;

const billingNotes = [
  "Resident-paid access means each resident manages access through the approved payment and login path.",
  "Property-paid Wi-Fi means the owner treats internet as part of the property experience and agrees the service scope with Nister.",
  "Owner-funded rollout is for properties ready to fund deployment directly after the site and model are reviewed.",
  "Funding review is for properties where the site may be useful but the upfront model needs discussion before commitment.",
] as const;

export default function HowItWorksPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "How It Works", path: "/how-it-works" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="how-it-works" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">Deployment process</p>
            <h1>How Nister Wi-Fi moves from property request to resident access.</h1>
            <p className="hero-lede">
              The public request comes first. Nister uses it to understand the site before OTP verification, owner
              dashboard access, billing terms, or installation commitments are handled in the owner portal.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Property
              </Link>
              <a className="button button-secondary" href={EXTERNAL_LINKS.login}>
                Manage Access
              </a>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Deployment sequence">
            <strong>Public to portal flow</strong>
            <span>Public property request</span>
            <span>Review of site and commercial model</span>
            <span>Owner onboarding on pay.nister.org</span>
            <span>Resident access through wifi.nister.org</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading compact">
            <p className="eyebrow">Process</p>
            <h2>A clear sequence for owners and residents.</h2>
          </div>
          <div className="steps-grid">
            {deploymentSteps.map((step, index) => (
              <article className="step-card" key={step.title}>
                <span>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">Billing model</p>
            <h2>The commercial model should match how the property actually operates.</h2>
            <p>
              Nister does not need owners to guess the perfect package before the site is reviewed. The request form
              captures enough information to discuss the model with the property context in view.
            </p>
          </div>
          <div className="public-list-panel">
            {billingNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell two-column">
          <article className="feature-panel">
            <p className="eyebrow">Residents</p>
            <h2>Access stays simple.</h2>
            <p>
              Residents connect to Nister Wi-Fi, open wifi.nister.org, log in or manage access, and use the internet
              after approval. That public flow remains separate from owner administration.
            </p>
          </article>
          <article className="feature-panel">
            <p className="eyebrow">Owners</p>
            <h2>Administration stays on the owner portal.</h2>
            <p>
              Owner registration, OTP, service request tracking, property linking, and approved dashboards belong on
              pay.nister.org. The public site only starts the acquisition request.
            </p>
          </article>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
