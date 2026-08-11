import Link from "next/link";
import { EXTERNAL_LINKS } from "@/lib/content";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

const painPoints = [
  {
    title: "Wi-Fi does not reach every room.",
    body: "A connection at reception is not enough when residents live across rooms, floors and separate buildings.",
  },
  {
    title: "Shared passwords spread.",
    body: "One password is easy to pass around. After a while, it is hard to know who should have access.",
  },
  {
    title: "Internet payments become manual work.",
    body: "If residents pay separately, someone has to track who paid, who expired and who needs help.",
  },
  {
    title: "Complaints come back to you.",
    body: "When the internet stops working, residents usually come to the hostel first.",
  },
] as const;

const serviceCards = [
  {
    title: "Better coverage",
    body: "We help plan Wi-Fi around your rooms, floors and buildings instead of simply putting a router somewhere and hoping for the best.",
  },
  {
    title: "Easier resident access",
    body: "Residents get their own way to access the service instead of everyone sharing one password.",
  },
  {
    title: "Easier payments",
    body: "If residents pay for internet separately, Nister helps manage payments and access without you collecting money manually.",
  },
  {
    title: "A simple dashboard",
    body: "See what is happening at your hostel, including resident purchases and what your hostel earns where applicable.",
  },
] as const;

const hostelOptions = [
  {
    badge: "Residents pay",
    title: "Residents pay for internet",
    body: "Your residents buy the internet access they need. Nister handles the access system and helps you keep track of what your hostel earns.",
    bullets: [
      "Residents choose the access they need.",
      "Payments and access work together.",
      "You avoid manual internet collection.",
      "You can see your hostel's share.",
    ],
    cta: "I Want Residents to Pay",
  },
  {
    badge: "Included Wi-Fi",
    title: "Wi-Fi is included",
    body: "Want internet to be part of the accommodation instead? Nister can help you offer managed Wi-Fi as a hostel amenity.",
    bullets: [
      "Internet is part of what residents receive.",
      "The resident promise is simpler.",
      "Nister helps manage the Wi-Fi service.",
      "Your hostel can offer a clearer amenity.",
    ],
    cta: "I Want Wi-Fi Included",
  },
  {
    badge: "Selected hostels",
    title: "Nister helps with the investment",
    body: "For selected hostels, Nister may be willing to help fund the network setup in return for an agreed business arrangement.",
    bullets: [
      "Useful when upfront setup cost is the blocker.",
      "We review the hostel before deciding.",
      "The arrangement is agreed before installation.",
      "Funding depends on the hostel and is not guaranteed.",
    ],
    cta: "Ask About Nister Funding",
  },
] as const;

const dashboardRows = [
  ["Residents Online", "183"],
  ["Internet Sales", "GHS 2,480"],
  ["Your Earnings", "GHS 620"],
  ["Network Status", "Online"],
  ["Access Points", "12 Online"],
  ["Recent Transactions", "Live"],
] as const;

const dashboardDetails = [
  ["Residents Online", "See how busy your hostel network is."],
  ["Internet Sales", "See internet purchases at your hostel."],
  ["Your Earnings", "See your hostel's share where this applies."],
  ["Network Status", "Know whether the service is running normally."],
  ["Recent Transactions", "Review recent activity without running the network yourself."],
] as const;

const steps = [
  {
    title: "Tell us about your hostel",
    body: "Where is it? How many rooms? Roughly how many residents?",
  },
  {
    title: "We assess what you need",
    body: "We look at the hostel, the internet you already have and what you want to achieve.",
  },
  {
    title: "We agree on the setup",
    body: "You decide whether residents will pay, Wi-Fi will be included, or another arrangement makes more sense.",
  },
  {
    title: "We get your hostel connected",
    body: "Nister helps deploy and manage the service so residents can get online.",
  },
] as const;

