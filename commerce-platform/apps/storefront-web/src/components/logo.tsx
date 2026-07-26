import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" aria-label="NISTER market home" className="group flex shrink-0 items-center gap-2">
      <span aria-hidden="true" className="grid size-9 place-items-center bg-[var(--ink)] text-sm font-black text-white transition-transform group-hover:-rotate-3">N</span>
      <span className="text-[1.05rem] font-black tracking-normal text-[var(--ink)]">NISTER <span className="font-medium text-[var(--muted)]">market</span></span>
    </Link>
  );
}
