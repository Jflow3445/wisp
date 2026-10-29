import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTrustedPublicHosts, isTrustedPublicOrigin } from "@/lib/public-url";

type GuardOk = { ok: true };
type GuardError = {
  ok: false;
  status: number;
  error: string;
  message: string;
};

type GuardResult = GuardOk | GuardError;

type OriginGuardOptions = {
  allowMissingOrigin?: boolean;
  allowNullOrigin?: boolean;
  allowedOrigins?: string[];
};

type IpValue = {
  version: 4 | 6;
  bits: number;
  value: bigint;
};

export type RateLimitRecord = {
  key: string;
  attempts: number;
  lockedUntil: Date | null;
  lastAttemptAt: Date | null;
};

export type RateLimitStore = {
  findUnique: (key: string) => Promise<RateLimitRecord | null>;
  upsert: (input: {
    key: string;
    create: () => RateLimitRecord;
    update: (existing: RateLimitRecord) => RateLimitRecord;
  }) => Promise<RateLimitRecord>;
};

type RateLimitOptions = {
  key: string;
  maxAttempts: number;
  windowMs: number;
  lockMs?: number;
  now?: Date;
  failOpen?: boolean;
  failureRetryAfterSeconds?: number;
};

type AllowedRateLimit = { allowed: true };
type BlockedRateLimit = { allowed: false; retryAfterSeconds: number };
export type RateLimitResult = AllowedRateLimit | BlockedRateLimit;
function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

function normalizeHost(raw: string | null) {
  return (raw || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/:\d+$/, "");
}

function trustedHostsForRequest(request: Request) {
  const trustedHosts = getTrustedPublicHosts();
  const hosts = new Set<string>(trustedHosts);
  const host = normalizeHost(request.headers.get("host"));
  const forwarded = normalizeHost(request.headers.get("x-forwarded-host"));
  if (host && trustedHosts.has(host)) {
    hosts.add(host);
  }
  if (forwarded && trustedHosts.has(forwarded)) {
    hosts.add(forwarded);
  }
  return hosts;
}

function hostFromOrigin(origin: string) {
  try {
    return normalizeHost(new URL(origin).host);
  } catch {
    return null;
  }
}

function guardError(status: number, error: string, message: string): GuardError {
  return {
    ok: false,
    status,
    error,
    message,
  };
}

export function enforceTrustedOrigin(request: Request, options: OriginGuardOptions = {}): GuardResult {
  const allowMissingOrigin = options.allowMissingOrigin ?? true;
  const allowNullOrigin = options.allowNullOrigin ?? false;
  const origin = (request.headers.get("origin") || "").trim();

  if (!origin) {
    return allowMissingOrigin
      ? { ok: true }
      : guardError(403, "MISSING_ORIGIN", "Origin header is required");
  }

  if (origin.toLowerCase() === "null") {
    return allowNullOrigin
      ? { ok: true }
      : guardError(403, "UNTRUSTED_ORIGIN", "Null origin is not allowed");
  }

  const requestTrustedHosts = trustedHostsForRequest(request);
  const allowed = new Set<string>();
  for (const host of requestTrustedHosts) {
    if (host) {
      allowed.add(host);
    }
  }
  for (const entry of options.allowedOrigins || []) {
    const host = hostFromOrigin(entry);
    if (host) {
      allowed.add(host);
    }
  }

  const originHost = hostFromOrigin(origin);
  if (!originHost) {
    return guardError(403, "UNTRUSTED_ORIGIN", "Origin header is invalid");
  }
  if (!allowed.has(originHost) && !isTrustedPublicOrigin(origin)) {
    return guardError(403, "UNTRUSTED_ORIGIN", "Origin is not allowed");
  }

  return { ok: true };
}

export function enforceJsonContentType(request: Request): GuardResult {
  const contentType = (request.headers.get("content-type") || "").trim().toLowerCase();
  if (!contentType.startsWith("application/json")) {
    return guardError(415, "UNSUPPORTED_CONTENT_TYPE", "Content-Type must be application/json");
  }
  return { ok: true };
}

export async function readRequestBodyTextWithLimit(request: Request, maxBytes: number): Promise<
  | {
      ok: true;
      text: string;
    }
  | GuardError
> {
  const hintedLength = Number.parseInt((request.headers.get("content-length") || "").trim(), 10);
  if (Number.isFinite(hintedLength) && hintedLength > maxBytes) {
    return guardError(413, "PAYLOAD_TOO_LARGE", "Request payload exceeds allowed size");
  }

  if (!request.body) {
    return {
      ok: true,
      text: "",
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value || value.byteLength === 0) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel("payload too large").catch(() => undefined);
      return guardError(413, "PAYLOAD_TOO_LARGE", "Request payload exceeds allowed size");
    }
    chunks.push(value);
  }

  const decoder = new TextDecoder("utf-8");
  let text = "";
  for (const chunk of chunks) {
    text += decoder.decode(chunk, { stream: true });
  }
  text += decoder.decode();

  return {
    ok: true,
    text,
  };
}

