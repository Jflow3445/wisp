export function PageHeader({ title, meta, actions }: { title: string; meta?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3 border-b border-line bg-white px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
      <div><h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>{meta && <p className="mt-1 text-sm text-slate-500">{meta}</p>}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
