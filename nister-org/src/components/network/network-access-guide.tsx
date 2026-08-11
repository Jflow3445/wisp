import {
  EXTERNAL_LINKS,
  networkAccessSteps,
  networkPreLoginChecks,
  networkTroubleshootingSteps,
} from "@/lib/content";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export function NetworkAccessGuide() {
  return (
    <main className="site-page network-page">
      <SiteNav active="network" />

      <section className="network-hero">
        <div className="shell network-hero-grid network-hero-grid-premium">
          <div className="network-hero-copy">
            <p className="eyebrow">Get Online</p>
            <h1>Need to get online?</h1>
            <p className="network-hero-lede">
              Connect to Nister Wi-Fi and we&apos;ll take it from there. Stay on the Wi-Fi while you log in, buy access or
              check your connection.
            </p>
            <div className="button-row">
              <a className="button button-primary" href={EXTERNAL_LINKS.login}>
                Log In / Manage Access
              </a>
              <a className="button button-secondary" href={EXTERNAL_LINKS.support}>
                Get Help on WhatsApp
              </a>
            </div>
          </div>

          <div className="network-console" aria-label="Nister Wi-Fi access steps">
            <div className="console-top">
              <span className="console-dot"></span>
              <span className="console-dot"></span>
              <span className="console-dot"></span>
              <strong>wifi.nister.org</strong>
            </div>
            <div className="access-card access-card-premium" aria-label="Network access steps">
              {networkAccessSteps.map((step, index) => (
                <div className="access-step" key={step.title}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell section-grid">
          <div>
            <h2>Start here if you need internet now.</h2>
            <p>
              This page is for the moment when you are trying to connect. It keeps the steps simple so you can get back
              online quickly.
            </p>
          </div>
          <div className="public-list-panel">
            {networkPreLoginChecks.map((check) => (
              <p key={check}>{check}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="shell">
          <div className="network-support-head">
            <div>
              <h2>If it does not work.</h2>
              <p>Try these quick checks before asking for help.</p>
            </div>
            <a className="button button-primary button-on-light" href={EXTERNAL_LINKS.support}>
              Get Help on WhatsApp
            </a>
          </div>
          <div className="network-troubleshooting-grid">
            {networkTroubleshootingSteps.map((step) => (
              <article className="feature-panel" key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="network-final-band">
        <div className="shell network-final-grid">
          <div>
            <h2>Stay connected to Nister Wi-Fi while using this page.</h2>
          </div>
          <div className="network-final-card">
            <strong>Get online</strong>
            <span>Join Nister Wi-Fi</span>
            <span>Open wifi.nister.org</span>
            <span>Log in or buy access</span>
            <span>You&apos;re connected</span>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
