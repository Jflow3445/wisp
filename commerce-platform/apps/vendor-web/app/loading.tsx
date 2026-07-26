export default function Loading() {
  return (
    <div className="mx-auto max-w-[1600px] animate-pulse space-y-5 p-4 sm:p-6 lg:p-8" aria-label="Loading page">
      <div className="h-8 w-56 rounded bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-md border border-line bg-white" />)}
      </div>
      <div className="h-80 rounded-md border border-line bg-white" />
    </div>
  );
}
