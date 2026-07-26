"use client";

import { MapPin, Package, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/account/orders", label: "Orders", icon: Package },
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
];

export function AccountNav() {
  const pathname = usePathname();
  return <nav aria-label="Buyer account" className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">{links.map(({ href, label, icon: Icon }) => { const active = pathname.startsWith(href); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-bold ${active ? "border-[var(--green)] text-[var(--green)]" : "border-transparent text-[var(--muted)]"}`}><Icon className="size-4" />{label}</Link>; })}</nav>;
}
