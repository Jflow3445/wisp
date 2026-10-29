import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { buildFlightEmail } from "./flight-email-template";
type Db = Prisma.TransactionClient | typeof prisma;
type Content = { subject: string; text: string; html: string };
export async function enqueueFlightEmail(db: Db, input: { userId: string; reference: string; content: Content; expiresAt?: Date; toEmail?: string }) {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId }, select: { email: true } });
  return db.flightEmail.upsert({ where: { reference: input.reference }, update: {}, create: { reference: input.reference, userId: input.userId, toEmail: input.toEmail || user.email, ...input.content, expiresAt: input.expiresAt } });
}
export async function enqueueWalletEmail(db: Db, input: { userId: string; reference: string; subject: string; body: string }) {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId }, select: { name: true } });
  return enqueueFlightEmail(db, { ...input, content: buildFlightEmail({ ...input, name: user.name }) });
}
export async function deliverFlightEmail(reference: string, deliver = sendEmail) {
  const row = await prisma.flightEmail.findUnique({ where: { reference } });
  if (!row || ["SENT", "CANCELLED"].includes(row.status)) return row?.status === "SENT";
  const now = new Date(), stale = new Date(now.getTime() - 180000);
  if (row.expiresAt && row.expiresAt <= now) { await prisma.flightEmail.updateMany({ where: { id: row.id, OR: [{ status: "PENDING" }, { status: "SENDING", lockedAt: { lt: stale } }] }, data: { status: "CANCELLED", lockedAt: null, lastError: "This security link expired before delivery." } }); return false; }
  const claim = await prisma.flightEmail.updateMany({ where: { id: row.id, OR: [{ status: "PENDING", nextAttemptAt: { lte: now } }, { status: "SENDING", lockedAt: { lt: stale } }] }, data: { status: "SENDING", lockedAt: now, attempts: { increment: 1 } } });
  if (!claim.count) return false;
  try {
    const sent = await deliver({ to: row.toEmail, subject: row.subject, text: row.text, html: row.html, headers: { "Message-ID": `<flight-${createHash("sha256").update(row.reference).digest("hex")}@nisterai.com>` } });
    if (!sent) throw new Error("SMTP_NOT_READY");
    await prisma.flightEmail.updateMany({ where: { id: row.id, status: "SENDING", lockedAt: now }, data: { status: "SENT", sentAt: new Date(), lockedAt: null, lastError: null } });
    return true;
  } catch {
    await prisma.flightEmail.updateMany({ where: { id: row.id, status: "SENDING", lockedAt: now }, data: { status: "PENDING", lockedAt: null, nextAttemptAt: new Date(Date.now() + Math.min(21600000, 60000 * 2 ** Math.min(row.attempts, 9))), lastError: "SMTP delivery unavailable; queued for retry." } });
    return false;
  }
}
export async function dispatchFlightEmails(limit = 3) {
  const rows = await prisma.flightEmail.findMany({ where: { OR: [{ status: "PENDING", nextAttemptAt: { lte: new Date() } }, { status: "SENDING", lockedAt: { lt: new Date(Date.now() - 180000) } }] }, orderBy: { createdAt: "asc" }, take: Math.max(1, Math.min(limit, 10)), select: { reference: true } });
  let sent = 0; const began = Date.now();
  for (const row of rows) { if (Date.now() - began > 20000) break; if (await deliverFlightEmail(row.reference)) sent++; }
  return { sent };
}
