"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin/referrals", label: "Overview" },
  { href: "/admin/referrals/partners", label: "Partners" },
  { href: "/admin/referrals/commissions", label: "Commissions" },
  { href: "/admin/referrals/payouts", label: "Partner Payouts" },
  { href: "/admin/referrals/integrity", label: "Referral Integrity" },
  { href: "/admin/referrals/settings", label: "Referral Settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin/referrals") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminReferralsNav() {
  const pathname = usePathname();

  return (
    <div className="adminx-chip-row adminx-referrals-nav" aria-label="Referral pages">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          className={`adminx-chip adminx-referrals-nav-link${isActive(pathname, item.href) ? " adminx-referrals-nav-link-active" : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
