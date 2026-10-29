import Link from "next/link";
import { getPlatformSettings, getSiteContent } from "@/lib/site";

export async function PremiumMarketingFooter() {
  const [content, settings] = await Promise.all([getSiteContent(), getPlatformSettings()]);
  const forexHref = settings.marketForexEnabled ? "/forex-ai-trading-automation" : "/signup?market=forex&intent=waitlist";
  const stocksHref = settings.marketStocksEnabled ? "/stocks-ai-trading-automation" : "/signup?market=stocks&intent=waitlist";
  const optionsHref = settings.marketOptionsEnabled ? "/options-ai-trading-automation" : "/signup?market=options&intent=waitlist";

  return (
    <footer className="premium-footer">
      <div className="premium-shell premium-footer-grid">
        <div>
          <p className="premium-footer-brand">Nister AI</p>
          <p className="premium-footer-text">
            Autonomous Forex Trading through your own broker account. Trading funds stay with your broker; subscription payments are separate.
          </p>
        </div>
        <div>
          <p className="premium-footer-head">Navigate</p>
          <div className="premium-footer-links">
            <Link href="/">Home</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/guide">Guide</Link>
          </div>
        </div>
        <div>
          <p className="premium-footer-head">Resources</p>
          <div className="premium-footer-links">
            <Link href="/faq">FAQ</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/trading-automation-risk-controls">Risk Controls</Link>
          </div>
        </div>
        <div>
          <p className="premium-footer-head">Market status</p>
          <div className="premium-footer-links">
            <Link href={forexHref}>Forex AI Automation{settings.marketForexEnabled ? " (Live)" : " (Waitlist)"}</Link>
            <Link href={stocksHref}>Stocks AI Automation{settings.marketStocksEnabled ? " (Live)" : " (Waitlist)"}</Link>
            <Link href={optionsHref}>Options AI Automation{settings.marketOptionsEnabled ? " (Live)" : " (Waitlist)"}</Link>
            <Link href="/companion-app-automation">Nister AI App Runtime</Link>
          </div>
        </div>
        <div>
          <p className="premium-footer-head">Legal</p>
          <div className="premium-footer-links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/risk-disclosure">Risk Disclosure</Link>
          </div>
        </div>
        <div>
          <p className="premium-footer-head">Support</p>
          <div className="premium-footer-links">
            <a href={settings.telegramUrl || content.telegramUrl || "https://t.me/nister_ai"} target="_blank" rel="noreferrer">
              Telegram
            </a>
            <Link href="/contact">Contact Form</Link>
          </div>
        </div>
      </div>
      <div className="premium-shell premium-footer-bottom">
        <p>(c) {new Date().getFullYear()} {content.brandName}. Broker-account ownership remains with the user at all times.</p>
        <p>Trades only occur when setup, risk policy, connection, and market signal gates are valid.</p>
      </div>
    </footer>
  );
}
