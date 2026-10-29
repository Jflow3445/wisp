import { z } from "zod";
import { apiError, authorize, body } from "@/lib/flight-http";
import { controls } from "@/lib/flight-service";
import { cents } from "@/lib/flight-math";
import { createPaymentInvoice, assertFundingSender } from "@/lib/tron-payments";
import { userNeedsLegalReacceptance } from "@/lib/legal";

export const runtime = "nodejs";
const schema = z.object({ base_amount_usdt: z.string(), declared_sender_address: z.string().trim().length(34), receiving_wallet_id: z.string().min(1).max(191).optional() }).strict();

export async function POST(request: Request) {
  try {
    const user = await authorize(request), input = schema.parse(await body(request));
    if (user.role !== "ADMIN" && !user.emailVerifiedAt) throw new Error("Verify your email address before adding funds.");
    if (user.role !== "ADMIN" && await userNeedsLegalReacceptance(user.id)) throw new Error("Accept the current service terms before adding funds.");
    if (!(await controls()).depositsEnabled) throw new Error("New deposits are temporarily paused.");
    const amount = cents(input.base_amount_usdt);
    if (amount > 10000000) throw new Error("A single deposit may not exceed 100,000 USD.");
    await assertFundingSender(input.declared_sender_address);
    const invoice = await createPaymentInvoice({ userId: user.id, baseAmountUsdt: (amount / 100).toFixed(2), declaredSenderAddress: input.declared_sender_address, receivingWalletId: input.receiving_wallet_id, metadata: { source: "flight_topup" } });
    return Response.json({ status: "ok", invoice }, { status: 201 });
  } catch (error) { return apiError(error); }
}
