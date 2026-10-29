import QRCode from "qrcode";
import { authorize, apiError, HttpError } from "@/lib/flight-http";
import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await authorize(request), { id } = await context.params;
    const wallet = await prisma.flightReceivingWallet.findUnique({ where: { id } });
    if (!wallet || (!wallet.active && user.role !== "ADMIN" && !await prisma.paymentOrder.findFirst({ where: { receivingWalletId: id, userId: user.id }, select: { id: true } }))) throw new HttpError(404, "Wallet image not found.");
    const bytes = wallet.qrImageData ? Buffer.from(wallet.qrImageData.split(",")[1], "base64") : await QRCode.toBuffer(wallet.address, { width: 320, margin: 3 });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}
