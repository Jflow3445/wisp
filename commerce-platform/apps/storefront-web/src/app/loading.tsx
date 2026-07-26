export default function Loading() {
  return (
    <div className="page-shell py-10" role="status" aria-label="Loading page">
      <div className="skeleton h-8 w-52" />
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => <div key={index}><div className="skeleton aspect-[4/5]" /><div className="skeleton mt-3 h-4 w-4/5" /><div className="skeleton mt-2 h-4 w-2/5" /></div>)}
      </div>
      <span className="sr-only">Loading products</span>
    </div>
  );
}
