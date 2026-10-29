"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/dashboard/obsidian-dashboard.module.css";

export type SidebarNavItem = {
  href: string;
  label: string;
  hint: string;
};

export type SidebarNavSection = {
  label: string;
  items: SidebarNavItem[];
  defaultOpen?: boolean;
};

export type DashboardSidebarNavProps = {
  primaryItem: SidebarNavItem;
  coreItems: SidebarNavItem[];
  setupSection: SidebarNavSection | null;
  issueSection: SidebarNavSection | null;
  footerItems: SidebarNavItem[];
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function hasActiveItem(pathname: string, items: SidebarNavItem[]) {
  return items.some((item) => isActive(pathname, item.href));
}

function renderLink(pathname: string, item: SidebarNavItem, child = false) {
  const active = isActive(pathname, item.href);
  const baseClass = child ? styles.navChildLink : styles.navLink;
  const activeClass = child ? styles.navChildLinkActive : styles.navLinkActive;

  return (
    <Link key={item.href} href={item.href} className={`${baseClass}${active ? ` ${activeClass}` : ""}`}>
      <span className={styles.navDot} aria-hidden="true" />
      <span className={styles.navLinkLabelWrap}>
        <span className={styles.navLinkLabel}>{item.label}</span>
        {!child ? <span className={styles.navLinkHint}>{item.hint}</span> : null}
      </span>
    </Link>
  );
}

function renderSection(pathname: string, section: SidebarNavSection | null) {
  if (!section) {
    return null;
  }

  const active = hasActiveItem(pathname, section.items);
  const open = Boolean(section.defaultOpen || active);

  return (
    <div className={styles.navGroup} key={section.label}>
      <p className={styles.navSectionLabel}>{section.label}</p>
      <details className={`${styles.navDetails}${active ? ` ${styles.navGroupActive}` : ""}`} open={open}>
        <summary className={styles.navSummary}>
          <span className={styles.navDot} aria-hidden="true" />
          <span className={styles.navLinkLabelWrap}>
            <span className={styles.navLinkLabel}>{section.label}</span>
            <span className={styles.navLinkHint}>{active ? "Open to review the active workflow." : "Expand to see the next step."}</span>
          </span>
          <span className={styles.navChevron} aria-hidden="true">
            &gt;
          </span>
        </summary>
        <div className={styles.navChildren}>{section.items.map((item) => renderLink(pathname, item, true))}</div>
      </details>
    </div>
  );
}

export function DashboardSidebarNav({ primaryItem, coreItems, setupSection, issueSection, footerItems }: DashboardSidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className={styles.navRoot} aria-label="Dashboard navigation">
      <div className={styles.navGroup}>
        <p className={styles.navSectionLabel}>Overview</p>
        <div className={styles.navLinks}>{renderLink(pathname, primaryItem)}</div>
      </div>

      {coreItems.length ? (
        <div className={styles.navGroup}>
          <p className={styles.navSectionLabel}>Trading</p>
          <div className={styles.navLinks}>{coreItems.map((item) => renderLink(pathname, item))}</div>
        </div>
      ) : null}

      {renderSection(pathname, setupSection)}
      {renderSection(pathname, issueSection)}

      {footerItems.length ? (
        <div className={styles.navGroup}>
          <p className={styles.navSectionLabel}>More</p>
          <div className={styles.navLinks}>{footerItems.map((item) => renderLink(pathname, item))}</div>
        </div>
      ) : null}
    </nav>
  );
}
