import { AlertCircle, PackageSearch, RotateCcw } from "lucide-react";

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" role="status" aria-label="Loading products">
      {Array.from({ length: count }, (_, index) => (
        <div key={index}><div className="skeleton aspect-[4/5]" /><div className="skeleton mt-3 h-3 w-1/3" /><div className="skeleton mt-2 h-4 w-5/6" /><div className="skeleton mt-3 h-5 w-2/5" /></div>
      ))}
      <span className="sr-only">Loading products</span>
    </div>
  );
}

export function EmptyState({ title = "No products found", message = "Try a different search or browse another category." }: { title?: string; message?: string }) {
  return (
    <div className="grid min-h-72 place-items-center border-y border-[var(--border)] py-12 text-center">
      <div className="max-w-sm"><PackageSearch className="mx-auto size-10 text-[var(--muted)]" aria-hidden="true" /><h2 className="mt-4 text-xl font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{message}</p></div>
    </div>
  );
}

export function QueryError({ retry, message = "We could not load these products." }: { retry: () => void; message?: string }) {
  return (
    <div className="grid min-h-72 place-items-center border-y border-[var(--border)] py-12 text-center" role="alert">
      <div className="max-w-sm"><AlertCircle className="mx-auto size-10 text-[var(--accent)]" aria-hidden="true" /><h2 className="mt-4 text-xl font-black">Something did not load</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{message}</p><button type="button" onClick={retry} className="button-secondary mt-5"><RotateCcw className="size-4" />Try again</button></div>
    </div>
  );
}
