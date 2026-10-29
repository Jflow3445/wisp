import Link from "next/link";
import { FlightChart } from "./chart";
import { Icon, Wordmark } from "./icons";
export function AccessFrame({ label, title, description, children }: { label: string; title: string; description: string; children: React.ReactNode }) {
  return <main className="f-auth"><section className="f-auth-story"><Link href="/" className="f-logo"><Wordmark/></Link><div className="f-auth-story-copy"><div className="f-eyebrow">YOUR PERSONAL AIRSPACE</div><h1>Your account.<br/>Your next moment<span>.</span></h1><p>A clear path back to your flight deck.</p></div><FlightChart compact/><div className="f-auth-story-foot"><Icon name="shield" size={16}/> Secure account access</div></section><section className="f-auth-form-wrap"><div className="f-auth-card"><Link className="f-text-link f-auth-back" href="/">Back to Flight</Link><span className="f-eyebrow">{label}</span><h2>{title}</h2><p>{description}</p>{children}</div></section></main>;
}