function parseIpv4(input: string): IpValue | null {
  const parts = input.split(".");
  if (parts.length !== 4) {
    return null;
  }

  let value = BigInt(0);
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    const octet = Number.parseInt(part, 10);
    if (!Number.isFinite(octet) || octet < 0 || octet > 255) {
      return null;
    }
    value = (value << BigInt(8)) + BigInt(octet);
  }

  return {
    version: 4,
    bits: 32,
    value,
  };
}

function parseIpv6(input: string): IpValue | null {
  const normalizedInput = input.toLowerCase().split("%")[0];
  if (!normalizedInput) {
    return null;
  }

  const doubleColonCount = normalizedInput.split("::").length - 1;
  if (doubleColonCount > 1) {
    return null;
  }

  let [leftRaw, rightRaw] = normalizedInput.split("::");
  leftRaw = leftRaw || "";
  rightRaw = rightRaw || "";

  const leftParts = leftRaw ? leftRaw.split(":").filter(Boolean) : [];
  const rightParts = rightRaw ? rightRaw.split(":").filter(Boolean) : [];

  const expandEmbeddedIpv4 = (segments: string[]) => {
    if (!segments.length) {
      return segments;
    }
    const last = segments[segments.length - 1];
    if (!last.includes(".")) {
      return segments;
    }
    const parsedIpv4 = parseIpv4(last);
    if (!parsedIpv4) {
      return null;
    }
    const high = Number((parsedIpv4.value >> BigInt(16)) & BigInt(0xffff)).toString(16);
    const low = Number(parsedIpv4.value & BigInt(0xffff)).toString(16);
    return [...segments.slice(0, -1), high, low];
  };

  const expandedLeft = expandEmbeddedIpv4(leftParts);
  const expandedRight = expandEmbeddedIpv4(rightParts);
  if (!expandedLeft || !expandedRight) {
    return null;
  }

  if (doubleColonCount === 0 && expandedLeft.length !== 8) {
    return null;
  }
  if (expandedLeft.length + expandedRight.length > 8) {
    return null;
  }

  const fill = new Array(Math.max(0, 8 - expandedLeft.length - expandedRight.length)).fill("0");
  const parts = [...expandedLeft, ...fill, ...expandedRight];
  if (parts.length !== 8) {
    return null;
  }

  let value = BigInt(0);
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) {
      return null;
    }
    const segment = Number.parseInt(part, 16);
    if (!Number.isFinite(segment) || segment < 0 || segment > 0xffff) {
      return null;
    }
    value = (value << BigInt(16)) + BigInt(segment);
  }

  return {
    version: 6,
    bits: 128,
    value,
  };
}

function parseIp(input: string): IpValue | null {
  const value = input.trim();
  if (!value) {
    return null;
  }

  if (value.includes(".")) {
    const v4 = parseIpv4(value);
    if (v4) {
      return v4;
    }
  }
  if (value.includes(":")) {
    const v6 = parseIpv6(value);
    if (v6) {
      return v6;
    }
  }
  return null;
}

