import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPlatformSettings, getSiteContent, getUnreadNotificationCount } from "@/lib/site";
import { logoutAction } from "@/app/actions/auth";

export async function TopNav() {
  const [content, user, settings] = await Promise.all([getSiteContent(), getCurrentUser(), getPlatformSettings()]);
  const unreadCount = user ? await getUnreadNotificationCount(user.id) : 0;

  return (
    <header className="site-header">
      <div className="site-shell nav-shell">
        <Link href="/" className="brandmark" aria-label={`${content.brandName} home`}>
          <span className="brandmark-orb" aria-hidden="true" />
          <span className="brandmark-text">{content.brandName}</span>
        </Link>

        <nav className="main-nav" aria-label="Primary">
          <Link href="/">Home</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/guide">Guide</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/contact">Contact</Link>
          <a href={settings.telegramUrl || content.telegramUrl} target="_blank" rel="noreferrer">
            Telegram
          </a>
        </nav>

        <div className="nav-actions">
          {user ? (
            <>
              <Link href="/dashboard#alerts" className="btn btn-ghost">
                Workspace{unreadCount > 0 ? ` (${unreadCount})` : ""}
              </Link>
              {user.role === "ADMIN" ? (
                <Link href="/admin" className="btn btn-ghost">
                  Admin
                </Link>
              ) : null}
              <form action={logoutAction}>
                <button className="btn btn-dark" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Sign in
              </Link>
              <Link href={content.primaryCtaHref} className="btn btn-coral">
                {content.primaryCtaLabel}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
