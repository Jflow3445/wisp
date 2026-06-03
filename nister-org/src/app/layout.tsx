import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nister.org"),
  title: {
    default: "Nister Wi-Fi | Shared Internet Access For Hostels And Remote Communities",
    template: "%s | Nister Wi-Fi",
  },
  description:
    "Nister Wi-Fi helps hostel residents and remote communities get online for study, work, calls, payments, and daily services.",
  icons: {
    icon: [
      { url: "/nister-browser-icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Nister Wi-Fi",
    description: "Shared internet access for hostels and remote communities.",
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
