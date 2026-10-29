import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/flight/shell";
import { userNeedsLegalReacceptance } from "@/lib/legal";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && await userNeedsLegalReacceptance(user.id)) redirect("/legal/accept?next=%2Fdashboard");
  return <Shell user={user}>{children}</Shell>;
}
