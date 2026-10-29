"use client";

type SalesAssistButtonProps = {
  provider: string;
  href: string;
  label?: string;
  className?: string;
  eventSource: string;
};

function trackSalesClick(eventSource: string) {
  void fetch("/api/public/analytics/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    keepalive: true,
    body: JSON.stringify({
      eventName: "sales_assist_clicked",
      pagePath: window.location.pathname,
      metadata: {
        source: eventSource,
      },
    }),
  });
}

export function SalesAssistButton({
  provider,
  href,
  label = "Talk to Sales",
  className = "premium-btn premium-btn-secondary premium-btn-md",
  eventSource,
}: SalesAssistButtonProps) {
  const normalizedProvider = provider.trim().toLowerCase();

  if (normalizedProvider === "crisp" || normalizedProvider === "intercom" || normalizedProvider === "tawk") {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          trackSalesClick(eventSource);
          if (normalizedProvider === "crisp") {
            const crisp = (window as Window & { $crisp?: Array<unknown> }).$crisp;
            if (Array.isArray(crisp)) {
              crisp.push(["do", "chat:open"]);
            } else {
              window.open(href, "_blank", "noopener,noreferrer");
            }
            return;
          }
          if (normalizedProvider === "tawk") {
            const tawk = (window as Window & { Tawk_API?: { maximize?: () => void } }).Tawk_API;
            if (typeof tawk?.maximize === "function") {
              tawk.maximize();
            } else {
              window.open(href, "_blank", "noopener,noreferrer");
            }
            return;
          }
          const intercom = (window as Window & { Intercom?: ((...args: unknown[]) => void) | undefined }).Intercom;
          if (typeof intercom === "function") {
            intercom("show");
          } else {
            window.open(href, "_blank", "noopener,noreferrer");
          }
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        trackSalesClick(eventSource);
      }}
    >
      {label}
    </a>
  );
}
