import Link from "next/link";
import { EXTERNAL_LINKS } from "@/lib/content";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

const problemCards = [
  {
    title: "Residents need Wi-Fi where they actually live.",
    body:
      "A connection at reception is not enough when residents spend their time in rooms across multiple floors or buildings.",
  },
  {
    title: "One shared password quickly becomes difficult to control.",
    body:
      "Nister gives residents structured access instead of relying on a password that can spread indefinitely.",
  },
  {
    title: "Collecting internet money should not become another administrative job.",
    body:
      "Where residents pay individually, Nister connects eligible purchases with the resident access experience.",
  },
  {
    title: "Owners should know what is happening.",
    body:
      "Approved property owners get a clearer view of their property, transactions, network status and applicable revenue information.",
  },
] as const;

const productCards = [
  {
    title: "Wi-Fi built around the property",
    body: "Plan connectivity around your buildings, floors, rooms and expected number of residents.",
  },
  {
    title: "Resident access you can manage",
    body: "Give residents structured access instead of depending on one shared Wi-Fi password.",
  },
  {
    title: "Payments connected to access",
    body:
      "Where residents pay separately, Nister helps turn purchases into a manageable resident internet service.",
  },
  {
    title: "Information owners can actually use",
    body:
      "See the property, network status, relevant transactions and your share where revenue sharing applies.",
  },
] as const;

const commercialOptions = [
  {
    badge: "Most Flexible",
    title: "You own the setup. Nister helps you run it.",
    body:
      "Purchase the network equipment and connectivity for your property, then let Nister manage the technology around resident access, payments and reporting.",
    bullets: [
      "Keep ownership of your network equipment.",
      "Give residents structured access.",
      "Choose resident-paid internet where appropriate.",
      "Track eligible property revenue.",
    ],
    cta: "Assess My Property",
  },
  {
    badge: "Included Wi-Fi",
    title: "Make Wi-Fi part of the accommodation.",
    body:
      "Prefer a simpler experience for residents? Include internet with accommodation and let Nister manage the Wi-Fi service for the property.",
    bullets: [
      "No separate internet purchase required from residents.",
      "Internet becomes a hostel amenity.",
      "Professional network management.",
      "Simpler resident experience.",
    ],
    cta: "Explore Included Wi-Fi",
  },
  {
    badge: "Assessed Individually",
    title: "For selected properties, Nister can invest too.",
    body:
      "Properties with suitable demand and deployment economics may be considered for infrastructure funded by Nister under an agreed commercial arrangement.",
    bullets: [
      "Reduced upfront infrastructure burden where approved.",
      "Nister participates directly in the deployment.",
      "Commercial terms agreed before installation.",
      "Nister-funded deployments are not guaranteed.",
    ],
    cta: "Ask About Nister Funding",
  },
] as const;

const reportingCards = [
  ["Residents Online", "See current connected-user information where available."],
  ["Network Status", "Get a simple view of whether your property network is operating normally."],
  ["Resident Purchases", "See purchases attributed to the property."],
  ["Your Share", "See the property amount calculated under the agreed commercial terms."],
  ["Request Progress", "Follow your property from assessment through installation and activation."],
] as const;

const ownerSteps = [
  {
    title: "Tell us about the property",
    body:
      "Give us the location, approximate rooms and residents, and a little information about the internet you have today.",
  },
  {
    title: "We assess what makes sense",
    body:
      "Nister reviews the property, expected demand and existing connectivity before recommending an arrangement.",
  },
  {
    title: "We set up the service",
    body:
      "Once everything is agreed, the network and Nister services are configured for the property.",
  },
  {
    title: "Residents connect. You get visibility.",
    body:
      "Residents use Nister while approved owners can see relevant information from the property dashboard.",
  },
] as const;

const faqs = [
  {
    question: "Can I use Nister if my hostel already has fibre?",
    answer:
      "Yes, potentially. Nister does not necessarily need to replace a suitable existing internet connection. We can manage the resident Wi-Fi, access and payment layer around it.",
  },
  {
    question: "Can my hostel earn from Wi-Fi?",
    answer:
      "Yes, where the agreed arrangement allows residents to purchase access individually. Eligible purchases can be attributed to the property and divided according to its commercial terms with Nister.",
  },
  {
    question: "Does Nister give owners access to the routers?",
    answer:
      "No. The owner portal shows approved property information, request progress and read-only reporting. Router, firewall, plan and resident-account controls stay with Nister administrators.",
  },
] as const;

