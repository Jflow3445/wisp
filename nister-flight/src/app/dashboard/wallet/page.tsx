import { requireUser } from "@/lib/auth";
import { Wallet } from "@/components/flight/wallet";
export const metadata = { title: "My wallet" };
export default async function Page() { const user = await requireUser(); return <Wallet accountId={user.id}/>; }
