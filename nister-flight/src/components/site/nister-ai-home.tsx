import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
import { PremiumMarketingFooter } from "@/components/site/premium-marketing-footer";
import { PremiumMarketingNav } from "@/components/site/premium-marketing-nav";
import { getActivePricingPlans, getPlatformSettings } from "@/lib/site";
import {
  buildBreadcrumbJsonLd,
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/seo";

const painCards = [
  {
    title: "Late entries and missed setups",
    body: "By the time you click, the clean entry is gone and the move has already expanded.",
  },
  {
    title: "Early exits and over-editing",
    body: "Fear pushes you to cut winners too soon or keep moving stops and targets after entry.",
  },
  {
    title: "Revenge trading after losses",
    body: "One bad result can trigger reactive trades that ignore the original plan and risk boundaries.",
  },
];

const outcomeCards = [
  {
    label: "01",
    title: "Autonomous strategy",
    body: "The strategy logic is fixed and runs on the model. Users and admins cannot modify trade selection.",
  },
  {
    label: "02",
    title: "Hands-off execution",
    body: "After setup and activation, orders are placed only when the model signal and your risk settings align.",
  },
  {
    label: "03",
    title: "Risk boundaries",
    body: "You control risk per trade and daily caps. The strategy remains fixed while risk limits stay configurable.",
  },
  {
    label: "04",
    title: "Full account ownership",
    body: "Trading funds stay in your own broker account while Nister AI remains a separate subscription service.",
  },
];

const trustBullets = [
  "Your broker account stays in your name.",
  "Your funds stay with your broker.",
  "We do not pool capital or route money through a third party.",
  "You can set risk boundaries, pause automation, and choose Local or Managed VPS runtime.",
];

const operatingSteps = [
  {
    title: "Create your workspace",
    body: "Sign up, verify your email, and choose the market and plan you want to activate.",
  },
  {
    title: "Pick your runtime",
    body: "Choose Local for your own device or Managed VPS for hosted continuity. The trading strategy is the same in both.",
  },
  {
    title: "Connect broker and set risk",
    body: "Link a supported broker account and define risk per trade and daily limits before activation.",
  },
  {
    title: "Subscribe and complete setup",
    body: "Activate billing and complete app checks for your runtime path, then submit for review and activation.",
  },
  {
    title: "Monitor and control",
    body: "Track connection status, trades, P/L, and risk usage from the dashboard. Pause the system any time.",
  },
];

const runtimeCards = [
  {
    title: "Local runtime",
    kicker: "Lean control",
    body: "Runs on your own computer and internet connection. Best when you want lower monthly cost and direct environment control.",
    bullets: [
      "Lower monthly cost",
      "Runs through your own device and connection",
      "You manage device, power, and internet stability",
    ],
    cta: "Choose Local",
  },
  {
    title: "Managed VPS runtime",
    kicker: "Priority continuity",
    body: "Runs in a hosted 24/7 environment. Best when you want less device dependence and stronger runtime continuity.",
    bullets: [
      "Hosted runtime environment",
      "Reduced dependency on your own machine",
      "Continuity-focused operations and monitoring",
    ],
    cta: "Choose Managed VPS",
  },
];

type MarketKey = "marketForexEnabled" | "marketStocksEnabled" | "marketOptionsEnabled";

const marketCards = [
  {
    title: "Forex automation",
    body: "The live/default path for traders who want signal-gated Forex Trading through their own broker account.",
    href: "/forex-ai-trading-automation",
    cta: "Open Forex Playbook",
    marketKey: "marketForexEnabled" as MarketKey,
  },
  {
    title: "Stocks automation",
    body: "A staged rollout path for traders who want stock execution discipline without sending trading funds to Nister AI.",
    href: "/stocks-ai-trading-automation",
    cta: "Open Stocks Playbook",
    marketKey: "marketStocksEnabled" as MarketKey,
  },
  {
    title: "Options automation",
    body: "A staged rollout path for options traders who need strict limits before any fast-moving order flow is enabled.",
    href: "/options-ai-trading-automation",
    cta: "Open Options Playbook",
    marketKey: "marketOptionsEnabled" as MarketKey,
  },
  {
    title: "Companion runtime",
    body: "The app/runtime layer that connects Nister AI to the approved trading environment and reports status back to the dashboard.",
    href: "/companion-app-automation",
    cta: "Inspect Runtime Guide",
    marketKey: null,
    statusClass: "premium-status-gold",
  },
];

const traderFit = [
  "Traders who want fully autonomous execution with fixed strategy logic",
  "Traders who want to keep broker-account ownership and fund custody",
  "Traders who want to set risk boundaries without hand-clicking each order",
  "Traders who accept that inactivity can be normal when no valid signal exists",
];

const traderRejects = [
  "Expecting guaranteed profits or fixed monthly returns",
  "Wanting to override the AI strategy trade by trade",
  "Copy-trading dependence or signal-room mirroring",
  "Ignoring setup rules, risk boundaries, or disclosure terms",
];

export async function NisterAiHome() {
  const [plans, settings] = await Promise.all([getActivePricingPlans(), getPlatformSettings()]);
  const localPlan = plans.find((plan) => plan.tier === "BASIC");
  const managedPlan = plans.find((plan) => plan.tier === "PRO_MANAGED");
  const liveMarketCount = [settings.marketForexEnabled, settings.marketStocksEnabled, settings.marketOptionsEnabled].filter(Boolean).length;
  const surfaceLive = liveMarketCount > 0;
  const isMarketLive = (marketKey: MarketKey | null) => (marketKey ? settings[marketKey] : null);

  return (
    <main className="premium-home">
      <JsonLd data={buildOrganizationJsonLd()} />
      <JsonLd data={buildWebSiteJsonLd()} />
      <JsonLd
        data={buildSoftwareApplicationJsonLd({
          path: "/",
          headline: "Nister AI autonomous Forex Trading through user-owned broker accounts",
          summary:
            "Nister AI helps traders run signal-gated Forex Trading through their own broker account with configurable risk controls, dashboard visibility, and Local or Managed VPS runtime choices.",
        })}
      />
      <JsonLd
        data={buildBreadcrumbJsonLd({
          items: [{ name: "Home", path: "/" }],
        })}
      />
      <PremiumMarketingNav current="home" />

      <section className="premium-hero" id="top">
        <div className="premium-shell premium-hero-grid">
          <div className="premium-hero-copy">
            <p className="premium-eyebrow">Automated forex trading through your broker account</p>
            <h1 className="premium-hero-title">
              <span>Nister Ai monitors markets 24/7 and executes through your own broker account.</span>
            </h1>
            <p className="premium-hero-subhead">
              Nister AI runs a fully autonomous strategy. You cannot change trade selection and we cannot override the
              model plan. You set risk boundaries, keep your funds with your broker, and monitor results from the
              dashboard.
            </p>
            <div className="premium-hero-actions">
              <Link href="/signup?market=forex" className="premium-btn premium-btn-primary premium-btn-lg">
                Start Forex Setup
              </Link>
              <Link href="/local-vs-managed-vps-trading-automation" className="premium-btn premium-btn-secondary premium-btn-lg">
                Compare Local vs Managed VPS
              </Link>
            </div>
            <div className="premium-inline-metrics">
              <span className="premium-metric-chip premium-status-live">
                <i className="premium-status-dot" aria-hidden="true" />
                Your broker account stays yours
              </span>
              <span className="premium-metric-chip premium-status-gold">
                <i className="premium-status-dot" aria-hidden="true" />
                Local and Managed VPS
              </span>
              <span className="premium-metric-chip premium-status-pending">
                <i className="premium-status-dot" aria-hidden="true" />
                Staged market rollout
              </span>
            </div>
          </div>

          <div className="premium-command-board">
            <div className="premium-command-head">
              <div>
                <p className="premium-command-title">Operating Snapshot</p>
                <p className="premium-hero-shell-note">Public operating snapshot</p>
              </div>
              <span className={`premium-status-pill ${surfaceLive ? "premium-status-live" : "premium-status-pending"}`}>
                <i className="premium-status-dot" aria-hidden="true" />
                {settings.marketForexEnabled ? "Forex live" : "Forex waitlist"}
              </span>
            </div>

            <div className="premium-command-grid">
              <article className="premium-stat-cell">
                <p className="premium-command-title">Live markets</p>
                <strong className="premium-accent">{liveMarketCount}/3</strong>
              </article>
              <article className="premium-stat-cell">
                <p className="premium-command-title">Runtime modes</p>
                <strong>2</strong>
              </article>
              <article className="premium-stat-cell">
                <p className="premium-command-title">Account transfers</p>
                <strong className="premium-gold">0</strong>
              </article>
            </div>

            <div className="premium-command-feed">
              <div className="premium-command-line" data-status="live">
                <strong>Autonomous trade decisions</strong>
                <span>The model determines entries and exits. Users and admins cannot manually choose trades.</span>
                <em className="premium-status-live">ACTIVE</em>
              </div>
              <div className="premium-command-line" data-status="gold">
                <strong>Risk-gated execution</strong>
                <span>Orders are placed only when risk settings are valid and the strategy signal is present.</span>
                <em className="premium-status-gold">PRIORITY</em>
              </div>
              <div className="premium-command-line" data-status="pending">
                <strong>Idle by design</strong>
                <span>No qualifying setup means no trade. Periods without activity are deliberate.</span>
                <em className="premium-status-pending">SYNCED</em>
              </div>
            </div>

            <div className="premium-command-foot">
              <span className="premium-hero-shell-note">System status: ready when setup, risk, and signal conditions align</span>
              <span className="premium-health-track" aria-hidden="true">
                <span style={{ width: "94%" }} />
              </span>
            </div>
          </div>
        </div>

      </section>

      <section className="premium-section premium-sub-tight">
        <div className="premium-shell">
          <header className="premium-section-head premium-centered">
            <p className="premium-section-label">Pain mirror</p>
            <h2>Three common trading problems Nister Ai addresses.</h2>
            <p>
              Manual trading often breaks at the execution point. These are the failure points Nister AI is built to
              reduce.
            </p>
          </header>

          <div className="premium-card-grid premium-card-grid-3">
            {painCards.map((card) => (
              <article key={card.title} className="premium-card">
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="premium-section premium-sub-tight">
        <div className="premium-shell">
          <header className="premium-section-head premium-centered">
            <p className="premium-section-label">What changes</p>
            <h2>What Nister AI changes operationally.</h2>
            <p>Execution follows fixed strategy logic while risk remains under your control.</p>
          </header>

          <div className="premium-card-grid premium-card-grid-4">
            {outcomeCards.map((card) => (
              <article key={card.title} className="premium-card">
                <span className="premium-card-icon">{card.label}</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="premium-section premium-sub-tight">
        <div className="premium-shell premium-split-grid">
          <article className="premium-reassure">
            <header className="premium-section-head">
              <p className="premium-section-label">Reality check</p>
              <h2>Use automation to remove hesitation, not to ignore risk.</h2>
            </header>
            <ul className="premium-list">
              <li>The strategy is autonomous and cannot be manually edited per trade.</li>
              <li>Risk boundaries must be set before live execution.</li>
              <li>No valid setup means no trade, even during long quiet periods.</li>
              <li>Trading remains risky and losses are possible.</li>
            </ul>
            <div className="premium-center-cta">
              <Link href="/pricing" className="premium-btn premium-btn-secondary premium-btn-md">
                Compare Plans
              </Link>
            </div>
          </article>

          <article className="premium-reassure">
            <header className="premium-section-head">
              <p className="premium-section-label">Trust wall</p>
              <h2>Your account and capital stay under your control.</h2>
            </header>
            <ul className="premium-list">
              {trustBullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="premium-center-cta">
              <Link href="/guide" className="premium-btn premium-btn-secondary premium-btn-md">
                Read Setup Guide
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="premium-section premium-sub-tight">
        <div className="premium-shell">
          <header className="premium-section-head premium-centered">
            <p className="premium-section-label">Operating flow</p>
            <h2>How the setup and activation flow works.</h2>
            <p>
              Follow the sequence once so every required gate is clear before autonomous trading is enabled.
            </p>
          </header>

          <ol className="premium-setup-flow">
            {operatingSteps.map((step, index) => (
              <li key={step.title}>
                <div className="premium-flow-index">{index + 1}</div>
                <div className="premium-flow-copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="premium-section premium-sub-tight">
        <div className="premium-shell">
          <header className="premium-section-head premium-centered">
            <p className="premium-section-label">Runtime setup</p>
            <h2>Same AI engine, different hosting responsibility.</h2>
            <p>
              The strategy and risk model are the same in both plans. The difference is where the runtime operates.
            </p>
          </header>

          <div className="premium-plan-grid">
            {runtimeCards.map((card) => (
              <article
                key={card.title}
                className={`premium-price-card ${card.title === "Local runtime" ? "premium-plan-local" : "premium-plan-managed"}`}
              >
                <div className="premium-price-top">
                  <p className="premium-card-label">{card.kicker}</p>
                  <span className={`premium-status-pill ${card.title === "Local runtime" ? "premium-status-gold" : "premium-status-live"}`}>
                    <i className="premium-status-dot" aria-hidden="true" />
                    {card.title === "Local runtime" ? "Local" : "Managed VPS"}
                  </span>
                </div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <ul className="premium-list">
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
                <Link
                  href={(card.title === "Local runtime" ? localPlan?.ctaHref : managedPlan?.ctaHref) || "/signup"}
                  className={`premium-btn ${card.title === "Local runtime" ? "premium-btn-secondary" : "premium-btn-primary"} premium-btn-block`}
                >
                  {card.title === "Local runtime" ? "Start Local Setup" : "Start Managed VPS Setup"}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="premium-section premium-sub-tight">
        <div className="premium-shell">
          <header className="premium-section-head premium-centered">
            <p className="premium-section-label">Market playbooks</p>
            <h2>Rollout status by market</h2>
            <p>See which automation surfaces are live and which are still staged before you go further.</p>
          </header>

          <div className="premium-card-grid premium-card-grid-4">
            {marketCards.map((card) => (
              <article key={card.title} className="premium-card">
                <span className={`premium-status-pill ${isMarketLive(card.marketKey) === null ? card.statusClass : isMarketLive(card.marketKey) ? "premium-status-live" : "premium-status-pending"}`}>
                  <i className="premium-status-dot" aria-hidden="true" />
                  {isMarketLive(card.marketKey) === null ? "Operational guide" : isMarketLive(card.marketKey) ? "Live" : "Waitlist"}
                </span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <Link href={card.href} className="premium-btn premium-btn-secondary premium-btn-md">
                  {card.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="premium-section premium-sub-tight">
        <div className="premium-shell premium-split-grid">
          <article className="premium-reassure">
            <header className="premium-section-head">
            <p className="premium-section-label">Built for</p>
              <h2>Built for disciplined, risk-aware traders.</h2>
            </header>
            <ul className="premium-list">
              {traderFit.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="premium-reassure">
            <header className="premium-section-head">
            <p className="premium-section-label">Not this</p>
              <h2>Not built for guaranteed-return expectations.</h2>
            </header>
            <ul className="premium-list">
              {traderRejects.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="premium-section premium-final-cta">
        <div className="premium-shell">
          <article className="premium-cta-card">
            <p className="premium-section-label">Next step</p>
            <h2>Ready to start forex automation through your own broker account?</h2>
            <p>
              Start setup, choose your runtime, connect your broker account, and configure risk boundaries before
              activation. Review the risk disclosure before subscribing.
            </p>
            <p className="premium-cta-footnote">
              Risk notice: Trading involves real risk. There are no guaranteed profits, and losses are possible.
            </p>
            <div className="premium-cta-actions">
              <Link href="/signup?market=forex" className="premium-btn premium-btn-primary premium-btn-lg">
                Start Forex Setup
              </Link>
              <Link href="/pricing" className="premium-btn premium-btn-secondary premium-btn-lg">
                Compare Runtimes
              </Link>
            </div>
          </article>
        </div>
      </section>

      <PremiumMarketingFooter />
    </main>
  );
}
