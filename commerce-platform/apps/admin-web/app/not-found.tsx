import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center p-6"><section className="panel max-w-md p-8 text-center"><SearchX className="mx-auto h-8 w-8 text-slate-500" /><h1 className="mt-4 text-lg font-bold">Record not found</h1><p className="mt-2 text-sm text-slate-600">This record does not exist or your role cannot access it.</p><Link className="btn-primary mt-5" href="/dashboard">Return to dashboard</Link></section></main>;
}
