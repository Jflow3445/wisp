import { CONNECTIVITY_SOURCES, EXTERNAL_LINKS, homeSections, networkAccessSteps } from "@/lib/content";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

const proofCards = [
  {
    value: "2.2B",
    label: "people still offline",
  },
  {
    value: "83%",
    label: "urban internet use",
  },
  {
    value: "48%",
    label: "rural internet use",
  },
] as const;

const serviceCards = [
  {
    title: "Hostel Wi-Fi",
    body:
      "Clear shared access for student hostels where residents need internet for learning, communication, research, and daily services.",
  },
  {
    title: "Remote Community Access",
    body:
      "Practical connection points for areas where dependable internet is hard to get, maintain, or afford through standard service channels.",
  },
  {
    title: "Clear Access Path",
    body:
      "Simple public instructions: connect to Nister Wi-Fi, open wifi.nister.org, log in, and use the network after access is approved.",
  },
] as const;

export function NisterWifiHome() {
  const [accessGap, provision, hostel, remote, expansion] = homeSections;

  return (
    <main className="site-page">
      <SiteNav active="home" />

      <section className="hero-section">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Wi-Fi for study, work, and daily life</p>
            <h1>Get dependable internet closer to where people live and study.</h1>
            <p className="hero-lede">
              Hostel residents need to submit work, call home, research, pay, and stay connected. Remote communities
              need the same chance. Nister Wi-Fi brings practical shared access to places where getting online is still
              harder than it should be.
            </p>
            <div className="button-row">
              <a className="button button-primary" href={EXTERNAL_LINKS.coverageRequest}>
                Request Coverage
              </a>
              <a className="button button-secondary" href={EXTERNAL_LINKS.network}>
                Get Online
              </a>
            </div>
          </div>

          <div className="network-visual" aria-label="Nister Wi-Fi coverage model">
            <div className="visual-topline">
              <span>Hostel blocks</span>
              <strong>Connected access points</strong>
            </div>
            <div className="signal-map" aria-hidden="true">
              <span className="map-node map-node-large" />
              <span className="map-node map-node-small node-two" />
              <span className="map-node map-node-small node-three" />
              <span className="map-path path-one" />
              <span className="map-path path-two" />
              <span className="map-path path-three" />
            </div>
            <div className="visual-panel-grid">
              <div>
                <span className="panel-label">Use case</span>
                <strong>Student housing</strong>
              </div>
              <div>
                <span className="panel-label">Use case</span>
                <strong>Remote access</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Connectivity need statistics">
        <div className="shell proof-grid">
          {proofCards.map((card) => (
            <article className="proof-card" key={card.value}>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-light">
        <div className="shell section-grid">
          <div>
            <p className="eyebrow">{accessGap.eyebrow}</p>
            <h2>{accessGap.title}</h2>
          </div>
          <div className="section-copy">
            <p>{accessGap.body}</p>
            <div className="source-list">
              {CONNECTIVITY_SOURCES.map((source) => (
                <a href={source.href} key={source.href} rel="noreferrer" target="_blank">
                  {source.label}: {source.summary}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">{provision.eyebrow}</p>
            <h2>{provision.title}</h2>
            <p>{provision.body}</p>
          </div>
          <div className="service-grid">
            {serviceCards.map((card) => (
              <article className="service-card" key={card.title}>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell two-column">
          <article className="feature-panel">
            <p className="eyebrow">{hostel.eyebrow}</p>
            <h2>{hostel.title}</h2>
            <p>{hostel.body}</p>
          </article>
          <article className="feature-panel">
            <p className="eyebrow">{remote.eyebrow}</p>
            <h2>{remote.title}</h2>
            <p>{remote.body}</p>
          </article>
        </div>
      </section>

      <section className="section expansion-section">
        <div className="shell expansion-grid">
          <div>
            <p className="eyebrow">{expansion.eyebrow}</p>
            <h2>{expansion.title}</h2>
            <p>{expansion.body}</p>
          </div>
          <div className="expansion-list">
            <div>
              <strong>Why this</strong>
              <span>People rely on internet access for learning, work, services, and community participation.</span>
            </div>
            <div>
              <strong>Why Nister Wi-Fi</strong>
              <span>The service focuses on places where shared, supportable connectivity can be understood and used.</span>
            </div>
            <div>
              <strong>Why now</strong>
              <span>Focused deployments can help close gaps that broad market coverage does not solve quickly enough.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="section-heading compact">
            <p className="eyebrow">How access works</p>
            <h2>A short path from seeing the network to using it.</h2>
          </div>
          <div className="steps-grid">
            {networkAccessSteps.map((step, index) => (
              <article className="step-card" key={step.title}>
                <span>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="shell cta-panel">
          <div>
            <p className="eyebrow">Partnerships and coverage requests</p>
            <h2>Bring Wi-Fi closer to residents and communities that need it.</h2>
            <p>
              For hostel connectivity, remote-area access, grant conversations, or deployment partnerships, talk to the
              Nister Wi-Fi team about the location and the need.
            </p>
          </div>
          <div className="button-row">
            <a className="button button-primary" href={EXTERNAL_LINKS.coverageRequest}>
              Request Coverage
            </a>
            <a className="button button-secondary" href={EXTERNAL_LINKS.partnershipRequest}>
              Discuss A Partnership
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
