import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export function DataTable<T>({ columns, rows, getRowKey, caption }: { columns: Column<T>[]; rows: T[]; getRowKey: (row: T) => string; caption: string }) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="responsive-table w-full min-w-[660px] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
            <tr>{columns.map((column) => <th key={column.key} scope="col" className={`border-b border-line px-4 py-3 ${column.align === "right" ? "text-right" : "text-left"}`}>{column.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line bg-white">
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="transition hover:bg-slate-50/80">
                {columns.map((column) => <td key={column.key} data-label={column.label} className={`px-4 py-3.5 align-middle ${column.align === "right" ? "text-right" : "text-left"}`}>{column.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
