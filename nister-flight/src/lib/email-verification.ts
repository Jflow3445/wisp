import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enqueueFlightEmail, deliverFlightEmail, enqueueWalletEmail } from "@/lib/flight-email";
import { buildFlightEmail } from "@/lib/flight-email-template";
import { getPublicAppBaseUrl } from "@/lib/public-url";
import { applyRateLimit } from "@/lib/request-security";

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

function appBaseUrl() {
  return getPublicAppBaseUrl();
}

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function createRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function issueEmailVerificationToken(userId: string) {
  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000 * 24);

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return rawToken;
}

export async function sendVerificationEmail(input: {
  userId: string;
  email: string;
  name: string;
}) {
  if (!hasDatabaseConfig) {
    return false;
  }
  const rate = await applyRateLimit({ key: `flight:verify-email:${hashToken(input.email.toLowerCase())}`, maxAttempts: 3, windowMs: 900000, failOpen: false });
  if (!rate.allowed) return false;

  const token = createRawToken(), tokenHash = hashToken(token), expiresAt = new Date(Date.now() + 86400000);
  const verifyUrl = `${appBaseUrl()}/verify-email/confirm?token=${encodeURIComponent(token)}`;
  const reference = `verify:${hashToken(input.userId)}:${tokenHash}`;
  await prisma.$transaction(async tx => {
    await tx.flightEmail.updateMany({ where: { userId: input.userId, reference: { startsWith: `verify:${hashToken(input.userId)}:` }, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.emailVerificationToken.deleteMany({ where: { userId: input.userId, expiresAt: { lt: new Date() } } });
    await tx.emailVerificationToken.create({ data: { userId: input.userId, tokenHash, expiresAt } });
    await enqueueFlightEmail(tx, { userId: input.userId, toEmail: input.email, reference, expiresAt, content: buildFlightEmail({ subject: "Confirm your Nister Flight email", name: input.name, body: "Confirm your email address to finish creating your Nister Flight account.\n\nThis secure link expires in 24 hours. If you did not create this account, you can ignore this email.", path: verifyUrl, actionLabel: "Confirm my email" }) });
  });
  return deliverFlightEmail(reference);
}

export async function verifyEmailToken(rawToken: string) {
  if (!hasDatabaseConfig) {
    return { ok: false as const, reason: "unavailable" };
  }

  const tokenHash = hashToken(rawToken.trim());
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  if (!record) {
    return { ok: false as const, reason: "invalid" };
  }

  if (record.consumedAt) {
    return { ok: false as const, reason: "used" };
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    return { ok: false as const, reason: "expired" };
  }

  const now = new Date();

  const accepted = await prisma.$transaction(async tx => {
    const claim = await tx.emailVerificationToken.updateMany({ where: { id: record.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (!claim.count) return false;
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } });
    await tx.emailVerificationToken.updateMany({ where: { userId: record.userId, consumedAt: null }, data: { consumedAt: now } });
    await tx.flightEmail.updateMany({ where: { userId: record.userId, reference: { startsWith: `verify:${hashToken(record.userId)}:` }, status: "PENDING" }, data: { status: "CANCELLED" } });
    await enqueueWalletEmail(tx, { userId: record.userId, reference: `welcome:${hashToken(record.userId)}`, subject: "Your Nister Flight email is confirmed", body: "Your email address has been confirmed. You can sign in to your Nister Flight account and manage your wallet. Paid play remains subject to your account's eligibility review." });
    return true;
  });
  if (!accepted) return { ok: false as const, reason: "used" };

  return {
    ok: true as const,
    userId: record.user.id,
    email: record.user.email,
  };
}
