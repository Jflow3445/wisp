import { z } from "zod";
import { authorize, apiError, HttpError } from "@/lib/flight-http";
import { listReceivingWallets, changeReceivingWallet } from "@/lib/flight-receiving-wallets";
import { readRequestBodyTextWithLimit } from "@/lib/request-security";
export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string().max(191).optional(), label: z.string().trim().min(2).max(60), address: z.string().trim().length(34), makeDefault: z.boolean(), qrImageData: z.string().max(550000).nullable().optional(), note: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal("disable"), id: z.string().min(1).max(191), note: z.string().trim().min(5).max(500) }).strict(),
]);
export async function GET(request: Request) {
  try { const user = await authorize(request); return Response.json({ wallets: await listReceivingWallets(user.role === "ADMIN" && new URL(request.url).searchParams.get("all") === "1") }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await authorize(request, true), read = await readRequestBodyTextWithLimit(request, 560000);
    if (!read.ok) throw new HttpError(read.status, read.message);
    let value; try { value = JSON.parse(read.text); } catch { throw new HttpError(400, "Invalid JSON."); }
    return Response.json({ result: await changeReceivingWallet(actor.id, schema.parse(value)) });
  } catch (error) { return apiError(error); }
}
