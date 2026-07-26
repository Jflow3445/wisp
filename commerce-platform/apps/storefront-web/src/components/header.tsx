"use client";

import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Logo } from "./logo";
import { useCart } from "@/providers/cart-provider";

const categoryLinks = [
  ["Fresh food", "/category/fresh-food"],
  ["Electronics", "/category/electronics"],
  ["Beauty", "/category/beauty"],
  ["Fashion", "/category/fashion"],
  ["Home & living", "/category/home-living"],
];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { itemCount } = useCart();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/95 backdrop-blur-md">
      <div className="page-shell flex h-16 items-center gap-4 md:h-[4.5rem]">
        <button type="button" className="icon-button md:hidden" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"}>
          {menuOpen ? <X /> : <Menu />}
        </button>
        <Logo />
        <form role="search" className="relative ml-auto hidden max-w-2xl flex-1 md:block" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="site-search">Search products and shops</label>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
          <input id="site-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products and shops" className="h-11 w-full border border-[var(--border-strong)] bg-[var(--surface)] pl-12 pr-4 text-sm outline-none transition focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--focus)]" />
        </form>
        <nav aria-label="Account and basket" className="ml-auto flex items-center gap-1 md:ml-0">
          <Link href="/login" className="header-action hidden sm:flex"><UserRound /><span>Account</span></Link>
          <Link href="/cart" className="header-action relative" aria-label={`Basket with ${itemCount} items`}>
            <ShoppingBag />
            <span className="hidden sm:inline">Basket</span>
            {itemCount > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 text-[11px] font-bold leading-5 text-white">{itemCount}</span>}
          </Link>
        </nav>
      </div>
      <div className="page-shell pb-3 md:hidden">
        <form role="search" className="relative" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="mobile-site-search">Search products and shops</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" />
          <input id="mobile-site-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products and shops" className="h-10 w-full border border-[var(--border-strong)] bg-[var(--surface)] pl-10 pr-3 text-sm outline-none focus:border-[var(--ink)] focus:ring-2 focus:ring-[var(--focus)]" />
        </form>
      </div>
      <nav aria-label="Shop categories" className="hidden border-t border-[var(--border)] md:block">
        <div className="page-shell flex h-11 items-center gap-7 text-sm font-semibold">
          {categoryLinks.map(([label, href]) => <Link key={href} href={href} className="hover:text-[var(--accent)]">{label}</Link>)}
          <Link href="/search?sort=rating" className="ml-auto text-[var(--green)]">Top rated</Link>
        </div>
      </nav>
      {menuOpen && (
        <nav id="mobile-menu" aria-label="Mobile menu" className="border-t border-[var(--border)] bg-white px-5 py-4 md:hidden">
          <div className="grid grid-cols-2 gap-1">
            {categoryLinks.map(([label, href]) => <Link key={href} href={href} className="px-3 py-3 text-sm font-semibold hover:bg-[var(--surface)]">{label}</Link>)}
            <Link href="/account/orders" className="px-3 py-3 text-sm font-semibold">My orders</Link>
            <Link href="/login" className="px-3 py-3 text-sm font-semibold">Sign in</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
