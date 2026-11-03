import { EXTERNAL_LINKS } from "@/lib/content";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";

export function NisterWifiHome() {
  return (
    <div className="site-page">
      <SiteNav active="home" />
      <main className="shell">
        <section className="hero-section">
          <h1>Wi-Fi for hostels and communities.</h1>
          <div className="button-row">
            <a className="button button-primary" href={EXTERNAL_LINKS.coverageRequest}>Request coverage</a>
            <a className="button button-secondary" href={EXTERNAL_LINKS.network}>Get online</a>
          </div>
        </section>
        <section className="service-grid" aria-label="Coverage">
          <article className="service-card"><h2>Hostels</h2><p>Shared internet for residents. Individual accounts and plans.</p></article>
          <article className="service-card"><h2>Remote communities</h2><p>Local access points for places with limited internet coverage.</p></article>
        </section>
        <section className="contact-section">
          <h2>Bring Nister to your location</h2>
          <div className="button-row">
            <a className="button button-primary" href={EXTERNAL_LINKS.coverageRequest}>Request coverage</a>
            <a className="button button-secondary" href={EXTERNAL_LINKS.partnershipRequest}>Partnerships</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
