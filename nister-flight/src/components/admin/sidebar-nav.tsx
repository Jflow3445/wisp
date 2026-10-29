"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/admin/obsidian-admin.module.css";

const items = [
  { href: "/admin", label: "Overview", hint: "Business oversight and platform health in one view." },
  { href: "/admin/agent-security", label: "Agent Security", hint: "Block, revoke, or restore Nister AI App devices." },
  { href: "/admin/kill-switches", label: "Kill Switches", hint: "Emergency stops for platform, account, and device activity." },
  { href: "/admin/users", label: "Users", hint: "Manage member profiles, onboarding status, and account states." },
  { href: "/admin/referrals", label: "Referrals", hint: "Track partner-led growth, commissions, and payout readiness." },
  { href: "/admin/marketing", label: "Marketing", hint: "Manage onboarding templates and scheduled blast campaigns." },
  { href: "/admin/plans", label: "Plans & Pricing", hint: "Configure Nister AI subscription plans." },
  { href: "/admin/brokers", label: "Broker Integrations", hint: "Manage supported broker options and setup guidance." },
  { href: "/admin/content", label: "Content Ops", hint: "Edit website copy, FAQs, and guide content." },
  { href: "/admin/support", label: "Support", hint: "Respond to user tickets and support threads." },
  { href: "/admin/security", label: "Security", hint: "Configure platform guardrails and auth controls." },
  { href: "/admin/settings", label: "Settings", hint: "Configure email delivery, wallets, and package distribution." },
  { href: "/admin/audit", label: "Audit Log", hint: "Review immutable admin and control-plane actions." },
];

function active(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Admin navigation">
      {items.map((item) => {
        const isActive = active(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`.trim()}
            title={item.hint}
          >
            <span className={styles.navLabel}>{item.label}</span>
            <span className={styles.navHint}>{item.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
