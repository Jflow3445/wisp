import { Star } from "lucide-react";

export function Rating({ value, count, compact = false }: { value: number; count: number; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]" aria-label={`${value} out of 5 stars from ${count} reviews`}>
      <Star className="size-3.5 fill-[var(--yellow)] text-[var(--yellow)]" aria-hidden="true" />
      <span className="font-bold text-[var(--ink)]">{value.toFixed(1)}</span>
      {!compact && <span>({count})</span>}
    </span>
  );
}
