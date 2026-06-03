import { headers } from "next/headers";
import { NisterWifiHome } from "@/components/home/nister-wifi-home";
import { NetworkAccessGuide } from "@/components/network/network-access-guide";
import { SiteFooter } from "@/components/shared/site-footer";
import { SiteNav } from "@/components/shared/site-nav";
import { hostForHeaders, resolveExperienceForHost } from "@/lib/hosts";

export const dynamic = "force-dynamic";

function UnknownHostFallback() {
  return (
    <main className="site-page site-page-light">
      <SiteNav active="home" />
      <section className="fallback-section shell">
        <p className="eyebrow">Nister Wi-Fi</p>
        <h1>Use the official Nister Wi-Fi domains.</h1>
        <p>
          This standalone app serves the public Nister Wi-Fi website at nister.org and the network access guide at
          wifi.nister.org.
        </p>
        <div className="button-row">
          <a className="button button-primary" href="https://nister.org/">
            Open Nister Wi-Fi
          </a>
          <a className="button button-secondary" href="https://wifi.nister.org/">
            Network Instructions
          </a>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

export default async function Page() {
  const headerStore = await headers();
  const host = hostForHeaders({
    host: headerStore.get("host"),
    forwardedHost: headerStore.get("x-forwarded-host"),
  });
  const experience = resolveExperienceForHost(host);

  if (experience === "network") {
    return <NetworkAccessGuide />;
  }

  if (experience === "home") {
    return <NisterWifiHome />;
  }

  return <UnknownHostFallback />;
}
