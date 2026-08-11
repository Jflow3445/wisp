import type { Metadata } from "next";
import Link from "next/link";
import { resourceArticles } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "Practical guides for hostel owners thinking about Wi-Fi coverage, access, payments and installation decisions.",
  alternates: {
    canonical: canonical("/resources"),
  },
  openGraph: {
    title: "Resources | Nister Wi-Fi",
    description: "Practical guides for getting hostel Wi-Fi right.",
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
            <p className="eyebrow">Guides</p>
            <h1>Practical guides for getting hostel Wi-Fi right.</h1>
            <p className="hero-lede">
              Whether you already have fibre or are starting from scratch, these guides will help you understand
              coverage, access, payments and what to consider before installing Wi-Fi at your hostel.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Hostel
              </Link>
              <Link className="button button-secondary" href="/faq">
                Read FAQ
              </Link>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Resource topics">
            <strong>Useful when you are thinking about</strong>
            <span>Coverage inside rooms</span>
            <span>Resident payments</span>
            <span>Shared password problems</span>
            <span>Installation questions</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <h2>Start with the question closest to your hostel.</h2>
            <p>These articles are written for practical decisions before you spend money or promise residents Wi-Fi.</p>
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
