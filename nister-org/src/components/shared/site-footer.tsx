import { EXTERNAL_LINKS } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <p className="footer-title">Nister Wi-Fi</p>
          <p className="footer-copy">
            Shared internet access for hostels and remote communities where getting online matters every day.
          </p>
        </div>
        <div className="footer-links" aria-label="Footer links">
          <a href={EXTERNAL_LINKS.main}>Home</a>
          <a href={EXTERNAL_LINKS.network}>Get Online</a>
          <a href={EXTERNAL_LINKS.login}>Manage Access</a>
          <a href={EXTERNAL_LINKS.support}>Support</a>
        </div>
      </div>
    </footer>
  );
}
