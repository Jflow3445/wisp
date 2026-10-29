import { requireInternalControlPlaneToken } from "@/lib/internal-control-plane-auth";
import { settleExpiredFlights } from "@/lib/flight-service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = requireInternalControlPlaneToken(request);
  if (denied) return denied;
  try { return Response.json({ settled: await settleExpiredFlights() }); }
  catch (error) { console.error("[flight settlement]", error); return Response.json({ error: "SETTLEMENT_FAILED" }, { status: 503 }); }
}
