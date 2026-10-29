import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enqueueFlightEmail, deliverFlightEmail } from "@/lib/flight-email";
import { buildFlightEmail } from "@/lib/flight-email-template";
import { getPublicAppBaseUrl } from "@/lib/public-url";

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

async function issuePasswordResetToken(userId: string) {
  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return rawToken;
}

export async function sendPasswordResetEmail(input: {
  userId: string;
  email: string;
  name: string;
}) {
  if (!hasDatabaseConfig) {
    return false;
  }

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId: input.userId,
      consumedAt: null,
    },
  });

  const token = await issuePasswordResetToken(input.userId);
  const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const reference = `reset:${hashToken(input.userId)}:${hashToken(token)}`;
  await prisma.flightEmail.updateMany({ where: { userId: input.userId, reference: { startsWith: `reset:${hashToken(input.userId)}:` }, status: "PENDING" }, data: { status: "CANCELLED" } });
  await enqueueFlightEmail(prisma, { userId: input.userId, toEmail: input.email, reference, expiresAt: new Date(Date.now() + 3600000), content: buildFlightEmail({ subject: "Reset your Nister Flight password", name: input.name, body: "Use this secure link to choose a new password for your Nister Flight account. The link expires in one hour.\n\nIf you did not request a password reset, ignore this email. Your password will stay unchanged.", path: resetUrl, actionLabel: "Reset my password" }) });
  return deliverFlightEmail(reference);
}

export async function consumePasswordResetToken(rawToken: string) {
  if (!hasDatabaseConfig) {
    return { ok: false as const, reason: "unavailable" };
  }

  const tokenHash = hashToken(rawToken.trim());
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
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

  return {
    ok: true as const,
    tokenId: record.id,
    user: record.user,
  };
}
