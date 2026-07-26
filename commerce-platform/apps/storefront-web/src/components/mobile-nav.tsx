"use client";

import { Home, Search, ShoppingBag, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/providers/cart-provider";

const items = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/cart", label: "Basket", icon: ShoppingBag },
  { href: "/account/orders", label: "Orders", icon: UserRound },
];

export function MobileNav() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  return (
    <nav aria-label="Primary mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid h-16 grid-cols-4">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
              <Icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              {label}
              {href === "/cart" && itemCount > 0 && <span className="absolute left-[55%] top-2 grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[9px] leading-4 text-white">{itemCount}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
