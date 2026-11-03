import Link from "next/link";
import { Wordmark } from "./icons";

export function AccessFrame({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <main className="f-auth"><section className="f-auth-form-wrap"><div className="f-auth-card"><Link className="f-logo f-auth-back" href="/"><Wordmark/></Link><h1>{title}</h1>{description && <p>{description}</p>}{children}</div></section></main>;
}
