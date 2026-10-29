import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const HUMANITY_BLOCK_ERROR =
  "Signup blocked by anti-abuse controls. If this is your account, contact support.";

const AUTOMATED_USER_AGENT_PATTERN =
  /(bot|crawler|spider|headless|selenium|playwright|puppeteer|phantomjs|curl|wget|python-requests|scrapy|go-http-client|aiohttp|libwww-perl|postmanruntime)/i;

const HUMANITY_REVIEW_WINDOW_HOURS = 72;
const HUMANITY_DOMAIN_CLUSTER_WINDOW_DAYS = 30;
const HUMANITY_SUSPICIOUS_DOMAIN_CLUSTER_THRESHOLD = 3;
const HUMANITY_BLOCK_SCORE = 9;
const HUMANITY_IP_GHOST_CLUSTER_MODERATE = 3;
const HUMANITY_IP_GHOST_CLUSTER_HIGH = 6;
const HUMANITY_IP_DOMAIN_CLUSTER_MODERATE = 2;
const HUMANITY_IP_DOMAIN_CLUSTER_HIGH = 4;
const TRUSTED_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "mail.com",
]);

export type SignupHumanityAllowed = {
  allowed: true;
};

export type SignupHumanityBlocked = {
  allowed: false;
  error: string;
  score: number;
  reasons: string[];
};

export type SignupHumanityResult = SignupHumanityAllowed | SignupHumanityBlocked;

type SignupHumanityInput = {
  name: string;
  email: string;
  requestIp: string | null;
  userAgent: string | null;
};

type SignupHumanityCountByIpInput = {
  requestIp: string;
  windowStart: Date;
};

type SignupHumanityCountByIpDomainInput = SignupHumanityCountByIpInput & {
  emailDomain: string | null;
};

type SignupHumanityCountSuspiciousDomainInput = {
  emailDomain: string | null;
  windowStart: Date;
};

type SignupHumanityDeps = {
  countRecentGhostAccountsFromIp?: (input: SignupHumanityCountByIpInput) => Promise<number>;
  countRecentGhostAccountsFromIpDomain?: (input: SignupHumanityCountByIpDomainInput) => Promise<number>;
  countRecentSuspiciousDomainSignups?: (
    input: SignupHumanityCountSuspiciousDomainInput,
  ) => Promise<number>;
};

type SignupHumanitySignals = {
  missingUserAgent: boolean;
  automatedUserAgent: boolean;
  suspiciousEmailLocalPart: boolean;
  nonTrustedDomain: boolean;
  syntheticName: boolean;
  suspiciousDomainCluster: boolean;
  ipGhostCount: number;
  ipDomainGhostCount: number;
};

function normalizeRequestIp(requestIp: string | null | undefined) {
  const normalized = String(requestIp || "").trim();
  return normalized || null;
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function getEmailParts(email: string) {
  const normalized = normalizeEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1) {
    return {
      localPart: normalized,
      domain: null,
    };
  }
  const localPart = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1).trim().replace(/^\./, "").replace(/\.$/, "");
  return {
    localPart,
    domain: domain || null,
  };
}

