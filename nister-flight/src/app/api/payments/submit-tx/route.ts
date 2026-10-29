import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, authorize, body, HttpError } from "@/lib/flight-http";
import { applyRateLimit } from "@/lib/request-security";
import { assertFundingSender, submitTxForPayment } from "@/lib/tron-payments";
export const runtime = "nodejs";
const schema = z.object({ reference: z.string().trim().min(4).max(64), tx_hash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/), sender_address: z.string().trim().length(34) }).strict();
export async function POST(request: Request) {
  try {
    const user = await authorize(request), input = schema.parse(await body(request));
    const rate = await applyRateLimit({ key: `payment-submit:${user.id}`, maxAttempts: 20, windowMs: 600000, failOpen: false });
    if (!rate.allowed) throw new HttpError(429, "Too many transfer submissions. Please wait before trying again.");
    const order = await prisma.paymentOrder.findFirst({ where: { reference: input.reference, userId: user.id }, select: { merchantReceiveAddress: true } });
    if (!order) throw new HttpError(404, "Payment reference not found.");
    await assertFundingSender(input.sender_address, order.merchantReceiveAddress);
    const result = await submitTxForPayment({ reference: input.reference, txHash: input.tx_hash, submittedSenderAddress: input.sender_address });
    return Response.json({ status: "ok", result: { reference: result.reference, verification: result.verification, orderStatus: result.orderStatus, reason: ["PAID", "ALREADY_PROCESSED"].includes(result.verification) ? "Transfer confirmed." : "Your transfer is awaiting confirmation or a payment review. Keep your invoice reference for support." } });
  } catch (error) { return apiError(error); }
}
