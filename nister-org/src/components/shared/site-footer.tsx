import { EXTERNAL_LINKS } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <p className="footer-title">Nister Wi-Fi</p>
          <p className="footer-copy">
            Practical internet access for hostels and remote communities where dependable connectivity matters.
          </p>
        </div>
        <div className="footer-links" aria-label="Footer links">
          <a href={EXTERNAL_LINKS.main}>Home</a>
          <a href={EXTERNAL_LINKS.network}>Network</a>
          <a href={EXTERNAL_LINKS.login}>Login</a>
          <a href={EXTERNAL_LINKS.support}>Support</a>
        </div>
      </div>
    </footer>
  );
}
