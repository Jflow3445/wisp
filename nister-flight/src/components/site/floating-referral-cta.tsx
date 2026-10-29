"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type FloatingReferralCtaProps = {
  referralLink: string | null;
  isLoggedIn?: boolean;
};

const COLLAPSE_STORAGE_KEY = "nister_referral_float_collapsed";

export function FloatingReferralCta({ referralLink, isLoggedIn = false }: FloatingReferralCtaProps) {
  const pathname = usePathname();
  const shouldRender =
    isLoggedIn &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/dashboard") &&
    !pathname.startsWith("/app/onboarding") &&
    !pathname.startsWith("/login");
  const [copied, setCopied] = useState(false);
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

  const copyLink = async () => {
    if (!referralLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside
      className={`referral-float${isCollapsed ? " referral-float-collapsed" : ""}`}
      aria-label="Partner referral shortcut"
    >
      <div className="referral-float-head">
        <p className="referral-float-kicker">Partner referral</p>
        <button
          type="button"
          className="referral-float-toggle"
          onClick={() => setIsCollapsed((current) => !current)}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? "Open" : "Minimize"}
        </button>
      </div>
      {isCollapsed ? null : (
        <>
          <p className="referral-float-name">
            Share your link. Commissions are not guaranteed and apply only to qualifying paid signups approved under partner terms.
          </p>
          <div className="referral-float-actions">
            {referralLink ? (
              <button type="button" onClick={copyLink} className="premium-btn premium-btn-primary premium-btn-md">
                {copied ? "Copied" : "Copy referral link"}
              </button>
            ) : null}
            <Link href="/dashboard/partners" className="premium-btn premium-btn-secondary premium-btn-md">
              Review program rules
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}
