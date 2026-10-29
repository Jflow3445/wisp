import Script from "next/script";

export function LiveChatScript() {
  return <Script id="nister-live-chat" src="/api/public/live-chat" strategy="afterInteractive" />;
}
