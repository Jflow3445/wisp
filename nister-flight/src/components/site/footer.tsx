import Link from "next/link";
import { getPlatformSettings, getSiteContent } from "@/lib/site";

export async function Footer() {
  const [content, settings] = await Promise.all([getSiteContent(), getPlatformSettings()]);

  return (
    <footer className="site-footer">
      <div className="site-shell footer-grid">
        <div>
          <p className="footer-brand">{content.brandName}</p>
          <p className="footer-tagline">{content.footerTagline}</p>
        </div>
        <div className="footer-links" aria-label="Footer links">
          <Link href="/pricing">Pricing</Link>
          <Link href="/guide">Guide</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contact">Contact</Link>
          <a href={settings.telegramUrl || content.telegramUrl} target="_blank" rel="noreferrer">
            Telegram
          </a>
          <Link href="/login">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
