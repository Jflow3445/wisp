import type { Metadata } from "next";
import Link from "next/link";
import { resourceArticles } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Nister Wi-Fi resources for hostel owners and operators planning installation, coverage, resident access, billing, and support.",
  alternates: {
    canonical: canonical("/resources"),
  },
  openGraph: {
    title: "Resources | Nister Wi-Fi",
    description:
      "Guides for property owners planning managed Wi-Fi access for hostels and shared accommodation.",
    url: canonical("/resources"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

export default function ResourcesPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Resources", path: "/resources" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="resources" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">Resources</p>
            <h1>Resources for hostel Wi-Fi owners and operators.</h1>
            <p className="hero-lede">
              Use these resources to think through installation readiness, coverage issues, resident internet access,
              payment responsibility, and support before requesting a Nister Wi-Fi review.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Property
              </Link>
              <Link className="button button-secondary" href="/faq">
                Read FAQ
              </Link>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Resource topics">
            <strong>Topics</strong>
            <span>Hostel installation planning</span>
            <span>Coverage and room layout</span>
            <span>Resident access and billing</span>
            <span>Supportable internet operations</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Owner reading</p>
            <h2>Start with the operational problem you are trying to solve.</h2>
            <p>
              Nister resources are written for real property decisions: what information to collect, how to compare
              billing models, and why managed access can matter as much as raw internet speed.
            </p>
          </div>
          <div className="resource-grid">
            {resourceArticles.map((article) => (
              <article className="resource-card" key={article.slug}>
                <span className="panel-label">{article.category}</span>
                <h3>{article.title}</h3>
                <p>{article.description}</p>
                <div className="resource-meta">
                  <span>{article.readingTime}</span>
                  <span>Updated {article.updatedAt}</span>
                </div>
                <Link className="inline-link" href={article.path}>
                  Read article
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
