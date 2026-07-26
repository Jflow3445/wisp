import { SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-shell grid min-h-[55vh] place-items-center py-16 text-center">
      <div className="max-w-md"><SearchX className="mx-auto size-11 text-[var(--muted)]" /><h1 className="mt-5 text-3xl font-black">That page is not on the shelf</h1><p className="mt-3 text-[var(--muted)]">The item may have moved or is no longer available.</p><Link href="/" className="button-primary mt-7">Continue shopping</Link></div>
    </div>
  );
}
