import { authorize, apiError } from "@/lib/flight-http";
import { referralNetwork, ReferralBranchError } from "@/lib/flight-referral-network";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await authorize(request), url = new URL(request.url);
    return Response.json(await referralNetwork(user.id, url.searchParams.get("node"), Number(url.searchParams.get("page") || 0)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ReferralBranchError) return Response.json({ error: error.message }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    return apiError(error);
  }
}
