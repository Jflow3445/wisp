import { sanitizeNavigableUrl } from "@/lib/safe-url";

export function planSignupHref(plan: { ctaHref: string; slug: string; automationMarket: string }) {
  const href = sanitizeNavigableUrl(plan.ctaHref, "/signup");
  if (!href.startsWith("/")) return href;
  const url = new URL(href, "https://nisterai.com");
  if (url.pathname !== "/signup") return href;
  url.searchParams.set("plan", plan.slug);
  url.searchParams.set("market", plan.automationMarket.toLowerCase());
  return `${url.pathname}${url.search}${url.hash}`;
}
