import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "Plans",
  description:
    "Owner-facing Nister Wi-Fi commercial models for resident-paid access, property-paid Wi-Fi, owner-funded deployment, and funding review.",
  alternates: {
    canonical: canonical("/plans"),
  },
  openGraph: {
    title: "Plans | Nister Wi-Fi",
    description:
      "Compare property Wi-Fi commercial models without unsupported live metrics or generic package claims.",
    url: canonical("/plans"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const commercialModels = [
  {
    title: "Resident-paid Wi-Fi",
    body:
      "Residents buy and manage their own access through the approved Nister payment and login flow. This can fit hostels where internet usage varies by resident and the owner wants less manual collection.",
  },
  {
    title: "Property-paid Wi-Fi",
    body:
      "The property pays for internet as part of the resident experience. This can fit owners who want a simpler resident promise and a clear operating agreement for support.",
  },
  {
    title: "Owner-funded deployment",
    body:
      "The owner funds the rollout directly after the site, equipment needs, access model, and operating responsibilities are reviewed.",
  },
  {
    title: "Nister funding review",
    body:
      "The property asks Nister to review whether a funded deployment path is appropriate. This is a review path, not an automatic approval or a live availability promise.",
  },
] as const;

const comparisonPoints = [
  "Who pays for access: resident, owner, or a reviewed deployment arrangement.",
  "Who communicates resident rules before and after installation.",
  "Whether existing provider issues are mostly coverage, speed, downtime, billing, or access control.",
  "How clearly the property can support residents when they need to log in, top up, or report a problem.",
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
            <p className="eyebrow">Commercial models</p>
            <h1>Choose a Wi-Fi model after the property reality is clear.</h1>
            <p className="hero-lede">
              Nister Wi-Fi does not publish unsupported package metrics on the public site. Owners start with a request,
              then the team reviews location, building layout, resident need, current internet, and the preferred
              commercial direction.
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
          <aside className="public-summary-panel" aria-label="Plan selection summary">
            <strong>Plans are model-led</strong>
            <span>Resident-paid access</span>
            <span>Property-paid Wi-Fi</span>
            <span>Owner-funded rollout</span>
            <span>Nister funding review</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Options</p>
            <h2>Owner-facing models Nister can review.</h2>
            <p>
              These are commercial directions for conversation and review. Final terms depend on the property, coverage
              needs, service responsibilities, and agreed rollout path.
            </p>
          </div>
          <div className="public-card-grid">
            {commercialModels.map((model) => (
              <article className="public-card" key={model.title}>
                <span className="panel-label">Commercial model</span>
                <h3>{model.title}</h3>
                <p>{model.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">How to compare</p>
            <h2>The right model is about responsibility, not just price.</h2>
            <p>
              A good plan makes it clear who pays, who explains access, who receives resident complaints, and how
              support information reaches the Nister team when something needs review.
            </p>
          </div>
          <div className="public-list-panel">
            {comparisonPoints.map((point) => (
              <p key={point}>{point}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="shell cta-panel">
          <div>
            <p className="eyebrow">Start with details</p>
            <h2>Send the request with the model you prefer today.</h2>
            <p>
              Choose recommend for me if you want Nister to review the site before suggesting the most practical model.
            </p>
          </div>
          <div className="button-row">
            <Link className="button button-primary" href="/request-installation">
              Assess My Property
            </Link>
            <Link className="button button-secondary" href="/resources">
              Read Resources
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
