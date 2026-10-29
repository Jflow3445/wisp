"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { Icon, Wordmark } from "./icons";

export function Shell({ children, user, admin = false }: { children: React.ReactNode; user: { name: string; email: string; role: string }; admin?: boolean }) {
  const path = usePathname(), [open, setOpen] = useState(false);
  const links = admin ? [["/admin", "Overview", "activity"], ["/admin/users", "Members", "users"], ["/admin/payments", "Treasury", "wallet"], ["/admin/settings", "Game controls", "settings"], ["/admin/audit", "Audit trail", "shield"]] : [["/dashboard", "Flight deck", "flight"], ["/dashboard/wallet", "My wallet", "wallet"], ["/dashboard/activity", "Activity", "activity"], ["/dashboard/referrals", "Invite & earn", "users"], ["/dashboard/settings", "My account", "settings"]];
  const current = links.find(([href]) => href === path)?.[1] ?? "Workspace";
  return <div className={`f-app ${open ? "f-menu-open" : ""}`}>
    <a className="f-skip" href="#main-content">Skip to content</a>
    <aside className="f-sidebar"><Link href={admin ? "/admin" : "/dashboard"} className="f-logo" onClick={() => setOpen(false)}><Wordmark/></Link><button className="f-mobile-menu f-icon-button f-sidebar-close" aria-label="Close navigation" onClick={() => setOpen(false)}><Icon name="close"/></button>
      <div className="f-workspace"><span className="f-dot"/> {admin ? "Operations console" : "Your personal airspace"}</div>
      <p className="f-nav-label">{admin ? "WORKSPACE" : "YOUR WORKSPACE"}</p>
      <nav aria-label="Main navigation">{links.map(([href, label, icon]) => <Link key={href} href={href} className={`f-nav-item ${path === href ? "active" : ""}`} aria-current={path === href ? "page" : undefined} onClick={() => setOpen(false)}><Icon name={icon}/>{label}{path === href && <span className="f-nav-active-dot"/>}</Link>)}</nav>
      <div className="f-sidebar-bottom"><div className="f-network-card"><span className="f-network-symbol">₮</span><div><strong>Crypto. All the way.</strong><small>USDT on the TRON network</small></div><span className="f-dot"/></div>
      <Link href="/dashboard/help" className="f-nav-item" onClick={() => setOpen(false)}><Icon name="help"/>Help &amp; game rules</Link>
      {user.role === "ADMIN" && <Link href={admin ? "/dashboard" : "/admin"} className="f-nav-item" onClick={() => setOpen(false)}><Icon name="shield"/>{admin ? "Open flight deck" : "Admin console"}</Link>}
      <form action={logoutAction}><button className="f-nav-item f-logout"><Icon name="logout"/>Sign out</button></form>
      <div className="f-sidebar-user"><span className="f-avatar">{user.name.slice(0, 2).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><Icon name="lock" size={15}/></div></div>
    </aside>
    <div className="f-main-wrap"><header className="f-topbar"><button className="f-mobile-menu f-icon-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}><Icon name="menu"/></button><div className="f-breadcrumb">{admin ? "Operations" : "Workspace"}<span>/</span><strong>{current}</strong></div><div className="f-top-actions"><span className="f-network-pill"><span className="f-dot"/> USDT <span>· TRC20</span></span><Link href="/dashboard/wallet" className="f-button f-button-small"><span>+</span> Add funds</Link><span className="f-avatar f-top-avatar">{user.name.slice(0, 2).toUpperCase()}</span></div></header>
      <main id="main-content" className="f-main">{children}</main>
      <footer className="f-footer"><span>© {new Date().getUTCFullYear()} Nister Flight</span><span><Icon name="shield" size={13}/> Encrypted account access <b>·</b> Crypto only</span><Link href="/dashboard/help">Play responsibly ↗︎</Link></footer>
    </div>
  </div>;
}
