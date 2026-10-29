"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const MIN_VISIBLE_MS = 250;
const FALLBACK_CLEAR_MS = 15000;

function shouldTrackLinkNavigation(link: HTMLAnchorElement) {
  if (link.dataset.noGlobalLoading === "true") {
    return false;
  }
  if (link.target && link.target !== "_self") {
    return false;
  }
  if (link.hasAttribute("download")) {
    return false;
  }
  const href = link.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  try {
    const targetUrl = new URL(link.href, window.location.href);
    return targetUrl.origin === window.location.origin;
  } catch {
    return false;
  }
}

function isSubmitControl(element: HTMLElement) {
  if (element instanceof HTMLButtonElement) {
    return (element.type || "submit") === "submit";
  }
  if (element instanceof HTMLInputElement) {
    return element.type === "submit" || element.type === "image";
  }
  return false;
}

export function GlobalInteractionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryKey = searchParams?.toString() ?? "";

  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const startedAtRef = useRef(0);
  const clearTimerRef = useRef<number | null>(null);
  const pendingControlRef = useRef<HTMLElement | null>(null);

  const clearPendingControl = useCallback(() => {
    const target = pendingControlRef.current;
    if (!target) {
      return;
    }
    target.classList.remove("ui-pending-control");
    target.removeAttribute("aria-busy");
    pendingControlRef.current = null;
  }, []);

  const clearFallbackTimer = useCallback(() => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const finishLoading = useCallback(() => {
    clearFallbackTimer();
    clearPendingControl();
    activeRef.current = false;
    setActive(false);
  }, [clearFallbackTimer, clearPendingControl]);

  const stopLoading = useCallback(() => {
    if (!activeRef.current) {
      clearPendingControl();
      return;
    }
    const elapsed = Date.now() - startedAtRef.current;
    if (elapsed >= MIN_VISIBLE_MS) {
      finishLoading();
      return;
    }
    const waitMs = Math.max(0, MIN_VISIBLE_MS - elapsed);
    window.setTimeout(finishLoading, waitMs);
  }, [clearPendingControl, finishLoading]);

  const startLoading = useCallback(
    (pendingControl: HTMLElement | null) => {
      if (!activeRef.current) {
        activeRef.current = true;
        startedAtRef.current = Date.now();
        setActive(true);
      }
      clearFallbackTimer();
      clearTimerRef.current = window.setTimeout(() => {
        finishLoading();
      }, FALLBACK_CLEAR_MS);

      clearPendingControl();
      if (pendingControl) {
        pendingControlRef.current = pendingControl;
        pendingControl.classList.add("ui-pending-control");
        pendingControl.setAttribute("aria-busy", "true");
      }
    },
    [clearFallbackTimer, clearPendingControl, finishLoading],
  );

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) {
        return;
      }

      const link = target.closest("a[href]");
      if (link instanceof HTMLAnchorElement && shouldTrackLinkNavigation(link)) {
        startLoading(null);
        return;
      }

      const control = target.closest("button, input[type='submit'], input[type='image']");
      if (!(control instanceof HTMLElement) || !isSubmitControl(control)) {
        return;
      }
      if (!control.closest("form")) {
        return;
      }
      startLoading(control);
    };

    const onFormSubmit = (event: Event) => {
      const submitEvent = event as SubmitEvent;
      const submitter = submitEvent.submitter;
      if (!(submitter instanceof HTMLElement)) {
        startLoading(null);
        return;
      }
      if (!isSubmitControl(submitter)) {
        startLoading(null);
        return;
      }
      startLoading(submitter);
    };

    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("submit", onFormSubmit, true);

    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("submit", onFormSubmit, true);
    };
  }, [startLoading]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      stopLoading();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [pathname, queryKey, stopLoading]);

  useEffect(() => {
    return () => {
      clearFallbackTimer();
      clearPendingControl();
    };
  }, [clearFallbackTimer, clearPendingControl]);

  return (
    <div className={`ui-route-progress${active ? " ui-route-progress-active" : ""}`} aria-hidden="true">
      <span />
    </div>
  );
}
