import { requireAdmin } from "@/lib/auth";
import { Shell } from "@/components/flight/shell";
export const dynamic = "force-dynamic";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <Shell user={user} admin>{children}</Shell>;
}
