import { requireInternalControlPlaneToken } from "@/lib/internal-control-plane-auth";
import { settleExpiredFlights } from "@/lib/flight-service";
import { dispatchFlightEmails } from "@/lib/flight-email";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = requireInternalControlPlaneToken(request);
  if (denied) return denied;
  try { const settled = await settleExpiredFlights(); const email = await dispatchFlightEmails(); return Response.json({ settled, email }); }
  catch (error) { console.error("[flight settlement]", error); return Response.json({ error: "SETTLEMENT_FAILED" }, { status: 503 }); }
}
