import Link from "next/link";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-[var(--border)] bg-[var(--surface)] pb-20 pt-10 md:pb-10">
      <div className="page-shell grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-sm text-sm leading-6 text-[var(--muted)]">Shop trusted Ghanaian vendors with clear prices, secure payments and delivery updates from order to doorstep.</p>
        </div>
        <div>
          <h2 className="text-sm font-bold">Shop</h2>
          <div className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
            <Link href="/category/fresh-food">Fresh food</Link><Link href="/category/electronics">Electronics</Link><Link href="/category/beauty">Beauty</Link>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-bold">Account</h2>
          <div className="mt-3 grid gap-2 text-sm text-[var(--muted)]">
            <Link href="/login">Sign in</Link><Link href="/register">Create account</Link><Link href="/account/orders">Track an order</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
