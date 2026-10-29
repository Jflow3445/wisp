"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type FloatingBroker = {
  id: string;
  name: string;
};

type FloatingBrokerCtaProps = {
  brokers: FloatingBroker[];
  isLoggedIn?: boolean;
};

function nextDelayMs() {
  return (5 + Math.floor(Math.random() * 7)) * 1000;
}

const COLLAPSE_STORAGE_KEY = "nister_broker_float_collapsed";

export function FloatingBrokerCta({ brokers, isLoggedIn = false }: FloatingBrokerCtaProps) {
  const pathname = usePathname();
  const visibleBrokers = useMemo(() => brokers.filter((item) => item && item.id && item.name), [brokers]);
  const shouldRender =
    visibleBrokers.length > 0 &&
    !isLoggedIn &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/dashboard") &&
    !pathname.startsWith("/app/onboarding");
  const [index, setIndex] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (visibleBrokers.length <= 1) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!active) {
          return;
        }
        setIndex((current) => (current + 1) % visibleBrokers.length);
        schedule();
      }, nextDelayMs());
    };
    schedule();
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [visibleBrokers.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, isCollapsed ? "1" : "0");
    } catch {
      // Ignore storage failures (private mode, restricted environments).
    }
  }, [isCollapsed]);

  if (!shouldRender) {
    return null;
  }

  const active = visibleBrokers[index % visibleBrokers.length];

  return (
    <aside
      className={`broker-float${isCollapsed ? " broker-float-collapsed" : ""}`}
      aria-label="Recommended broker shortcut"
    >
      <div className="broker-float-head">
        <p className="broker-float-kicker">Broker compatibility</p>
        <button
          type="button"
          className="broker-float-toggle"
          onClick={() => setIsCollapsed((current) => !current)}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? "Open" : "Minimize"}
        </button>
      </div>
      {isCollapsed ? null : (
        <>
          <p className="broker-float-name">{active.name}</p>
          <p className="broker-float-note">
            Check setup-compatible broker options. Listings are not suitability advice, approval guarantees, or trading-result promises.
          </p>
          <div className="broker-float-actions">
            <Link
              href={`/api/public/brokers/${active.id}/register?source=floating_cta`}
              className="premium-btn premium-btn-primary premium-btn-md"
            >
              Review broker details
            </Link>
            <Link href="/recommended-brokers" className="premium-btn premium-btn-secondary premium-btn-md">
              Compare broker options
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}
