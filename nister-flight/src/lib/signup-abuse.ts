import { createHash } from "node:crypto";
import { applyRateLimit } from "@/lib/request-security";

type SignupAbuseSettingsLike = Record<string, unknown>;

type SignupAbuseRateLimitOptions = {
  key: string;
  maxAttempts: number;
  windowMinutes: number;
  lockMinutes: number;
};

export type SignupAbuseAllowed = {
  allowed: true;
};

export type SignupAbuseBlocked = {
  allowed: false;
  error: string;
  retryAfterSeconds: number;
};

export type SignupAbuseResult = SignupAbuseAllowed | SignupAbuseBlocked;

type SignupAbuseDependencies = {
  applyRateLimit?: typeof applyRateLimit;
};

const SIGNUP_RATE_LIMIT_ERROR = "Too many signup attempts. Please try again later.";
const SIGNUP_DISPOSABLE_EMAIL_ERROR = "Disposable email addresses are not allowed.";
const DEFAULT_RETRY_AFTER_SECONDS = 60;

function asRecord(input: unknown): SignupAbuseSettingsLike {
  if (!input || typeof input !== "object") {
    return {};
  }
  return input as SignupAbuseSettingsLike;
}

function readBoolean(record: SignupAbuseSettingsLike, key: string) {
  const value = record[key];
  return value === true || value === "true" || value === 1 || value === "1";
}

function readPositiveInt(record: SignupAbuseSettingsLike, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === "number" ? value : Number.parseInt(String(value || "").trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.round(parsed));
    }
  }
  return Math.max(1, Math.round(fallback));
}

function normalizeDomain(input: string) {
  return input.trim().toLowerCase().replace(/^\./, "").replace(/\.$/, "");
}

function parseDomainList(raw: unknown) {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => (typeof entry === "string" ? normalizeDomain(entry) : ""))
      .filter(Boolean);
  }

  if (typeof raw === "string") {
    return raw
      .split(/[\s,;\r\n]+/)
      .map((entry) => normalizeDomain(entry))
      .filter(Boolean);
  }

  return [];
}

export function normalizeSignupEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeRequestIp(requestIp: string | null | undefined) {
  const value = (requestIp || "").trim();
  return value || "unknown";
}

export function buildSignupEmailRateLimitKey(email: string) {
  return `signup:email:${createHash("sha256").update(normalizeSignupEmail(email)).digest("hex")}`;
}

export function buildSignupIpRateLimitKey(requestIp: string | null | undefined) {
  return `signup:ip:${normalizeRequestIp(requestIp)}`;
}

function getEmailDomain(email: string) {
  const normalized = normalizeSignupEmail(email);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1) {
    return null;
  }
  const domain = normalizeDomain(normalized.slice(atIndex + 1));
  return domain || null;
}

export function isDisposableSignupEmailBlocked(email: string, settings: unknown) {
  const record = asRecord(settings);
  if (!readBoolean(record, "signupBlockDisposableDomains")) {
    return false;
  }

  const disposableDomains = parseDomainList(record.signupDisposableDomains);
  if (!disposableDomains.length) {
    return false;
  }

  const emailDomain = getEmailDomain(email);
  if (!emailDomain) {
    return false;
  }

  return disposableDomains.some((domain) => emailDomain === domain || emailDomain.endsWith(`.${domain}`));
}

function resolveSignupRateLimitOptions(
  record: SignupAbuseSettingsLike,
  prefix: "signupIp" | "signupEmail",
): SignupAbuseRateLimitOptions {
  const fallbackMaxAttempts = readPositiveInt(record, ["loginMaxAttempts"], 6);
  const fallbackWindowMinutes = readPositiveInt(record, ["loginLockMinutes"], 30);
  const fallbackLockMinutes = fallbackWindowMinutes;

  const maxAttempts = readPositiveInt(record, [`${prefix}MaxAttempts`], fallbackMaxAttempts);
  const windowMinutes = readPositiveInt(record, [`${prefix}WindowMinutes`], fallbackWindowMinutes);
  const lockMinutes = readPositiveInt(record, [`${prefix}LockMinutes`], fallbackLockMinutes);

  return {
    key: "",
    maxAttempts,
    windowMinutes,
    lockMinutes,
  };
}

function blockedResult(retryAfterSeconds: number): SignupAbuseBlocked {
  return {
    allowed: false,
    error: SIGNUP_RATE_LIMIT_ERROR,
    retryAfterSeconds: Math.max(1, Math.round(retryAfterSeconds || DEFAULT_RETRY_AFTER_SECONDS)),
  };
}

function toRateLimitOutcome(
  result: PromiseSettledResult<Awaited<ReturnType<typeof applyRateLimit>>>,
): SignupAbuseResult | null {
  if (result.status === "rejected") {
    return blockedResult(DEFAULT_RETRY_AFTER_SECONDS);
  }
  if (result.value.allowed) {
    return null;
  }
  return blockedResult(result.value.retryAfterSeconds);
}

async function applySignupRateLimit(
  rateLimit: typeof applyRateLimit,
  key: string,
  options: SignupAbuseRateLimitOptions,
) {
  return rateLimit({
    key,
    maxAttempts: options.maxAttempts,
    windowMs: options.windowMinutes * 60_000,
    lockMs: options.lockMinutes * 60_000,
  });
}

export async function enforceSignupAntiAbuse(
  input: {
    email: string;
    requestIp: string | null;
    settings: unknown;
  },
  deps: SignupAbuseDependencies = {},
): Promise<SignupAbuseResult> {
  const record = asRecord(input.settings);

  if (isDisposableSignupEmailBlocked(input.email, record)) {
    return {
      allowed: false,
      error: SIGNUP_DISPOSABLE_EMAIL_ERROR,
      retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
    };
  }

  const rateLimit = deps.applyRateLimit || applyRateLimit;
  const ipOptions = resolveSignupRateLimitOptions(record, "signupIp");
  const emailOptions = resolveSignupRateLimitOptions(record, "signupEmail");
  const [ipResult, emailResult] = await Promise.allSettled([
    applySignupRateLimit(rateLimit, buildSignupIpRateLimitKey(input.requestIp), ipOptions),
    applySignupRateLimit(rateLimit, buildSignupEmailRateLimitKey(input.email), emailOptions),
  ]);

  const outcomes = [toRateLimitOutcome(ipResult), toRateLimitOutcome(emailResult)].filter(
    (value): value is SignupAbuseBlocked => Boolean(value && !value.allowed),
  );

  if (!outcomes.length) {
    return { allowed: true };
  }

  return blockedResult(
    outcomes.reduce((retryAfter, item) => Math.max(retryAfter, item.retryAfterSeconds), DEFAULT_RETRY_AFTER_SECONDS),
  );
}

export function getSignupAntiAbuseErrorMessage(result: SignupAbuseResult) {
  return result.allowed ? null : result.error;
}
