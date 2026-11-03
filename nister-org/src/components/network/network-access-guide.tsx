import { EXTERNAL_LINKS, networkAccessSteps, networkTroubleshootingSteps } from "@/lib/content";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export function NetworkAccessGuide() {
  return (
    <div className="site-page network-page">
      <SiteNav active="network" />
      <main className="shell">
        <section className="hero-section">
          <h1>Get online</h1>
          <div className="button-row">
            <a className="button button-primary" href={EXTERNAL_LINKS.login}>Manage access</a>
            <a className="button button-secondary" href={EXTERNAL_LINKS.support}>Support</a>
          </div>
        </section>
        <ol className="access-steps" aria-label="Network access steps">
          {networkAccessSteps.map((step) => <li key={step.title}><h2>{step.title}</h2><p>{step.body}</p></li>)}
        </ol>
        <section className="contact-section">
          <h2>Login page not opening?</h2>
          <div className="troubleshooting-list">
            {networkTroubleshootingSteps.map((step) => <details key={step.title}><summary>{step.title}</summary><p>{step.body}</p></details>)}
          </div>
          <a className="button button-secondary" href={EXTERNAL_LINKS.support}>WhatsApp support</a>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
