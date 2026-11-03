import { AccountNav } from "@/components/account-nav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="page-shell py-8 md:py-12"><div className="mb-7"><h1 className="page-title mt-2">Account</h1></div><AccountNav />{children}</div>;
}
