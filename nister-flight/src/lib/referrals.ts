import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type ReferralValidationReason = "ok" | "invalid_format" | "not_found" | "self_referral";

export type ReferralValidationResult = {
  normalizedCode: string | null;
  referrer: { id: string; email: string; referralCode: string | null } | null;
  reason: ReferralValidationReason;
  valid: boolean;
};

function randomAlphaNumeric(length: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}

export function normalizeReferralCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function validateReferralCode(
  rawCode: string | null | undefined,
  options: { applicantEmail?: string | null } = {},
): Promise<ReferralValidationResult> {
  const normalizedCode = normalizeReferralCode(String(rawCode || ""));
  if (!normalizedCode) {
    return {
      normalizedCode: null,
      referrer: null,
      reason: "invalid_format",
      valid: false,
    };
  }

  const referrer = await prisma.user.findUnique({
    where: { referralCode: normalizedCode },
    select: {
      id: true,
      email: true,
      referralCode: true,
    },
  });

  if (!referrer) {
    return {
      normalizedCode,
      referrer: null,
      reason: "not_found",
      valid: false,
    };
  }

  const applicantEmail = String(options.applicantEmail || "").trim().toLowerCase();
  if (applicantEmail && referrer.email.trim().toLowerCase() === applicantEmail) {
    return {
      normalizedCode,
      referrer,
      reason: "self_referral",
      valid: false,
    };
  }

  return {
    normalizedCode,
    referrer,
    reason: "ok",
    valid: true,
  };
}

export function referralCodeFromName(name: string) {
  void name;
  return `NF${randomAlphaNumeric(10)}`;
}

export async function generateUniqueReferralCode(name: string) {
  for (let i = 0; i < 20; i += 1) {
    const candidate = referralCodeFromName(name);
    const exists = await prisma.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });
    if (!exists) {
      return candidate;
    }
  }

  for (let i = 0; i < 20; i += 1) {
    const candidate = `NST${randomAlphaNumeric(8)}`;
    const exists = await prisma.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });
    if (!exists) {
      return candidate;
    }
  }

  throw new Error("Unable to generate unique referral code");
}

export async function ensureUserReferralCode(userId: string, name: string, existingCode?: string | null) {
  const normalizedExisting = existingCode ? normalizeReferralCode(existingCode) : "";
  if (normalizedExisting) {
    return normalizedExisting;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = await generateUniqueReferralCode(name);
    try {
      await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
      return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })).referralCode!;
    } catch (error) { if ((error as { code?: string }).code !== "P2002" || attempt === 4) throw error; }
  }
  throw new Error("Your invite link is temporarily unavailable.");
}

export function applyBps(value: number, bps: number) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(bps) || bps <= 0) {
    return 0;
  }
  return Math.floor((value * bps) / 10_000);
}

export function calculateReferralAmounts(baseCents: number, discountBps: number, commissionBps: number) {
  const safeBase = Number.isFinite(baseCents) && baseCents > 0 ? Math.round(baseCents) : 0;
  const discountCents = applyBps(safeBase, Math.max(0, Math.round(discountBps)));
  const finalCents = Math.max(0, safeBase - discountCents);
  const commissionCents = applyBps(finalCents, Math.max(0, Math.round(commissionBps)));
  return {
    baseCents: safeBase,
    discountCents,
    finalCents,
    commissionCents,
  };
}
