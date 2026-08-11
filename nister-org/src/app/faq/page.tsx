import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS, faqItems } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about Nister Wi-Fi for hostels, resident access, payments, coverage and support.",
  alternates: {
    canonical: canonical("/faq"),
  },
  openGraph: {
    title: "FAQ | Nister Wi-Fi",
    description: "Answers for hostel owners and residents considering Nister Wi-Fi.",
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
            <h1>Questions hostel owners usually ask before bringing in Nister.</h1>
            <p className="hero-lede">
              Here are plain answers about coverage, resident access, payments, support and what happens after you ask
              for an assessment.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Hostel
              </Link>
              <a className="button button-secondary" href={EXTERNAL_LINKS.support}>
                WhatsApp Support
              </a>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="FAQ topics">
            <strong>Common questions</strong>
            <span>Can you use our fibre?</span>
            <span>Can residents pay?</span>
            <span>Who handles Wi-Fi problems?</span>
            <span>How do residents get online?</span>
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
