import Link from "next/link";
import { Icon, Wordmark } from "@/components/flight/icons";
export default function NotFound() {
  return <main className="f-archive-page"><Wordmark/><span className="f-eyebrow">A NEW CHAPTER</span><Icon name="flight" size={44}/><h1>This page is on standby.</h1><p>The previous Nister AI website has been archived. Your existing account continues with Nister Flight.</p><Link href="/dashboard" className="f-button">Open your flight deck ↗</Link><Link href="/login" className="f-text-link">Sign in with your existing account</Link></main>;
}