export function NisterWifiHome() {
  return (
    <main className="site-page">
      <SiteNav active="home" />

      <section className="hero-section">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Managed Wi-Fi for Hostels</p>
            <h1>Make your hostel internet easier to run - and more valuable to your property.</h1>
            <p className="hero-lede">
              Nister helps you manage Wi-Fi, resident access and payments across your property. Give residents a better
              way to connect while choosing whether internet is included, pays for itself or becomes an additional
              revenue stream.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Property
              </Link>
              <Link className="button button-secondary" href="/how-it-works">
                See How Nister Works
              </Link>
            </div>
            <p className="hero-assurance">
              No commitment. Tell us about your property and we&apos;ll recommend the setup that makes sense.
            </p>
          </div>

          <div className="network-visual dashboard-preview" aria-label="Dashboard Preview">
            <div className="visual-topline">
              <span>Dashboard Preview</span>
              <strong>Owner view</strong>
            </div>
            <div className="preview-title">
              <span>NISTER PROPERTY</span>
              <strong>Your property at a glance</strong>
            </div>
            <div className="dashboard-preview-grid">
              <div>
                <span>Network</span>
                <strong>Online</strong>
              </div>
              <div>
                <span>Residents Online</span>
                <strong>Available after approval</strong>
              </div>
              <div>
                <span>Gross Resident Purchases</span>
                <strong>Read-only reporting</strong>
              </div>
              <div>
                <span>Your Share</span>
                <strong>Based on agreed terms</strong>
              </div>
              <div>
                <span>Requests</span>
                <strong>Assessment</strong>
              </div>
              <div>
                <span>Transactions</span>
                <strong>Read-only</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="utility-strip" aria-label="Already using Nister">
        <div className="shell utility-grid">
          <div>
            <strong>Already using Nister?</strong>
            <span>Use the existing resident routes. These services have not moved.</span>
          </div>
          <div className="button-row">
            <a className="button button-secondary button-on-light" href={EXTERNAL_LINKS.network}>
              Get Online
            </a>
            <a className="button button-secondary button-on-light" href={EXTERNAL_LINKS.login}>
              Manage Access
            </a>
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">The property problem</p>
            <h2>Getting internet into the building is the easy part.</h2>
            <p>
              Fibre, routers and access points can give a hostel internet. Running that internet well for dozens or
              hundreds of residents is where things become difficult.
            </p>
          </div>
          <div className="check-list">
            {problemCards.map((card) => (
              <p key={card.title}>
                <strong>{card.title}</strong>
                <span>{card.body}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">What Nister manages</p>
            <h2>Nister manages what happens after the internet reaches your property.</h2>
          </div>
          <div className="section-copy">
            <p>You focus on running the hostel. Nister helps run the connectivity service around it.</p>
            <p>
              Already have fibre? Good. You do not necessarily need another internet provider. If your property already
              has a suitable connection, Nister can work around it and manage the systems residents interact with,
              including access, payments and the wider Wi-Fi service.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Managed resident service</p>
            <h2>Everything around the connection, managed.</h2>
            <p>
              Nister helps properties set up and manage resident Wi-Fi, access, payments and reporting without
              requiring the property owner to operate all of the technology themselves.
            </p>
          </div>
          <div className="public-card-grid">
            {productCards.map((card) => (
              <article className="public-card" key={card.title}>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section commercial-section">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Commercial options</p>
            <h2>Your internet does not have to be just another monthly bill.</h2>
            <p>
              Once internet is properly managed, a hostel has choices. You can let residents pay for access, include
              Wi-Fi with accommodation or, for selected properties, explore a Nister-funded deployment.
            </p>
          </div>
          <div className="service-grid">
            {commercialOptions.map((option) => (
              <article className="service-card commercial-card" key={option.title}>
                <span className="panel-label">{option.badge}</span>
                <h3>{option.title}</h3>
                <p>{option.body}</p>
                <ul>
                  {option.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <Link className="inline-link inline-link-bright" href="/request-installation">
                  {option.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">Cost recovery</p>
            <h2>If residents pay for internet, your property can share in the value it creates.</h2>
            <p>
              With a resident-paid Nister setup, eligible resident purchases can be attributed to the property and
              divided according to the commercial terms agreed with Nister.
            </p>
            <p>
              Revenue is optional, not the entire Nister model. Properties that prefer to include internet with
              accommodation can do that too.
            </p>
          </div>
          <div className="flow-list">
            <span>Resident buys access</span>
            <span>Payment confirmed</span>
            <span>Internet access applied</span>
            <span>Purchase attributed to property</span>
            <span>Property share recorded</span>
            <span>Owner sees reporting</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">Owner dashboard</p>
            <h2>See what matters without becoming the network engineer.</h2>
            <p>
              Approved owners can view linked property details, high-level network state, read-only revenue, owner share
              and transactions without router or payment-approval controls.
            </p>
            <Link className="inline-link inline-link-bright" href="/how-it-works">
              See How Nister Works
            </Link>
          </div>
          <div className="public-list-panel">
            {reportingCards.map(([title, body]) => (
              <p key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading compact">
            <p className="eyebrow">How it works</p>
            <h2>From hostel to connected residents.</h2>
          </div>
          <div className="steps-grid steps-grid-four">
            {ownerSteps.map((step, index) => (
              <article className="step-card" key={step.title}>
                <span>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
          <div className="button-row section-actions">
            <Link className="button button-primary" href="/request-installation">
              Assess My Property
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">Honest fit</p>
            <h2>Could you install some routers yourself? Absolutely.</h2>
          </div>
          <div className="section-copy">
            <p>
              Nister is not built on pretending that Wi-Fi equipment is difficult to buy. The value comes after
              installation: managing coverage, resident access, packages, payments, reporting and the day-to-day service
              around the connection.
            </p>
            <p>Nister is for hostel owners who would rather run their property than run all of that themselves.</p>
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Product proof</p>
            <h2>Built around a working resident access platform.</h2>
            <p>
              Nister&apos;s owner platform sits around the existing Nister Wi-Fi service residents use to get online,
              manage access and purchase eligible service. Public claims stay practical until real property case studies
              can be published with permission.
            </p>
          </div>
          <div className="faq-list home-faq-list">
            {faqs.map((faq) => (
              <article className="faq-item" key={faq.question}>
                <h2>{faq.question}</h2>
                <p>{faq.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="shell cta-panel">
          <div>
            <p className="eyebrow">Request Nister</p>
            <h2>What could better-managed internet do for your property?</h2>
            <p>
              Tell us where your hostel is, roughly how many rooms and residents it has, and what your internet
              situation looks like today. We&apos;ll use that information to understand what kind of Nister setup could
              make sense.
            </p>
            <p>No account required to send your property details. No commitment to install.</p>
          </div>
          <div className="button-row">
            <Link className="button button-primary" href="/request-installation">
              Request My Property Assessment
            </Link>
            <Link className="button button-secondary" href="/how-it-works">
              See How Nister Works
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
