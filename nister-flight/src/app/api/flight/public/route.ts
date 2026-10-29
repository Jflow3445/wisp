import { publicFlightSummary } from "@/lib/flight-public";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await publicFlightSummary(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ referral: { enabled: false, bps: 0 }, wins: [] }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
