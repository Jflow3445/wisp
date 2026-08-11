import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS, faqItems } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about Nister Wi-Fi installation, coverage, payment models, resident access, and support.",
  alternates: {
    canonical: canonical("/faq"),
  },
  openGraph: {
    title: "FAQ | Nister Wi-Fi",
    description:
      "Answers for hostel owners, operators, and residents considering Nister Wi-Fi access.",
    url: canonical("/faq"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

export default function FaqPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "FAQ", path: "/faq" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="faq" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">FAQ</p>
            <h1>Frequently asked questions about Nister Wi-Fi.</h1>
            <p className="hero-lede">
              These answers cover the public acquisition flow: property assessment requests, coverage review, payment models,
              resident access, owner onboarding, and support routing.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Property
              </Link>
              <a className="button button-secondary" href={EXTERNAL_LINKS.support}>
                WhatsApp Support
              </a>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="FAQ topics">
            <strong>Common topics</strong>
            <span>Installation review</span>
            <span>Coverage requests</span>
            <span>Payment and access</span>
            <span>Support for owners and residents</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell faq-list">
          {faqItems.map((item) => (
            <article className="faq-item" key={item.question}>
              <h2>{item.question}</h2>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
