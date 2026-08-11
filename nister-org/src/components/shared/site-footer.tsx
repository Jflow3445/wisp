import { EXTERNAL_LINKS } from "@/lib/content";

const mainSiteUrl = (path: string) => `${EXTERNAL_LINKS.main.replace(/\/$/, "")}${path}`;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <p className="footer-title">Nister Wi-Fi</p>
          <p className="footer-copy">
            Managed Wi-Fi for hostels and student accommodation.
          </p>
        </div>
        <div className="footer-links" aria-label="Footer links">
          <a href={EXTERNAL_LINKS.main}>Home</a>
          <a href={mainSiteUrl("/for-hostels")}>For Hostels</a>
          <a href={mainSiteUrl("/how-it-works")}>How It Works</a>
          <a href={mainSiteUrl("/plans")}>Plans</a>
          <a href={mainSiteUrl("/resources")}>Resources</a>
          <a href={mainSiteUrl("/faq")}>FAQ</a>
          <a href={mainSiteUrl("/coverage")}>Coverage</a>
          <a href={mainSiteUrl("/about")}>About</a>
          <a href={mainSiteUrl("/request-installation")}>Request Nister</a>
          <a href={EXTERNAL_LINKS.network}>Get Online</a>
          <a href={EXTERNAL_LINKS.login}>Manage Access</a>
          <a href={EXTERNAL_LINKS.support}>Support</a>
        </div>
      </div>
    </footer>
  );
}
