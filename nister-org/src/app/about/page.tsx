import type { Metadata } from "next";
import Link from "next/link";
import { EXTERNAL_LINKS } from "@/lib/content";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "About",
  description: "About Nister Wi-Fi and how it helps hostels manage resident internet.",
  alternates: {
    canonical: canonical("/about"),
  },
  openGraph: {
    title: "About Nister Wi-Fi",
    description: "Nister helps hostels make internet easier to run and more useful to the property.",
    url: canonical("/about"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const principles = [
  {
    title: "Internet should work where residents live",
    body: "A hostel needs Wi-Fi planned around rooms, floors and buildings, not just a connection at the entrance.",
  },
  {
    title: "Access should be easier to manage",
    body: "Residents need a clear way to connect, pay where needed and get help without everyone sharing one password.",
  },
  {
    title: "Your hostel should see what is happening",
    body: "If internet is part of your property, you should be able to see the service, the usage and the earnings where they apply.",
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
            <h1>We help hostels make internet easier to run.</h1>
            <p className="hero-lede">
              Nister helps hostel owners manage resident Wi-Fi, access and payments without becoming responsible for the
              whole network themselves.
            </p>
            <p className="hero-assurance">
              Already have fibre? Great. We may be able to work with it.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Hostel
              </Link>
              <a className="button button-secondary" href={EXTERNAL_LINKS.network}>
                Get Online
              </a>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Nister focus">
            <strong>What we handle</strong>
            <span>Hostel Wi-Fi planning</span>
            <span>Resident access</span>
            <span>Internet payments</span>
            <span>Dashboard visibility</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell section-grid">
          <div>
            <h2>Internet is not just a monthly bill. It is part of the resident experience.</h2>
          </div>
          <div className="section-copy">
            <p>
              Residents use internet to study, call home, work, stream classes, make payments and stay connected. When
              Wi-Fi is weak or hard to manage, the frustration becomes a hostel problem.
            </p>
            <p>
              Nister exists to help hostels turn internet into a managed service instead of another headache.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-heading">
            <h2>What guides our work.</h2>
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
