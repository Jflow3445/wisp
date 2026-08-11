import { EXTERNAL_LINKS } from "@/lib/content";

export type SiteNavActive =
  | "home"
  | "network"
  | "for-hostels"
  | "how-it-works"
  | "plans"
  | "request-installation"
  | "resources"
  | "faq"
  | "coverage"
  | "about";

type SiteNavProps = {
  active: SiteNavActive;
};

const mainSiteUrl = (path: string) => `${EXTERNAL_LINKS.main.replace(/\/$/, "")}${path}`;

const acquisitionLinks = [
  { active: "for-hostels", label: "For Hostels", href: mainSiteUrl("/for-hostels") },
  { active: "plans", label: "Plans", href: mainSiteUrl("/plans") },
  { active: "resources", label: "Resources", href: mainSiteUrl("/resources") },
  { active: "request-installation", label: "Request Installation", href: mainSiteUrl("/request-installation") },
] as const;

export function SiteNav({ active }: SiteNavProps) {
  return (
    <header className="site-header">
      <div className="shell nav-shell">
        <a className="brand" href={EXTERNAL_LINKS.main} aria-label="Nister Wi-Fi home">
          <span className="brand-mark" aria-hidden="true">
            <span className="signal-bar signal-bar-one" />
            <span className="signal-bar signal-bar-two" />
            <span className="signal-bar signal-bar-three" />
          </span>
          <span>Nister Wi-Fi</span>
        </a>
        <nav className="main-nav" aria-label="Primary navigation">
          <a aria-current={active === "home" ? "page" : undefined} href={EXTERNAL_LINKS.main}>
            Home
          </a>
          {acquisitionLinks.map((link) => (
            <a aria-current={active === link.active ? "page" : undefined} href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
          <a
            aria-current={active === "network" ? "page" : undefined}
            className="nav-action"
            href={EXTERNAL_LINKS.network}
          >
            Get Online
          </a>
          <a className="nav-action nav-action-strong" href={EXTERNAL_LINKS.login}>
            Manage Access
          </a>
        </nav>
      </div>
    </header>
  );
}