function splitAllowlist(rawAllowlist: string) {
  return rawAllowlist
    .split(/[\s,;\r\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function inCidrRange(ip: IpValue, cidr: string) {
  const [baseRaw, prefixRaw] = cidr.split("/");
  const base = parseIp(baseRaw || "");
  if (!base || base.version !== ip.version) {
    return false;
  }
  const prefix = Number.parseInt((prefixRaw || "").trim(), 10);
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > ip.bits) {
    return false;
  }

  if (prefix === 0) {
    return true;
  }
  if (prefix === ip.bits) {
    return ip.value === base.value;
  }

  const shift = BigInt(ip.bits - prefix);
  return (ip.value >> shift) === (base.value >> shift);
}

export function isIpAllowedByList(ip: string | null, rawAllowlist: string | null | undefined) {
  const allowlist = splitAllowlist((rawAllowlist || "").trim());
  if (!allowlist.length) {
    return true;
  }
  const parsedIp = parseIp(ip || "");
  if (!parsedIp) {
    return false;
  }

  for (const rule of allowlist) {
    if (rule.includes("/")) {
      if (inCidrRange(parsedIp, rule)) {
        return true;
      }
      continue;
    }
    const parsedRuleIp = parseIp(rule);
    if (parsedRuleIp && parsedRuleIp.version === parsedIp.version && parsedRuleIp.value === parsedIp.value) {
      return true;
    }
  }
  return false;
}

type HeaderLookup = {
  get: (name: string) => string | null;
};

export function getRequestIpFromHeaders(headers: HeaderLookup) {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    null
  );
}

export function getRequestIp(request: Request) {
  return getRequestIpFromHeaders(request.headers);
}

function retryAfterSeconds(lockedUntil: Date, now: Date) {
  const seconds = Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
  return Math.max(1, seconds);
}

const prismaRateLimitStore: RateLimitStore = {
  async findUnique(key) {
    const row = await prisma.authRateLimit.findUnique({
      where: { key },
      select: {
        key: true,
        attempts: true,
        lockedUntil: true,
        lastAttemptAt: true,
      },
    });
    if (!row) {
      return null;
    }
    return {
      key: row.key,
      attempts: row.attempts,
      lockedUntil: row.lockedUntil,
      lastAttemptAt: row.lastAttemptAt,
    };
  },
  async upsert(input) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const existing = await prisma.authRateLimit.findUnique({
        where: { key: input.key },
        select: {
          key: true,
          attempts: true,
          lockedUntil: true,
          lastAttemptAt: true,
        },
      });

      if (!existing) {
        const created = input.create();
        try {
          await prisma.authRateLimit.create({
            data: {
              key: created.key,
              attempts: created.attempts,
              lockedUntil: created.lockedUntil,
              lastAttemptAt: created.lastAttemptAt,
            },
          });
          return created;
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            continue;
          }
          throw error;
        }
      }

      const existingRecord: RateLimitRecord = {
        key: existing.key,
        attempts: existing.attempts,
        lockedUntil: existing.lockedUntil,
        lastAttemptAt: existing.lastAttemptAt,
      };
      const updated = input.update(existingRecord);
      const updateResult = await prisma.authRateLimit.updateMany({
        where: {
          key: input.key,
          attempts: existingRecord.attempts,
          lockedUntil: existingRecord.lockedUntil,
          lastAttemptAt: existingRecord.lastAttemptAt,
        },
        data: {
          attempts: updated.attempts,
          lockedUntil: updated.lockedUntil,
          lastAttemptAt: updated.lastAttemptAt,
        },
      });
      if (updateResult.count === 1) {
        return updated;
      }
    }
    throw new Error("AUTH_RATE_LIMIT_CONTENTION");
  },
};

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function nextRateLimitState(
  existing: RateLimitRecord | null,
  options: Pick<RateLimitOptions, "maxAttempts" | "windowMs" | "lockMs">,
  now: Date,
) {
  const lockMs = options.lockMs ?? options.windowMs;
  if (existing?.lockedUntil && existing.lockedUntil.getTime() > now.getTime()) {
    return {
      attempts: existing.attempts,
      lockedUntil: existing.lockedUntil,
      lastAttemptAt: existing.lastAttemptAt,
    };
  }

  const withinWindow = Boolean(
    existing?.lastAttemptAt && now.getTime() - existing.lastAttemptAt.getTime() <= options.windowMs,
  );
  const attempts = withinWindow ? (existing?.attempts ?? 0) + 1 : 1;
  const lockedUntil = attempts > options.maxAttempts ? new Date(now.getTime() + lockMs) : null;
  return {
    attempts: lockedUntil ? 0 : attempts,
    lockedUntil,
    lastAttemptAt: now,
  };
}

export async function applyRateLimitWithStore(store: RateLimitStore, options: RateLimitOptions): Promise<RateLimitResult> {
  const now = options.now || new Date();
  const existing = await store.findUnique(options.key);

  if (existing?.lockedUntil && existing.lockedUntil.getTime() > now.getTime()) {
    return {
      allowed: false,
      retryAfterSeconds: retryAfterSeconds(existing.lockedUntil, now),
    };
  }

  const updated = await store.upsert({
    key: options.key,
    create: () => ({
      key: options.key,
      ...nextRateLimitState(null, options, now),
    }),
    update: (current) => ({
      key: options.key,
      ...nextRateLimitState(current, options, now),
    }),
  });

  const lockedUntil = updated.lockedUntil;
  if (!lockedUntil) {
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterSeconds: retryAfterSeconds(lockedUntil, now),
  };
}

export async function applyRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  if (!hasDatabaseConfig()) {
    // Local/test runtime without Prisma DB connectivity should not hard-fail API paths.
    return { allowed: true };
  }
  try {
    return await applyRateLimitWithStore(prismaRateLimitStore, options);
  } catch {
    if (options.failOpen) {
      return { allowed: true };
    }
    const retryAfterSeconds = Math.max(1, Math.trunc(options.failureRetryAfterSeconds ?? 60));
    return {
      allowed: false,
      retryAfterSeconds,
    };
  }
}
