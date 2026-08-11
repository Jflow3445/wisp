import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "Coverage",
  description:
    "Tell Nister where your hostel is so the team can review whether managed Wi-Fi can be assessed for your property.",
  alternates: {
    canonical: canonical("/coverage"),
  },
  openGraph: {
    title: "Coverage | Nister Wi-Fi",
    description: "Want Nister at your hostel? Tell us where you are.",
    url: canonical("/coverage"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const requestDetails = [
  "Your hostel name.",
  "Town and region.",
  "Address, directions or map pin.",
  "Number of rooms.",
  "Approximate number of residents.",
  "What internet problem you want solved.",
] as const;

export default function CoveragePage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Coverage", path: "/coverage" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="coverage" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">Coverage</p>
            <h1>Want Nister at your hostel? Tell us where you are.</h1>
            <p className="hero-lede">
              Nister is expanding hostel by hostel. Send the location and a few practical details and we&apos;ll tell you
              whether we can assess your hostel.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Hostel
              </Link>
              <a className="button button-secondary" href={EXTERNAL_LINKS.coverageRequest}>
                WhatsApp Coverage Request
              </a>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Coverage request details">
            <strong>Send us</strong>
            {requestDetails.slice(0, 4).map((detail) => (
              <span key={detail}>{detail}</span>
            ))}
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell section-grid">
          <div>
            <h2>Good location details make the first review useful.</h2>
            <p>
              We do not want to pretend Nister is available everywhere. A clear address, map pin and room count help us
              decide whether a hostel assessment is practical.
            </p>
          </div>
          <div className="public-list-panel">
            {requestDetails.map((detail) => (
              <p key={detail}>{detail}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <h2>If your town is not listed anywhere, still send the request.</h2>
          </div>
          <div className="section-copy">
            <p>
              What matters most is whether the hostel has a real need, enough location detail and a service model that
              can make sense.
            </p>
            <p>
              Tell us whether you already have fibre, whether coverage is weak in rooms, whether residents pay
              separately and whether you want Wi-Fi included with accommodation.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
