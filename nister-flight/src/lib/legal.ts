import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

const DEFAULT_EFFECTIVE_DATE = "March 8, 2026";
const DEFAULT_LEGAL_ENTITY = "Nister AI Ltd";
const DEFAULT_REGISTERED_ADDRESS = "Registered Address";
const DEFAULT_GOVERNING_LAW = "Cayman Islands";
const DEFAULT_SUPPORT_EMAIL = "support@nisterai.com";
const DEFAULT_TERMS_VERSION = "terms-2026-03-08";
const DEFAULT_PRIVACY_VERSION = "privacy-2026-03-08";
const DEFAULT_RISK_VERSION = "risk-2026-03-08";

export type LegalAcceptanceContext = "SIGNUP" | "CHECKOUT" | "ONBOARDING" | "RE_ACCEPT";

export function legalMeta() {
  return {
    effectiveDate: process.env.LEGAL_EFFECTIVE_DATE?.trim() || DEFAULT_EFFECTIVE_DATE,
    lastUpdated: process.env.LEGAL_LAST_UPDATED?.trim() || DEFAULT_EFFECTIVE_DATE,
    legalEntityName: process.env.NISTER_LEGAL_ENTITY_NAME?.trim() || DEFAULT_LEGAL_ENTITY,
    governingLaw: process.env.NISTER_GOVERNING_LAW?.trim() || DEFAULT_GOVERNING_LAW,
    registeredAddress: process.env.NISTER_REGISTERED_ADDRESS?.trim() || DEFAULT_REGISTERED_ADDRESS,
    supportEmail: process.env.NISTER_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL,
    cityCountry: process.env.NISTER_DISPUTE_CITY_COUNTRY?.trim() || "George Town, Cayman Islands",
  };
}

export function legalVersions() {
  return {
    termsVersion: process.env.TERMS_VERSION?.trim() || DEFAULT_TERMS_VERSION,
    privacyVersion: process.env.PRIVACY_VERSION?.trim() || DEFAULT_PRIVACY_VERSION,
    riskVersion: process.env.RISK_VERSION?.trim() || DEFAULT_RISK_VERSION,
  };
}

export function legalVersionLabel() {
  const versions = legalVersions();
  return `${versions.termsVersion} / ${versions.privacyVersion} / ${versions.riskVersion}`;
}

async function requestMeta() {
  const h = await headers();
  const xff = (h.get("x-forwarded-for") || "").split(",")[0]?.trim() || null;
  const xri = (h.get("x-real-ip") || "").trim() || null;
  const ipAddress = xff || xri;
  const userAgent = (h.get("user-agent") || "").trim() || null;
  return { ipAddress, userAgent };
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function recordLegalAcceptance(input: {
  userId?: string | null;
  email: string;
  context: LegalAcceptanceContext;
}) {
  const versions = legalVersions();
  const meta = await requestMeta();

  await prisma.legalAcceptance.create({
    data: {
      userId: input.userId || null,
      email: normalizeEmail(input.email),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      termsVersion: versions.termsVersion,
      privacyVersion: versions.privacyVersion,
      riskVersion: versions.riskVersion,
      context: input.context,
      acceptedAt: new Date(),
    },
  });
}

export async function latestLegalAcceptanceForUser(userId: string) {
  return prisma.legalAcceptance.findFirst({
    where: { userId },
    orderBy: [{ acceptedAt: "desc" }],
    select: {
      id: true,
      termsVersion: true,
      privacyVersion: true,
      riskVersion: true,
      acceptedAt: true,
    },
  });
}

export function isAcceptanceCurrent(acceptance: {
  termsVersion: string;
  privacyVersion: string;
  riskVersion: string;
} | null) {
  if (!acceptance) {
    return false;
  }
  const versions = legalVersions();
  return (
    acceptance.termsVersion === versions.termsVersion &&
    acceptance.privacyVersion === versions.privacyVersion &&
    acceptance.riskVersion === versions.riskVersion
  );
}

export async function userNeedsLegalReacceptance(userId: string) {
  const latest = await latestLegalAcceptanceForUser(userId);
  return !isAcceptanceCurrent(latest);
}

export function legalConsentError() {
  return "You must accept the Terms, Privacy Policy, and Risk Disclosure to continue.";
}
