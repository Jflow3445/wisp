import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildVerificationEmail } from "@/lib/email-template";
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

  await prisma.emailVerificationToken.deleteMany({
    where: {
      userId: input.userId,
      consumedAt: null,
    },
  });

  const token = await issueEmailVerificationToken(input.userId);
  const verifyUrl = `${appBaseUrl()}/verify-email/confirm?token=${encodeURIComponent(token)}`;
  const message = buildVerificationEmail({
    name: input.name,
    verifyUrl,
  });

  return sendEmail({
    to: input.email,
    ...message,
  });
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

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { consumedAt: now },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: now },
    }),
  ]);

  return {
    ok: true as const,
    userId: record.user.id,
    email: record.user.email,
  };
}
