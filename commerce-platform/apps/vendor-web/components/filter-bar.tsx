import { Search, SlidersHorizontal } from "lucide-react";

export function FilterBar({ placeholder = "Search records", defaultQuery = "", children }: { placeholder?: string; defaultQuery?: string; children?: React.ReactNode }) {
  return (
    <form className="flex flex-col gap-2 border-b border-line bg-white p-3 sm:flex-row sm:items-center">
      <label className="relative min-w-0 flex-1 sm:max-w-sm">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input className="field pl-9" name="q" defaultValue={defaultQuery} placeholder={placeholder} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <button type="submit" className="btn-secondary"><SlidersHorizontal className="h-4 w-4" />Apply</button>
      </div>
    </form>
  );
}
