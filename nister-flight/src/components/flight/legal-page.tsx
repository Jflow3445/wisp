import Link from "next/link";
import { Wordmark } from "./icons";
export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: Array<[string, string]> }) {
  return <main className="f-legal-page"><header><Link href="/"><Wordmark/></Link><Link href="/dashboard" className="f-text-link">Your workspace ↗︎</Link></header><article><span className="f-eyebrow">NISTER FLIGHT / UPDATED 29 OCTOBER 2026</span><h1>{title}<span>.</span></h1><p className="f-legal-intro">{intro}</p>{sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}<nav aria-label="Legal documents"><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/risk-disclosure">Risk disclosure</Link></nav></article></main>;
}
