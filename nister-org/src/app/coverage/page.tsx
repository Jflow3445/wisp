import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS, coverageAreas } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "Coverage",
  description:
    "Nister Wi-Fi coverage request information for hostels, campus-area properties, towns, regions, and remote community access points.",
  alternates: {
    canonical: canonical("/coverage"),
  },
  openGraph: {
    title: "Coverage | Nister Wi-Fi",
    description:
      "Request Nister Wi-Fi review for hostel, community, campus-area, town, and regional coverage needs.",
    url: canonical("/coverage"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

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
            <p className="eyebrow">Coverage review</p>
            <h1>Request Nister Wi-Fi coverage for a hostel, town, campus area, or community.</h1>
            <p className="hero-lede">
              Coverage starts with location clarity. Share the region, town, address, map link, nearby campus or
              landmark, and the buildings that need resident internet access.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Request Installation
              </Link>
              <a className="button button-secondary" href={EXTERNAL_LINKS.coverageRequest}>
                WhatsApp Coverage Request
              </a>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Coverage request summary">
            <strong>Best request details</strong>
            <span>Region and town</span>
            <span>Digital address or map pin</span>
            <span>Nearby campus or landmark</span>
            <span>Building, floor, and room context</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Priority review contexts</p>
            <h2>Areas Nister can review when location details are specific.</h2>
            <p>
              This page does not claim live availability for every listed town. It explains the kinds of Ghanaian
              regions, hostel clusters, campus areas, and remote community requests that can be assessed.
            </p>
          </div>
          <div className="coverage-grid">
            {coverageAreas.map((area) => (
              <article className="coverage-card" key={area.region}>
                <h3>{area.region}</h3>
                <p>{area.focus}</p>
                <div className="tag-row">
                  {area.towns.map((town) => (
                    <span key={town}>{town}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">Outside the listed towns?</p>
            <h2>Send the location anyway if the need is real and the site is identifiable.</h2>
          </div>
          <div className="public-list-panel">
            <p>Include the property name, town, region, road directions, and a map link if possible.</p>
            <p>Explain whether the request is for a hostel, shared property, school-area residence, or community point.</p>
            <p>Describe the internet problem residents face today: coverage, speed, downtime, payment, or user access.</p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
