import Link from "next/link";
import { getSiteContent } from "@/lib/site";

type MarketingPage = "home" | "forex" | "pricing" | "guide" | "risk" | "faq" | "contact";

type PremiumMarketingNavProps = {
  current: MarketingPage;
};

const navLinks: Array<{ key: MarketingPage; label: string; href: string }> = [
  { key: "home", label: "Home", href: "/" },
  { key: "pricing", label: "Pricing", href: "/pricing" },
  { key: "guide", label: "Guide", href: "/guide" },
  { key: "faq", label: "FAQ", href: "/faq" },
  { key: "contact", label: "Contact", href: "/contact" },
];

export async function PremiumMarketingNav({ current }: PremiumMarketingNavProps) {
  const content = await getSiteContent();

  return (
    <header className="premium-header" data-premium-nav>
      <div className="premium-shell premium-nav-row">
        <Link href="/" className="premium-brand" aria-label={`${content.brandName} home`}>
          <span className="premium-brand-icon" aria-hidden="true" />
          <span className="premium-brand-lockup">
            <span className="premium-brand-wordmark">
              {content.brandName.replace(/\s+AI$/i, "")} <span className="premium-brand-accent">AI</span>
            </span>
            <span className="premium-brand-meta">Trading automation</span>
          </span>
        </Link>

        <nav className="premium-nav-links" aria-label="Primary">
          {navLinks.map((link) => (
            <Link key={link.key} href={link.href} data-active={current === link.key ? "true" : "false"}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="premium-nav-cta">
          <Link href="/login" className="premium-btn premium-btn-ghost premium-btn-nav">
            Sign In
          </Link>
          <Link href={content.primaryCtaHref} className="premium-btn premium-btn-primary premium-btn-nav">
            Start Forex Setup
          </Link>
        </div>

        <details className="premium-mobile-menu">
          <summary aria-label="Open navigation">
            <span className="premium-mobile-summary-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>Menu</span>
          </summary>
          <div className="premium-mobile-panel">
            {navLinks.map((link) => (
              <Link key={link.key} href={link.href} data-active={current === link.key ? "true" : "false"}>
                {link.label}
              </Link>
            ))}
            <div className="premium-mobile-actions">
              <Link href="/login" className="premium-btn premium-btn-ghost premium-btn-block">
                Sign In
              </Link>
              <Link href={content.primaryCtaHref} className="premium-btn premium-btn-primary premium-btn-block">
                Start Forex Setup
              </Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
