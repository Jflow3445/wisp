import { FlightDeck } from "@/components/flight/deck";
import { requireUser } from "@/lib/auth";
export default async function Page() { const user = await requireUser(); return <FlightDeck accountId={user.id}/>; }
