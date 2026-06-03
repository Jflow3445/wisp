import { EXTERNAL_LINKS } from "@/lib/content";

type SiteNavProps = {
  active: "home" | "network";
};

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
          <a aria-current={active === "network" ? "page" : undefined} href={EXTERNAL_LINKS.network}>
            Get Online
          </a>
          <a href={EXTERNAL_LINKS.login}>Manage Access</a>
        </nav>
      </div>
    </header>
  );
}
