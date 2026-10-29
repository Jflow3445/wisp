import { z } from "zod";
import { apiError, authorize, body } from "@/lib/flight-http";
import { cents } from "@/lib/flight-math";
import { offerMission } from "@/lib/flight-service";
export const dynamic = "force-dynamic";
const schema = z.object({ stake: z.string().max(32) }).strict();
export async function POST(request: Request) {
  try { const user = await authorize(request), input = schema.parse(await body(request)); return Response.json({ offer: await offerMission(user.id, cents(input.stake)) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
