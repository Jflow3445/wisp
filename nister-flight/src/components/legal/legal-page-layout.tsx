import type { ReactNode } from "react";
import { PremiumMarketingFooter } from "@/components/site/premium-marketing-footer";
import { PremiumMarketingNav } from "@/components/site/premium-marketing-nav";

type TocItem = {
  href: string;
  label: string;
};

type LegalPageLayoutProps = {
  title: string;
  intro: string;
  children: ReactNode;
  toc: TocItem[];
};

export function LegalPageLayout({ title, intro, children, toc }: LegalPageLayoutProps) {
  return (
    <main className="premium-home premium-subpage">
      <PremiumMarketingNav current="home" />
      <section className="premium-page-hero legalx-hero">
        <div className="premium-shell">
          <p className="premium-page-eyebrow">Legal</p>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
      </section>
      <section className="premium-section premium-sub-tight legalx-section">
        <div className="premium-shell legalx-grid">
          <aside className="legalx-toc" aria-label="Table of contents">
            <p>On This Page</p>
            <nav>
              {toc.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
          <article className="legalx-content">{children}</article>
        </div>
      </section>
      <PremiumMarketingFooter />
    </main>
  );
}
