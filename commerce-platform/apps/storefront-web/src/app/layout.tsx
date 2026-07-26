import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { AppProviders } from "@/providers/app-providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = {
  title: { default: "NISTER Market | Shop Ghana", template: "%s | NISTER Market" },
  description: "Shop trusted vendors across Ghana with secure checkout and dependable delivery.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GH">
      <body>
        <AppProviders>
          <Suspense fallback={<div className="h-28 border-b border-[var(--border)] bg-white" />}><Header /></Suspense>
          <main id="main-content" className="min-h-[60vh]">{children}</main>
          <Footer />
          <MobileNav />
        </AppProviders>
      </body>
    </html>
  );
}
