import type { Metadata } from "next";
import Link from "next/link";
import { breadcrumbJsonLd, canonical, organizationJsonLd } from "@/lib/seo";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "What happens after you contact Nister about managed Wi-Fi for your hostel, from assessment to resident access.",
  alternates: {
    canonical: canonical("/how-it-works"),
  },
  openGraph: {
    title: "How It Works | Nister Wi-Fi",
    description: "See how Nister assesses your hostel, agrees the setup and helps residents get connected.",
    url: canonical("/how-it-works"),
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

const steps = [
  {
    title: "Tell us about your hostel",
    body: "Send the hostel name, town, location, number of rooms, approximate residents and what internet looks like there today.",
  },
  {
    title: "We assess the property",
    body: "We look at the rooms, floors, buildings, current connection and the problems your residents are already facing.",
  },
  {
    title: "We discuss the best way to provide the service",
    body: "Residents can pay for their own access, Wi-Fi can be included with accommodation, or we can recommend another practical setup.",
  },
  {
    title: "We agree on equipment and costs",
    body: "Before installation, you understand what is needed, what it will cost and how the service will be run.",
  },
  {
    title: "Nister installs and configures the service",
    body: "We help put the Wi-Fi system in place and prepare the resident access experience.",
  },
  {
    title: "Residents get connected",
    body: "Residents join Nister Wi-Fi, log in or buy access where needed, and use the internet.",
  },
  {
    title: "You manage the business side from your dashboard",
    body: "See your hostel details, service progress, network status and earnings where residents pay for internet.",
  },
] as const;

export default function HowItWorksPage() {
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "How It Works", path: "/how-it-works" },
  ]);

  return (
    <main className="site-page public-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <SiteNav active="how-it-works" />

      <section className="public-hero">
        <div className="shell public-hero-grid">
          <div>
            <p className="eyebrow">What happens next</p>
            <h1>What happens after I contact Nister?</h1>
            <p className="hero-lede">
              We start by understanding your hostel. Then we assess what it needs, discuss the best setup and help get
              residents connected.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Hostel
              </Link>
              <Link className="button button-secondary" href="/plans">
                Explore My Options
              </Link>
            </div>
          </div>
          <aside className="public-summary-panel" aria-label="Getting started with Nister">
            <strong>Simple sequence</strong>
            <span>Tell us about your hostel</span>
            <span>We assess what you need</span>
            <span>We agree on the setup</span>
            <span>Residents get connected</span>
          </aside>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading compact">
            <h2>From hostel assessment to connected residents.</h2>
          </div>
          <div className="steps-grid">
            {steps.map((step, index) => (
              <article className="step-card" key={step.title}>
                <span>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <h2>You do not need to know the perfect setup before you talk to us.</h2>
          </div>
          <div className="section-copy">
            <p>
              Some hostels already have fibre but poor room coverage. Some need a new Wi-Fi layout. Some want residents
              to pay for internet, while others want Wi-Fi included with accommodation.
            </p>
            <p>
              The assessment helps us recommend what makes sense for your hostel instead of selling you a one-size-fits-all
              package.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
