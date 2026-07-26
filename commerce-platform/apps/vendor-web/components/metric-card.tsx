const toneStyles = {
  neutral: "text-slate-500",
  good: "text-emerald-700",
  warning: "text-amber-700",
};

export function MetricCard({ label, value, change, tone }: { label: string; value: string; change: string; tone: keyof typeof toneStyles }) {
  return (
    <article className="panel min-w-0 p-4 sm:p-5">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      <p className={`mt-2 text-xs font-medium ${toneStyles[tone]}`}>{change}</p>
    </article>
  );
}
