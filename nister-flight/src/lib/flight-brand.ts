import type { Metadata } from "next";
export const FLIGHT_DESCRIPTION = "Commander! Are you ready to earn?";
export const FLIGHT_SHARE_IMAGE = "https://nisterai.com/flight-share.png?v=20261029-flight";
export function flightShareMetadata(url: string): Metadata {
  return {
    description: FLIGHT_DESCRIPTION,
    alternates: { canonical: "https://nisterai.com/" },
    robots: { index: true, follow: true, "max-image-preview": "large" },
    openGraph: { type: "website", url, siteName: "Nister Flight", title: "Nister Flight", description: FLIGHT_DESCRIPTION, images: [{ url: FLIGHT_SHARE_IMAGE, secureUrl: FLIGHT_SHARE_IMAGE, type: "image/png", width: 1200, height: 630, alt: "Nister Flight - Catch your moment" }] },
    twitter: { card: "summary_large_image", title: "Nister Flight", description: FLIGHT_DESCRIPTION, images: [FLIGHT_SHARE_IMAGE] },
  };
}
