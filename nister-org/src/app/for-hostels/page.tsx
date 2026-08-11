import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "For Hostels",
  description:
    "Managed Wi-Fi for hostels that need better coverage, easier resident access, simpler payments and clearer visibility.",
  alternates: {
    canonical: canonical("/for-hostels"),
  },
  openGraph: {
    title: "For Hostels | Nister Wi-Fi",
    description: "Give your residents better internet without running the network yourself.",
    url: canonical("/for-hostels"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const needs = [
  "Coverage across rooms, floors and separate buildings.",
  "A better way for residents to get access.",
  "Payments that work with internet access when residents pay separately.",
  "Someone who understands the Wi-Fi system when something goes wrong.",
] as const;

const benefits = [
  {
    title: "Better coverage",
    body: "We look at the hostel layout and plan Wi-Fi around where residents actually live.",
  },
  {
    title: "Resident access",
    body: "Residents use a structured access process instead of depending on a shared password.",
  },
  {
    title: "Payments",
    body: "If residents pay for internet, Nister helps connect payment and access so you are not collecting manually.",
  },
  {
    title: "Network management",
    body: "Nister helps manage the Wi-Fi service so you do not have to become the network person.",
  },
  {
    title: "Hostel visibility",
    body: "See what is happening at your hostel from your dashboard.",
  },
  {
    title: "Optional revenue",
    body: "Where residents pay for internet, your hostel can see what the service is earning.",
  },
] as const;

export default function ForHostelsPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "For Hostels", path: "/for-hostels" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="for-hostels" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">Wi-Fi without the headache</p>
            <h1>Give your residents better internet without running the network yourself.</h1>
            <p className="hero-lede">
              A hostel with 200 residents does not have the same Wi-Fi problem as a family home. You need coverage
              across rooms and floors. You need to know who should have access. If residents pay separately, you need
              payments and internet access to work together.
            </p>
            <p className="hero-assurance">That&apos;s what Nister is built to handle.</p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Hostel
              </Link>
              <Link className="button button-secondary" href="/how-it-works">
                See How Nister Works
              </Link>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="What your hostel needs">
            <strong>Your hostel needs</strong>
            {needs.map((need) => (
              <span key={need}>{need}</span>
            ))}
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <h2>Nister helps with the parts that become difficult after installation.</h2>
            <p>
              Routers and internet connections matter, but the daily work is access, payments, coverage and support.
            </p>
          </div>
          <div className="service-grid">
            {benefits.map((benefit) => (
              <article className="service-card" key={benefit.title}>
                <h3>{benefit.title}</h3>
                <p>{benefit.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <h2>Already have fibre? We may be able to work with it.</h2>
          </div>
          <div className="section-copy">
            <p>
              Your current provider may already bring a good connection to the building. Nister can help turn that
              connection into a managed Wi-Fi service residents can actually use.
            </p>
            <p>
              Tell us what you have today, what residents complain about and what you want the internet to do for your
              hostel.
            </p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="shell cta-panel">
          <div>
            <h2>Tell us about your hostel.</h2>
            <p>
              Share the location, number of rooms, approximate residents and current internet situation. We&apos;ll help you
              figure out what makes sense.
            </p>
          </div>
          <div className="button-row">
            <Link className="button button-primary" href="/request-installation">
              Assess My Hostel
            </Link>
            <Link className="button button-secondary" href="/plans">
              Explore My Options
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
