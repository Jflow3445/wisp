import type { Metadata } from "next";
export const FLIGHT_DESCRIPTION = "Commander! Are you ready to earn?";
export const FLIGHT_SHARE_VERSION = "crew-20261029-2";
export const FLIGHT_SHARE_IMAGE = "https://nisterai.com/flight-share-crew.png";
export function flightInviteUrl(code: string) { return `https://nisterai.com/invite/${encodeURIComponent(code.toUpperCase())}?share=${FLIGHT_SHARE_VERSION}`; }
export function flightPublicShareUrl(pathname: string, version?: string | null) {
  const path = /^\/invite\/[A-Za-z0-9]{4,24}$/.test(pathname) ? pathname : "/";
  return `https://nisterai.com${path}${version === FLIGHT_SHARE_VERSION ? `?share=${FLIGHT_SHARE_VERSION}` : ""}`;
}
export function flightShareMetadata(url: string): Metadata {
  return {
    description: FLIGHT_DESCRIPTION,
    alternates: { canonical: url },
    robots: { index: true, follow: true, "max-image-preview": "large" },
    openGraph: { type: "website", url, siteName: "Nister Flight", title: "Nister Flight", description: FLIGHT_DESCRIPTION, images: [{ url: FLIGHT_SHARE_IMAGE, secureUrl: FLIGHT_SHARE_IMAGE, type: "image/png", width: 1200, height: 630, alt: "Nister Flight - Catch your moment" }] },
    twitter: { card: "summary_large_image", title: "Nister Flight", description: FLIGHT_DESCRIPTION, images: [FLIGHT_SHARE_IMAGE] },
  };
}
export function flightShareHtml(url: string) {
  const safeUrl = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nister Flight — Catch your moment</title><meta name="description" content="${FLIGHT_DESCRIPTION}"><link rel="canonical" href="${safeUrl}"><meta property="og:type" content="website"><meta property="og:site_name" content="Nister Flight"><meta property="og:title" content="Nister Flight"><meta property="og:description" content="${FLIGHT_DESCRIPTION}"><meta property="og:url" content="${safeUrl}"><meta property="og:image" content="${FLIGHT_SHARE_IMAGE}"><meta property="og:image:secure_url" content="${FLIGHT_SHARE_IMAGE}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Nister Flight — Catch your moment"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="Nister Flight"><meta name="twitter:description" content="${FLIGHT_DESCRIPTION}"><meta name="twitter:image" content="${FLIGHT_SHARE_IMAGE}"><meta name="robots" content="index,follow,max-image-preview:large"></head><body><main><h1>Nister Flight</h1><p>${FLIGHT_DESCRIPTION}</p><p>Choose your stake. Enjoy a short flight reveal. 18+; you can lose your stake.</p><a href="${safeUrl}">Join Nister Flight</a></main></body></html>`;
}
