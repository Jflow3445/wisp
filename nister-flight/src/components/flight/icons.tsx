export function Icon({ name, size = 20, className = "" }: { name: string; size?: number; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    flight: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    wallet: <><path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v12H6a3 3 0 0 1-3-3V6"/><path d="M20 12h-5v5h5"/><path d="M17 14.5h.01"/></>,
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4"/></>,
    settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></>,
    shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></>,
    help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5"/></>,
    up: <><path d="M12 20V4m-6 6 6-6 6 6"/></>,
    down: <><path d="M12 4v16m-6-6 6 6 6-6"/></>,
    logout: <><path d="M9 5H4v14h5m6-14 5 7-5 7M8 12h12"/></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  };
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.flight}</svg>;
}

export function Wordmark() {
  return <span className="f-wordmark"><span className="f-brand-icon"><Icon name="flight" size={22}/></span><span>NISTER<span className="f-brand-sub">FLIGHT</span></span></span>;
}
