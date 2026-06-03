import {
  EXTERNAL_LINKS,
  networkAccessSteps,
  networkExperiencePanels,
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
            <p className="eyebrow">Nister Wi-Fi access help</p>
            <h1>Get online at your hostel or community location.</h1>
            <p className="network-hero-lede">
              Need internet for study, work, calls, payments, or everyday browsing? If you can see Nister Wi-Fi on your
              device, start there. Connect to the network, open wifi.nister.org, log in, and use the internet after your
              access is approved.
            </p>
            <div className="button-row">
              <a className="button button-primary" href={EXTERNAL_LINKS.login}>
                Log In / Manage Access
              </a>
              <a className="button button-secondary" href={EXTERNAL_LINKS.coverageRequest}>
                Request Coverage
              </a>
            </div>
            <div className="network-hero-assurance" aria-label="Access context">
              <span>Hostels</span>
              <span>Remote areas</span>
              <span>Community access points</span>
            </div>
          </div>

          <div className="network-console" aria-label="Nister Wi-Fi access console">
            <div className="console-top">
              <span className="console-dot"></span>
              <span className="console-dot"></span>
              <span className="console-dot"></span>
              <strong>wifi.nister.org</strong>
            </div>
            <div className="console-status-grid">
              <div>
                <span>Network</span>
                <strong>Nister Wi-Fi</strong>
              </div>
              <div>
                <span>Use case</span>
                <strong>On-site access</strong>
              </div>
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
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Start here</p>
            <h2>Start here if you need internet now.</h2>
            <p>
              This page is for the moment when you are trying to get online. It shows what to connect to, what to open,
              what to expect, and what to try if the login page does not appear.
            </p>
          </div>
          <div className="network-experience-grid">
            {networkExperiencePanels.map((panel) => (
              <article className="network-experience-card" key={panel.title}>
                <p className="eyebrow">{panel.eyebrow}</p>
                <h3>{panel.title}</h3>
                <p>{panel.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section network-check-section">
        <div className="shell network-check-grid">
          <div>
            <p className="eyebrow">Quick check</p>
            <h2>Check these before you log in.</h2>
            <p>
              If the page does not move forward, the issue is often connection order. Make sure your device is already
              on Nister Wi-Fi before you try to log in, pay, or check your access.
            </p>
          </div>
          <div className="network-check-card">
            {networkPreLoginChecks.map((check) => (
              <div className="network-check-item" key={check}>
                <span aria-hidden="true"></span>
                <p>{check}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="shell">
          <div className="network-support-head">
            <div>
              <p className="eyebrow">Trouble logging in?</p>
              <h2>If the login page does not open.</h2>
              <p>
                Try these steps before asking for help. They cover the common moment when a device can see Wi-Fi but has
                not reached the login page yet.
              </p>
            </div>
            <a className="button button-primary button-on-light" href={EXTERNAL_LINKS.support}>
              WhatsApp support
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
            <p className="eyebrow">Seeing this page?</p>
            <h2>You may be outside a Nister Wi-Fi location.</h2>
          </div>
          <div className="network-final-card">
            <strong>On-site flow</strong>
            <span>Connect to Nister Wi-Fi</span>
            <span>Open wifi.nister.org</span>
            <span>Log in</span>
            <span>Use the internet</span>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
