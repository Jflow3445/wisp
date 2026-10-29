import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize, apiError, body, HttpError } from "@/lib/flight-http";
import { getEmailSettings, saveEmailSettings, verifyEmailTransport } from "@/lib/email";
import { enqueueWalletEmail, deliverFlightEmail } from "@/lib/flight-email";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/request-security";
export const runtime = "nodejs";
const headerText = z.string().trim().max(191).refine(value => !/[\r\n]/.test(value));
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), enabled: z.boolean(), host: z.string().trim().max(253).regex(/^[A-Za-z0-9.:-]*$/), port: z.number().int().min(1).max(65535), username: headerText, password: z.string().max(500).optional(), fromEmail: z.string().email().max(191), fromName: headerText, secure: z.boolean(), note: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal("verify") }).strict(), z.object({ action: z.literal("test") }).strict(),
]);
export async function GET(request: Request) {
  try {
    await authorize(request, true);
    const [settings, grouped, recent] = await Promise.all([getEmailSettings(), prisma.flightEmail.groupBy({ by: ["status"], _count: true }), prisma.flightEmail.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, subject: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true } })]);
    return Response.json({ settings, counts: Object.fromEntries(grouped.map(row => [row.status, row._count])), recent }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await authorize(request, true), input = schema.parse(await body(request));
    if (input.action === "settings") return Response.json({ settings: await saveEmailSettings(actor.id, input) });
    const rate = await applyRateLimit({ key: `flight:email-test:${actor.id}`, maxAttempts: 3, windowMs: 300000, failOpen: false });
    if (!rate.allowed) throw new HttpError(429, "Wait a few minutes before testing SMTP again.");
    if (input.action === "verify") { await verifyEmailTransport(); return Response.json({ message: "SMTP connection and authentication succeeded." }); }
    const reference = `smtp-test:${actor.id}:${randomUUID()}`;
    await enqueueWalletEmail(prisma, { userId: actor.id, reference, subject: "Nister Flight SMTP test", body: "This is the test email you requested from your administrator settings. Your SMTP connection can send Nister Flight account and payment notifications." });
    const sent = await deliverFlightEmail(reference);
    return Response.json({ message: sent ? "The SMTP server accepted the test email for your administrator address. Check its inbox or spam folder." : "Test email queued. Check the SMTP settings; delivery will retry automatically." });
  } catch (error) { return apiError(error); }
}
