import type { Metadata } from "next";
import Link from "next/link";
import { CONNECTIVITY_SOURCES, EXTERNAL_LINKS } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Nister Wi-Fi and its focus on practical shared internet access for hostels and remote communities.",
  alternates: {
    canonical: canonical("/about"),
  },
  openGraph: {
    title: "About Nister Wi-Fi",
    description:
      "Nister Wi-Fi focuses on shared internet access for hostels, campus-area housing, and remote communities.",
    url: canonical("/about"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const principles = [
  {
    title: "Access should be understandable",
    body:
      "Residents should know what network to join, what page to open, how to log in, and where to ask for help when access does not work.",
  },
  {
    title: "Owners need an operational model",
    body:
      "A property needs more than signal. Billing responsibility, support routing, and resident communication need to be clear before rollout.",
  },
  {
    title: "Coverage requests should start with real location detail",
    body:
      "Nister reviews hostel and community requests using the site context: town, address, map pin, buildings, rooms, residents, and current connectivity problems.",
  },
] as const;

export default function AboutPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "About", path: "/about" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="about" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">About Nister Wi-Fi</p>
            <h1>About Nister Wi-Fi.</h1>
            <p className="hero-lede">
              Nister Wi-Fi focuses on shared internet access where residents, students, workers, and communities need a
              clearer way to get online for study, work, calls, payments, public information, and everyday services.
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
          <aside className="public-summary-panel" aria-label="Nister focus">
            <strong>Focus</strong>
            <span>Hostel Wi-Fi access</span>
            <span>Remote community connectivity</span>
            <span>Resident login and payment clarity</span>
            <span>Owner-led property requests</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">Why this work matters</p>
            <h2>The internet access gap still affects education, work, payments, and daily communication.</h2>
          </div>
          <div className="section-copy">
            <p>
              ITU connectivity reporting shows that billions of people remain offline globally and that rural access
              remains behind urban access. Nister applies that larger access problem to practical local contexts:
              hostels, campus-area housing, and communities where shared Wi-Fi can make daily internet use more
              reachable.
            </p>
            <div className="source-list">
              {CONNECTIVITY_SOURCES.map((source) => (
                <a href={source.href} key={source.href} rel="noreferrer" target="_blank">
                  {source.label}: {source.summary}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Operating principles</p>
            <h2>Supportable Wi-Fi is a product and an operations system.</h2>
          </div>
          <div className="service-grid">
            {principles.map((principle) => (
              <article className="service-card" key={principle.title}>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
