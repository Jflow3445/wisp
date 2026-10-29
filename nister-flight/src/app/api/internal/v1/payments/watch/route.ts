import { z } from "zod";
import { requireInternalControlPlaneToken } from "@/lib/internal-control-plane-auth";
import { readRequestBodyTextWithLimit } from "@/lib/request-security";
import { settleExpiredFlights } from "@/lib/flight-service";
import { scanSolidifiedPayments, sweepExpiredPendingPaymentOrders } from "@/lib/tron-payments";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = requireInternalControlPlaneToken(request);
  if (denied) return denied;
  try {
    const read = await readRequestBodyTextWithLimit(request, 8192);
    if (!read.ok) return Response.json({ error: read.message }, { status: read.status });
    const input = z.object({ max_blocks: z.number().int().min(1).max(500).optional(), dry_run: z.boolean().optional(), pending_order_limit: z.number().int().min(1).max(500).optional() }).passthrough().parse(JSON.parse(read.text || "{}"));
    const settled = input.dry_run ? 0 : await settleExpiredFlights();
    const sweep = await sweepExpiredPendingPaymentOrders({ limit: input.pending_order_limit, dryRun: input.dry_run });
    const chain = await scanSolidifiedPayments({ maxBlocks: input.max_blocks, dryRun: input.dry_run });
    return Response.json({ status: "ok", pending_order_sweep: sweep, watcher: chain, flights_settled: settled });
  } catch (error) { console.error("[flight watcher]", error); return Response.json({ error: "WATCHER_FAILED" }, { status: 503 }); }
}
