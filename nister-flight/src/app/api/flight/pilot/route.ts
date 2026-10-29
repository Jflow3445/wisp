import { z } from "zod";
import { authorize, apiError, body } from "@/lib/flight-http";
import { pilotFlight } from "@/lib/flight-service";
export const dynamic = "force-dynamic";
const schema = z.object({ id: z.string().min(1).max(64), seq: z.number().int().min(1).max(100), throttle: z.number().int().min(0).max(1000), elevator: z.number().int().min(-1000).max(1000) }).strict();
export async function POST(request: Request) {
  try {
    const user = await authorize(request, false, true), input = schema.parse(await body(request));
    return Response.json({ result: await pilotFlight(user.id, input.id, input.seq, input.throttle, input.elevator) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
