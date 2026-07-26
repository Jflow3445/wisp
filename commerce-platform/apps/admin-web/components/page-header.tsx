export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-line bg-white px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><div><h1 className="text-xl font-bold sm:text-2xl">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div>{actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}</div>;
}
