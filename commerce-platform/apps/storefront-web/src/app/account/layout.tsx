import { AccountNav } from "@/components/account-nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="page-shell py-8 md:py-12"><div className="mb-7"><p className="eyebrow">Buyer account</p><h1 className="page-title mt-2">My NISTER</h1></div><AccountNav />{children}</div>;
}
