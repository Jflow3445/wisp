import { UserRound } from "lucide-react";

export default function Page() {
  return <section className="py-8"><div className="flex items-center gap-3"><UserRound className="size-6 text-[var(--green)]" /><h2 className="section-title">Profile</h2></div><div className="mt-6 max-w-xl border border-[var(--border)] p-5"><p className="text-sm text-[var(--muted)]">Profile details are managed by the marketplace identity service.</p></div></section>;
}
