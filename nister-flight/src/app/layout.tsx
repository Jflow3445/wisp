import { headers } from "next/headers";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./flight.css";

const sans = localFont({ src: "./fonts/geist-latin.woff2", variable: "--font-flight", display: "swap" });
const mono = localFont({ src: "./fonts/geist-mono-latin.woff2", variable: "--font-flight-mono", display: "swap" });
export const metadata: Metadata = {
  title: { default: "Nister Flight — Catch your moment", template: "%s | Nister Flight" },
  metadataBase: new URL("https://nisterai.com"),
  description: "Commander! Are you ready to earn?",
  icons: {
    icon: [{ url: "/flight-icon.svg?v=20261029", type: "image/svg+xml", sizes: "any" }, { url: "/flight-icon-32.png?v=20261029", type: "image/png", sizes: "32x32" }],
    shortcut: "/favicon.ico?v=20261029-flight",
    apple: "/flight-apple-icon.png?v=20261029",
  },
  openGraph: { type: "website", url: "https://nisterai.com", siteName: "Nister Flight", title: "Nister Flight", description: "Commander! Are you ready to earn?", images: [{ url: "/flight-share.png", width: 1200, height: 630, alt: "Nister Flight - Catch your moment" }] },
  twitter: { card: "summary_large_image", title: "Nister Flight", description: "Commander! Are you ready to earn?", images: ["/flight-share.png"] },
  robots: { index: false, follow: false },
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  await headers(); // Render request-specific CSP nonces on every HTML response.
  return <html lang="en"><body className={`${sans.variable} ${mono.variable} flight-body`}>{children}</body></html>;
}
