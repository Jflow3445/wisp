import { z } from "zod";
import { acceptFlightRules, collectFlight, FLIGHT_TERMS, flightSnapshot, recoverFlight, requestWithdrawal, startFlight } from "@/lib/flight-service";
import { apiError, authorize, body, HttpError } from "@/lib/flight-http";
import { cents } from "@/lib/flight-math";
import { assertWithdrawalDestination } from "@/lib/tron-payments";

export const dynamic = "force-dynamic";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), stake: z.string(), requestKey: z.string().uuid(), rulesVersion: z.string().max(64).optional() }).strict(),
  z.object({ action: z.literal("collect"), id: z.string().max(64), offerId: z.string().length(32) }).strict(),
  z.object({ action: z.literal("recover"), id: z.string().min(1).max(64) }).strict(),
  z.object({ action: z.literal("withdraw"), amount: z.string(), address: z.string().trim().max(64), requestKey: z.string().uuid() }).strict(),
  z.object({ action: z.literal("consent"), accepted: z.literal(true), rulesVersion: z.string().max(64).optional() }).strict(),
]);

export async function GET(request: Request) {
  try { const user = await authorize(request); return Response.json(await flightSnapshot(user.id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await authorize(request), input = schema.parse(await body(request));
    let result;
    switch (input.action) {
      case "start": result = await startFlight(user.id, cents(input.stake), input.requestKey, input.rulesVersion ?? "legacy"); break;
      case "collect": result = await collectFlight(user.id, input.id, input.offerId); break;
      case "recover": result = await recoverFlight(user.id, input.id); break;
      case "consent":
        if (input.rulesVersion !== FLIGHT_TERMS) throw new HttpError(409, "Reload this page to review the updated piloting rules before accepting them.");
        await acceptFlightRules(user.id); result = { accepted: true }; break;
      case "withdraw":
        await assertWithdrawalDestination(input.address);
        result = await requestWithdrawal(user.id, cents(input.amount), input.address, input.requestKey); break;
    }
    return Response.json({ result });
  } catch (error) { return apiError(error); }
}
