import { MapPin } from "lucide-react";

export default function Page() {
  return <section className="py-8"><div className="flex items-center gap-3"><MapPin className="size-6 text-[var(--green)]" /><h2 className="section-title">Saved addresses</h2></div><div className="mt-6 max-w-xl border border-[var(--border)] p-5"><p className="text-sm text-[var(--muted)]">Addresses used at checkout will appear here after your first live order.</p></div></section>;
}
