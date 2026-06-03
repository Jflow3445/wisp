import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://nister.org"),
  title: {
    default: "Nister Wi-Fi | Internet Access For Hostels And Remote Communities",
    template: "%s | Nister Wi-Fi",
  },
  description:
    "Nister Wi-Fi provides practical internet access for hostels and remote communities where dependable connectivity is needed most.",
  openGraph: {
    title: "Nister Wi-Fi",
    description: "Practical internet access for hostels and remote communities.",
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
