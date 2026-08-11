import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nister.org"),
  title: {
    default: "Nister Wi-Fi | Managed Wi-Fi For Hostels",
    template: "%s | Nister Wi-Fi",
  },
  description:
    "Nister Wi-Fi helps hostels manage resident internet, access, payments and Wi-Fi service visibility.",
  icons: {
    icon: [
      { url: "/nister-browser-icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Nister Wi-Fi",
    description: "Managed Wi-Fi for hostels and student accommodation.",
    url: "https://nister.org",
    siteName: "Nister Wi-Fi",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