const faqs = [
  {
    question: "Can I use Nister if my hostel already has fibre?",
    answer:
      "Yes, potentially. You may not need to replace a suitable connection. Nister can help manage the Wi-Fi service around it.",
  },
  {
    question: "Can my hostel earn from Wi-Fi?",
    answer:
      "Yes, where residents pay for their own internet and the arrangement makes sense for your hostel. We discuss this before anything is installed.",
  },
  {
    question: "Do I have to run the network myself?",
    answer:
      "No. That is the point of Nister. You run the hostel while we help manage the Wi-Fi service around it.",
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
            <h1>Better Wi-Fi for your residents. Less work for you.</h1>
            <p className="hero-lede">
              Your residents expect internet that works in their rooms. Nister helps you set up and manage your hostel
              Wi-Fi, control resident access, handle internet payments and see what the service is earning without
              making you run the network yourself.
            </p>
            <div className="button-row">
              <Link className="button button-primary" href="/request-installation">
                Assess My Hostel
              </Link>
              <Link className="button button-secondary" href="/how-it-works">
                See How Nister Works
              </Link>
            </div>
            <p className="hero-assurance">
              No commitment. Tell us about your hostel and we&apos;ll help you figure out what makes sense.
            </p>
          </div>

          <div className="network-visual dashboard-preview" aria-label="Dashboard Preview">
            <div className="visual-topline">
              <span>Dashboard Preview</span>
              <strong>Hostel view</strong>
            </div>
            <div className="preview-title">
              <span>VOLTA VIEW HOSTEL</span>
              <strong>Your hostel at a glance</strong>
            </div>
            <div className="dashboard-preview-grid">
              {dashboardRows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="utility-strip" aria-label="Already using Nister">
        <div className="shell utility-grid">
          <div>
            <strong>Already using Nister?</strong>
            <span>Get online or manage your existing access.</span>
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
            <h2>You have a hostel to run. Wi-Fi should not become another full-time job.</h2>
            <p>
              Your residents complain when the Wi-Fi does not reach their rooms. Shared passwords spread. Someone has to
              keep track of who has paid. Someone has to deal with access when a resident&apos;s package expires.
            </p>
            <p>Nister helps take that work off your plate.</p>
          </div>
          <div className="check-list">
            {painPoints.map((point) => (
              <p key={point.title}>
                <strong>{point.title}</strong>
                <span>{point.body}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <h2>You run the hostel. We help run the Wi-Fi.</h2>
          </div>
          <div className="section-copy">
            <p>Getting internet into the building is usually the easy part.</p>
            <p>
              Running that internet well for 100, 200 or 500 residents is where things become difficult. Nister manages
              what happens after the internet reaches your hostel.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <h2>Everything around the connection, managed.</h2>
            <p>Give your residents a better way to connect while you get a clearer way to manage the service.</p>
          </div>
          <div className="public-card-grid">
            {serviceCards.map((card) => (
              <article className="public-card" key={card.title}>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell section-grid">
          <div>
            <h2>Already have fibre? Great.</h2>
            <p>
              You may not need to replace it. If your current internet connection is suitable, Nister can help you
              manage the Wi-Fi around it.
            </p>
            <p>
              Your provider brings internet to the building. Nister helps you turn that connection into a service your
              residents can actually use.
            </p>
          </div>
          <div className="flow-list">
            <span>Internet reaches your hostel</span>
            <span>Nister helps plan coverage</span>
            <span>Residents get structured access</span>
            <span>Payments can connect to access</span>
            <span>You see what is happening</span>
          </div>
        </div>
      </section>

      <section className="section commercial-section">
        <div className="shell">
          <div className="section-heading">
            <h2>Your internet can do more than cost you money every month.</h2>
            <p>
              If you want residents to pay for their own internet, Nister can help you run that service and track your
              hostel&apos;s share.
            </p>
            <p>
              The internet you already need can help recover its own cost or create an additional source of income for
              your hostel.
            </p>
          </div>
          <div className="service-grid">
            {hostelOptions.map((option) => (
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

      <section className="section">
        <div className="shell section-grid">
          <div>
            <h2>See what&apos;s happening at your hostel from your Nister dashboard.</h2>
            <p>
              See residents online, internet sales, your earnings, network status and recent transactions in one place.
            </p>
            <Link className="inline-link inline-link-bright" href="/how-it-works">
              See How Nister Works
            </Link>
          </div>
          <div className="public-list-panel">
            {dashboardDetails.map(([title, body]) => (
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
            <h2>Getting started is simple.</h2>
          </div>
          <div className="steps-grid steps-grid-four">
            {steps.map((step, index) => (
              <article className="step-card" key={step.title}>
                <span>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
          <div className="button-row section-actions">
            <Link className="button button-primary" href="/request-installation">
              Assess My Hostel
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell section-grid">
          <div>
            <h2>Can&apos;t I just buy some routers myself?</h2>
          </div>
          <div className="section-copy">
            <p>You can. The routers are not the hard part.</p>
            <p>
              The real work starts afterwards: who gets access, who has paid, how long access should last, what happens
              when passwords spread, and who keeps track of what the service is earning.
            </p>
            <p>That is where Nister comes in.</p>
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading">
            <h2>Questions hostel owners usually ask.</h2>
            <p>These are the practical questions that usually come up before a hostel asks for an assessment.</p>
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
            <h2>Tell us about your hostel and we&apos;ll figure out what makes sense.</h2>
            <p>
              Share the location, room count, resident count and what your internet looks like today. We&apos;ll review it
              and recommend the setup that makes sense.
            </p>
            <p>No commitment to install.</p>
          </div>
          <div className="button-row">
            <Link className="button button-primary" href="/request-installation">
              Assess My Hostel
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