function asNonNegativeInt(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function isGhostAccountWhereClause(windowStart: Date, requestIp: string) {
  return {
    role: UserRole.MEMBER,
    emailVerifiedAt: null,
    createdAt: {
      gte: windowStart,
    },
    legalAcceptances: {
      some: {
        context: "SIGNUP",
        ipAddress: requestIp,
      },
    },
    paymentSubmissions: { none: {} },
    brokerAccounts: { none: {} },
    agents: { none: {} },
    executionSessions: { none: {} },
    supportTickets: { none: {} },
    licensedEaClients: { none: {} },
    marketEnrollments: { none: {} },
  };
}

async function defaultCountRecentGhostAccountsFromIp(input: SignupHumanityCountByIpInput) {
  return prisma.user.count({
    where: isGhostAccountWhereClause(input.windowStart, input.requestIp),
  });
}

async function defaultCountRecentGhostAccountsFromIpDomain(input: SignupHumanityCountByIpDomainInput) {
  if (!input.emailDomain) {
    return 0;
  }
  return prisma.user.count({
    where: {
      ...isGhostAccountWhereClause(input.windowStart, input.requestIp),
      email: {
        endsWith: `@${input.emailDomain}`,
      },
    },
  });
}

async function defaultCountRecentSuspiciousDomainSignups(input: SignupHumanityCountSuspiciousDomainInput) {
  if (!input.emailDomain) {
    return 0;
  }

  const rows = await prisma.user.findMany({
    where: {
      role: UserRole.MEMBER,
      createdAt: { gte: input.windowStart },
      email: { endsWith: `@${input.emailDomain}` },
      paymentSubmissions: { none: {} },
      agents: { none: {} },
      executionSessions: { none: {} },
      supportTickets: { none: {} },
      licensedEaClients: { none: {} },
    },
    select: {
      email: true,
      createdAt: true,
      emailVerifiedAt: true,
    },
  });

  let suspiciousCount = 0;
  for (const row of rows) {
    const localPart = String(row.email || "").split("@")[0] || "";
    if (!isSuspiciousEmailLocalPart(localPart)) {
      continue;
    }
    if (!row.emailVerifiedAt) {
      continue;
    }
    const verifyMs = row.emailVerifiedAt.getTime() - row.createdAt.getTime();
    if (verifyMs >= 0 && verifyMs <= 120_000) {
      suspiciousCount += 1;
    }
  }
  return suspiciousCount;
}

export function isAutomatedUserAgent(userAgent: string | null | undefined) {
  const normalized = String(userAgent || "").trim();
  if (!normalized) {
    return false;
  }
  return AUTOMATED_USER_AGENT_PATTERN.test(normalized);
}

export function isSuspiciousEmailLocalPart(localPart: string | null | undefined) {
  const normalized = String(localPart || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const digits = (normalized.match(/[0-9]/g) || []).length;
  const letters = (normalized.match(/[a-z]/g) || []).length;
  const digitRatio = normalized.length ? digits / normalized.length : 1;

  if (/^\d+$/.test(normalized)) {
    return true;
  }
  if (/\d{6,}/.test(normalized)) {
    return true;
  }
  if (/^(test|user|temp|bot|guest|trial)/.test(normalized)) {
    return true;
  }
  if (normalized.length >= 8 && letters >= 4 && digits >= 2 && digitRatio >= 0.2) {
    return true;
  }
  if (normalized.length >= 12 && letters >= 3 && digits >= 4 && digitRatio >= 0.45) {
    return true;
  }
  return false;
}

function isTrustedEmailDomain(domain: string | null) {
  if (!domain) {
    return false;
  }
  return TRUSTED_EMAIL_DOMAINS.has(domain);
}

function normalizeName(value: string) {
  return String(value || "").trim().toLowerCase();
}

function isSyntheticSignupName(name: string, emailLocalPart: string, fullEmail: string) {
  const normalized = normalizeName(name);
  if (!normalized) {
    return true;
  }
  const normalizedEmail = normalizeEmail(fullEmail);
  const normalizedLocal = normalizeEmail(emailLocalPart);
  if (normalized === normalizedEmail) {
    return true;
  }
  if (normalized === normalizedLocal) {
    return true;
  }
  if (/^[a-z]{3,5}$/.test(normalized)) {
    return true;
  }
  return false;
}

function evaluateSignupHumanitySignals(signals: SignupHumanitySignals) {
  let score = 0;
  const reasons: string[] = [];

  if (signals.missingUserAgent) {
    score += 2;
    reasons.push("missing_user_agent");
  }

  if (signals.automatedUserAgent) {
    score += 6;
    reasons.push("automated_user_agent");
  }

  if (signals.suspiciousEmailLocalPart) {
    score += 3;
    reasons.push("suspicious_email_local_part");
  }

  if (signals.nonTrustedDomain) {
    score += 2;
    reasons.push("non_trusted_email_domain");
  }

  if (signals.syntheticName) {
    score += 2;
    reasons.push("synthetic_name_pattern");
  }

  if (signals.suspiciousDomainCluster) {
    score += 5;
    reasons.push("suspicious_domain_cluster");
  }

  if (signals.ipGhostCount >= HUMANITY_IP_GHOST_CLUSTER_HIGH) {
    score += 6;
    reasons.push("ip_ghost_cluster_high");
  } else if (signals.ipGhostCount >= HUMANITY_IP_GHOST_CLUSTER_MODERATE) {
    score += 4;
    reasons.push("ip_ghost_cluster_moderate");
  }

  if (signals.ipDomainGhostCount >= HUMANITY_IP_DOMAIN_CLUSTER_HIGH) {
    score += 5;
    reasons.push("ip_domain_cluster_high");
  } else if (signals.ipDomainGhostCount >= HUMANITY_IP_DOMAIN_CLUSTER_MODERATE) {
    score += 3;
    reasons.push("ip_domain_cluster_moderate");
  }

  if (signals.automatedUserAgent && signals.suspiciousEmailLocalPart) {
    score += 2;
    reasons.push("automated_plus_suspicious_email");
  }

  if (signals.suspiciousEmailLocalPart && signals.nonTrustedDomain && signals.syntheticName) {
    score += 2;
    reasons.push("synthetic_random_nontrusted_combo");
  }

  return {
    score,
    reasons,
  };
}

function blockedResult(score: number, reasons: string[]): SignupHumanityBlocked {
  return {
    allowed: false,
    error: HUMANITY_BLOCK_ERROR,
    score,
    reasons,
  };
}

export async function enforceSignupHumanityGate(
  input: SignupHumanityInput,
  deps: SignupHumanityDeps = {},
): Promise<SignupHumanityResult> {
  const requestIp = normalizeRequestIp(input.requestIp);
  const userAgent = String(input.userAgent || "").trim();
  const { localPart, domain } = getEmailParts(input.email);
  const countRecentGhostAccountsFromIp =
    deps.countRecentGhostAccountsFromIp || defaultCountRecentGhostAccountsFromIp;
  const countRecentGhostAccountsFromIpDomain =
    deps.countRecentGhostAccountsFromIpDomain || defaultCountRecentGhostAccountsFromIpDomain;
  const countRecentSuspiciousDomainSignups =
    deps.countRecentSuspiciousDomainSignups || defaultCountRecentSuspiciousDomainSignups;

  const windowStart = new Date(Date.now() - HUMANITY_REVIEW_WINDOW_HOURS * 60 * 60 * 1000);
  const domainWindowStart = new Date(
    Date.now() - HUMANITY_DOMAIN_CLUSTER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  let ipGhostCount = 0;
  let ipDomainGhostCount = 0;
  let suspiciousDomainSignupCount = 0;

  try {
    const domainClusterPromise = countRecentSuspiciousDomainSignups({
      emailDomain: domain,
      windowStart: domainWindowStart,
    });

    if (requestIp) {
      const [ipCount, ipDomainCount, domainClusterCount] = await Promise.all([
        countRecentGhostAccountsFromIp({
          requestIp,
          windowStart,
        }),
        countRecentGhostAccountsFromIpDomain({
          requestIp,
          windowStart,
          emailDomain: domain,
        }),
        domainClusterPromise,
      ]);
      ipGhostCount = asNonNegativeInt(ipCount);
      ipDomainGhostCount = asNonNegativeInt(ipDomainCount);
      suspiciousDomainSignupCount = asNonNegativeInt(domainClusterCount);
    } else {
      suspiciousDomainSignupCount = asNonNegativeInt(await domainClusterPromise);
    }
  } catch {
    return blockedResult(HUMANITY_BLOCK_SCORE, ["humanity_gate_query_failed"]);
  }

  const { score, reasons } = evaluateSignupHumanitySignals({
    missingUserAgent: !userAgent,
    automatedUserAgent: isAutomatedUserAgent(userAgent),
    suspiciousEmailLocalPart: isSuspiciousEmailLocalPart(localPart),
    nonTrustedDomain: !isTrustedEmailDomain(domain),
    syntheticName: isSyntheticSignupName(input.name, localPart, input.email),
    suspiciousDomainCluster:
      suspiciousDomainSignupCount >= HUMANITY_SUSPICIOUS_DOMAIN_CLUSTER_THRESHOLD,
    ipGhostCount,
    ipDomainGhostCount,
  });

  if (score >= HUMANITY_BLOCK_SCORE) {
    return blockedResult(score, reasons);
  }

  return {
    allowed: true,
  };
}
