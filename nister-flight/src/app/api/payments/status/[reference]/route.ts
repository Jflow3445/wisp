import { authorize, apiError, HttpError } from "@/lib/flight-http";
import { getPaymentStatusByReference } from "@/lib/tron-payments";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  try {
    const user = await authorize(request), { reference } = await context.params;
    if (!reference || reference.length > 64) throw new HttpError(404, "Payment reference not found.");
    const payment = await getPaymentStatusByReference(reference, user.id);
    if (!payment) throw new HttpError(404, "Payment reference not found.");
    return Response.json({ status: "ok", payment }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
