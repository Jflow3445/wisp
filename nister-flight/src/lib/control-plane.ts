import { planRequiresBrokerRuntimeSetup } from "@/lib/product-capabilities";
import crypto from "node:crypto";
import {
  AgentHostType,
  AgentStatus,
  BrokerAccountMode,
  BrokerAccountStatus,
  Prisma,
  type AiAction,
  type Agent,
} from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { evaluatePolicyCommandEligibility, evaluatePublishEligibility, marketFromAssetClass } from "@/lib/execution-access";
import { notifyUser } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getPublicAppBaseUrl } from "@/lib/public-url";
import { isIpAllowedByList } from "@/lib/request-security";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

const AI_TIME_DRIFT_SECONDS = 300;
const AGENT_TIME_DRIFT_SECONDS = 300;
const AI_NONCE_TTL_SECONDS = 600;
const AGENT_NONCE_TTL_SECONDS = 600;
const AGENT_ACCESS_TOKEN_SECONDS = 15 * 60;
const AGENT_REFRESH_TOKEN_SECONDS = 14 * 24 * 60 * 60;
const INCLUDE_HIGH_VOLUME_AUDIT = ["1", "true", "yes", "on"].includes(
  String(process.env.CONTROL_PLANE_AUDIT_INCLUDE_HIGH_VOLUME || "").trim().toLowerCase(),
);
const HIGH_VOLUME_AUDIT_EVENTS = new Set<string>([
  "AGENT_HEARTBEAT",
  "AGENT_COMMAND_POLL",
  "POSITION_SNAPSHOT_REPORTED",
]);

const SUPPORTED_ACTION_TYPES = [
  "OPEN",
  "CLOSE",
  "ADJUST_SL",
  "ADJUST_TP",
  "CLOSE_ALL_SYMBOL",
  "CLOSE_ALL_ACCOUNT",
  "HOLD",
] as const;

type SupportedActionType = (typeof SUPPORTED_ACTION_TYPES)[number];

const SUPPORTED_SIDE_VALUES = ["LONG", "SHORT", "NONE"] as const;
type SupportedSide = (typeof SUPPORTED_SIDE_VALUES)[number];

function normalizeActionTypeForValidation(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function normalizeSideForValidation(value: string): string {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "BUY") {
    return "LONG";
  }
  if (normalized === "SELL") {
    return "SHORT";
  }
  return normalized;
}

const supportedActionTypeSet = new Set<string>(SUPPORTED_ACTION_TYPES);
const supportedSideSet = new Set<string>(SUPPORTED_SIDE_VALUES);

export const aiActionSchema = z.object({
  action_id: z.string().trim().min(6).max(128),
  strategy_id: z.string().trim().min(2).max(128),
  symbol: z.string().trim().min(3).max(32).transform((value) => value.toUpperCase()),
  asset_class: z.string().trim().min(2).max(32),
  action_type: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .transform((value) => normalizeActionTypeForValidation(value))
    .refine((value) => supportedActionTypeSet.has(value), "Unsupported action_type"),
  side: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .transform((value) => normalizeSideForValidation(value))
    .refine((value) => supportedSideSet.has(value), "Unsupported side"),
  confidence: z.number().min(0).max(1).optional(),
  reason_code: z.string().trim().max(128).optional(),
  risk_profile: z.record(z.string(), z.unknown()),
  market_context: z.record(z.string(), z.unknown()),
  issued_at: z.string().datetime(),
});

export const createBrokerAccountSchema = z.object({
  broker_option_id: z.string().trim().min(1).max(191).optional(),
  broker_name: z.string().trim().min(2).max(128),
  broker_server: z.string().trim().min(2).max(128),
  account_login: z.string().trim().min(2).max(64),
  account_mode: z.enum(["demo", "real"]),
});

export const enrollmentTokenRequestSchema = z.object({
  host_type: z.enum(["local", "vps"]),
  device_name: z.string().trim().min(2).max(128),
  allow_leader: z.boolean().default(true),
  expires_in_minutes: z.number().int().min(5).max(1440).default(240),
});

export const agentRegisterSchema = z.object({
  enrollment_token: z.string().trim().min(20).max(512),
  broker_account_id: z
    .string()
    .trim()
    .max(191)
    .optional()
    .transform((value) => {
      const normalized = (value || "").trim();
      return normalized.length ? normalized : null;
    }),
  broker_login: z.string().trim().min(1).max(64),
  broker_server: z.string().trim().min(2).max(128),
  host_type: z.enum(["local", "vps"]),
  device_name: z.string().trim().min(2).max(128),
  terminal_fingerprint: z.string().trim().min(8).max(128),
  ea_version: z.string().trim().min(1).max(32),
  agent_public_key: z.string().trim().max(4000).nullable().optional(),
});

export function normalizeRuntimeVersionField<T extends Record<string, unknown>>(payload: T) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const body = payload as Record<string, unknown>;
  if (typeof body.ea_version === "string" && body.ea_version.trim()) {
    return payload;
  }

  const appVersion = body.app_version;
  if (typeof appVersion === "string" && appVersion.trim()) {
    return {
      ...body,
      ea_version: appVersion,
    } as unknown as T;
  }

  return payload;
}

export const refreshTokenSchema = z.object({
  refresh_token: z.string().trim().min(16).max(512),
});

export const heartbeatSchema = z.object({
  agent_id: z.string().trim().min(1),
  broker_account_id: z.string().trim().min(1),
  broker_login: z.string().trim().min(1).max(64),
  broker_server: z.string().trim().min(2).max(128),
  last_sequence_seen: z.number().int().nonnegative().optional(),
  equity: z.number().optional(),
  balance: z.number().optional(),
  margin: z.number().optional(),
  free_margin: z.number().optional(),
  connected_to_trade_server: z.boolean(),
  trade_allowed_terminal: z.boolean(),
  trade_allowed_program: z.boolean(),
  trade_allowed_account: z.boolean(),
  trade_allowed_expert: z.boolean(),
  host_health: z.record(z.string(), z.unknown()).optional(),
  local_mode_flags: z.record(z.string(), z.unknown()).optional(),
  symbol_capabilities: z.array(z.record(z.string(), z.unknown())).optional(),
  ea_version: z.string().trim().max(32).optional(),
  sent_at: z.string().datetime(),
});

export const commandAckSchema = z.object({
  agent_id: z.string().trim().min(1),
  sequence_no: z.number().int().nonnegative(),
  acked_at: z.string().datetime(),
});

export const executionReportSchema = z.object({
  command_id: z.string().trim().min(1),
  agent_id: z.string().trim().min(1),
  broker_account_id: z.string().trim().min(1),
  symbol: z.string().trim().min(2).max(32),
  execution_result: z.string().trim().min(2).max(32),
  broker_ticket: z.string().trim().max(64).optional(),
  rejection_code: z.string().trim().max(64).optional(),
  execution_price: z.number().optional(),
  execution_volume: z.number().optional(),
  sl: z.number().optional(),
  tp: z.number().optional(),
  execution_time: z.string().datetime(),
  raw_result: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const positionSnapshotSchema = z.object({
  agent_id: z.string().trim().min(1),
  broker_account_id: z.string().trim().min(1),
  snapshot_time: z.string().datetime(),
  equity: z.number(),
  balance: z.number(),
  margin: z.number().optional(),
  free_margin: z.number().optional(),
  positions: z.array(z.record(z.string(), z.unknown())),
  orders: z.array(z.record(z.string(), z.unknown())),
});

type JsonResponseInit = {
  status?: number;
};

export function jsonResponse(data: unknown, init?: JsonResponseInit) {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export function errorResponse(status: number, errorCode: string, message: string, correlationId?: string) {
  return jsonResponse(
    {
      status: "rejected",
      error_code: errorCode,
      message,
      correlation_id: correlationId || randomId("corr"),
    },
    { status },
  );
}

export function randomId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sha256Buffer(input: string) {
  return crypto.createHash("sha256").update(input).digest();
}

export function normalizeJsonBodyString(rawBody: string) {
  if (!rawBody) {
    return "";
  }
  let normalized = rawBody;
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }
  return normalized.replace(/\u0000+$/g, "");
}

function hmacBase64(secret: string, payload: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64");
}

function timingSafeEquals(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) {
    return false;
  }
  return crypto.timingSafeEqual(aa, bb);
}

function tokenSecret() {
  const raw = (process.env.AGENT_TOKEN_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || "");
  const production = process.env.NODE_ENV === "production";
  if (production && raw.length < 32) {
    throw new Error("AGENT_TOKEN_SECRET (or SESSION_SECRET fallback) must be strong in production.");
  }
  const safe = raw || "development-agent-token-secret";
  return new TextEncoder().encode(safe);
}

function configuredInternalServiceTokens() {
  const tokens = new Set<string>();
  const primary = (process.env.CONTROL_PLANE_INTERNAL_TOKEN || "").trim();
  if (primary) {
    tokens.add(primary);
  }

  const rotating = process.env.CONTROL_PLANE_INTERNAL_TOKENS || "";
  for (const part of rotating.split(/[\r\n,;]+/)) {
    const token = part.trim();
    if (token) {
      tokens.add(token);
    }
  }

  return Array.from(tokens);
}

type CommandSigningKeyRecord = {
  keyId: string;
  secret: string;
};

function parseCommandSigningKeys(value: string) {
  const raw = value.trim();
  if (!raw) {
    return [] as CommandSigningKeyRecord[];
  }

  const out: CommandSigningKeyRecord[] = [];
  const seen = new Set<string>();

  const push = (keyId: string, secret: string) => {
    const normalizedKeyId = keyId.trim();
    const normalizedSecret = secret.trim();
    if (!normalizedKeyId || !normalizedSecret || seen.has(normalizedKeyId)) {
      return;
    }
    seen.add(normalizedKeyId);
    out.push({ keyId: normalizedKeyId, secret: normalizedSecret });
  };

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [keyId, secret] of Object.entries(parsed)) {
        if (typeof secret === "string") {
          push(keyId, secret);
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) {
      continue;
    }

    const colonIndex = token.indexOf(":");
    const equalsIndex = token.indexOf("=");
    let separatorIndex = -1;
    if (colonIndex >= 0 && equalsIndex >= 0) {
      separatorIndex = Math.min(colonIndex, equalsIndex);
    } else if (colonIndex >= 0) {
      separatorIndex = colonIndex;
    } else if (equalsIndex >= 0) {
      separatorIndex = equalsIndex;
    }
    if (separatorIndex <= 0) {
      continue;
    }
    push(token.slice(0, separatorIndex), token.slice(separatorIndex + 1));
  }

  return out;
}

function commandSigningKeys() {
  const keyed = parseCommandSigningKeys(process.env.COMMAND_SIGNING_KEYS?.trim() || "");
  if (keyed.length) {
    return keyed;
  }

  const fallbackSecret = process.env.COMMAND_SIGNING_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || "";
  const production = process.env.NODE_ENV === "production";
  if (production && fallbackSecret.length < 32) {
    throw new Error("COMMAND_SIGNING_SECRET (or SESSION_SECRET fallback) must be strong in production.");
  }
  const fallbackKeyId = process.env.COMMAND_SIGNING_ACTIVE_KEY_ID?.trim() || "srv_sig_01";
  return [{ keyId: fallbackKeyId, secret: fallbackSecret || "development-command-signing-secret" }];
}

function activeCommandSigningKey() {
  const keys = commandSigningKeys();
  const requested = process.env.COMMAND_SIGNING_ACTIVE_KEY_ID?.trim();
  if (requested) {
    const matched = keys.find((entry) => entry.keyId === requested);
    if (matched) {
      return matched;
    }
  }
  return keys[0];
}

export function getCommandSigningDescriptor() {
  const active = activeCommandSigningKey();
  return {
    algorithm: "hmac_sha256" as const,
    key_id: active.keyId,
    public_key: null as string | null,
  };
}

export function getCommandSigningKeyMeta() {
  const active = activeCommandSigningKey();
  const keys = commandSigningKeys();
  return {
    algorithm: "hmac_sha256" as const,
    activeKeyId: active.keyId,
    keyIds: keys.map((item) => item.keyId),
  };
}

function baseUrl() {
  return getPublicAppBaseUrl();
}

function normalizePath(path: string) {
  const value = (path || "").trim();
  return value.startsWith("/") ? value : `/${value}`;
}

function canonicalRequestPath(request: Request) {
  const url = new URL(request.url);
  return `${url.pathname}${url.search || ""}`;
}

function canonicalPathVariants(pathWithQuery: string) {
  const value = pathWithQuery || "/";
  const queryIndex = value.indexOf("?");
  const pathnameRaw = queryIndex >= 0 ? value.slice(0, queryIndex) : value;
  const query = queryIndex >= 0 ? value.slice(queryIndex) : "";
  const pathname = pathnameRaw || "/";

  const variants = new Set<string>();
  variants.add(`${pathname}${query}`);

  const collapsed = pathname.replace(/\/{2,}/g, "/");
  variants.add(`${collapsed || "/"}${query}`);

  const trimmed =
    collapsed.length > 1
      ? collapsed.replace(/\/+$/g, "") || "/"
      : collapsed || "/";
  variants.add(`${trimmed}${query}`);

  return Array.from(variants);
}

function aiSignaturePayload(input: {
  method: string;
  path: string;
  bodySha256: string;
  timestamp: string;
  nonce: string;
  serviceId: string;
  modelId: string;
  keyVersion: string;
}) {
  return [
    input.method.toUpperCase(),
    normalizePath(input.path),
    input.bodySha256,
    input.timestamp,
    input.nonce,
    input.serviceId,
    input.modelId,
    input.keyVersion,
  ].join("\n");
}

function agentSignaturePayload(input: {
  method: string;
  path: string;
  bodySha256: string;
  timestamp: string;
  nonce: string;
  agentId: string;
  keyVersion: string;
}) {
  return [
    input.method.toUpperCase(),
    normalizePath(input.path),
    input.bodySha256,
    input.timestamp,
    input.nonce,
    input.agentId,
    input.keyVersion,
  ].join("\n");
}

export function commandSignaturePayload(input: {
  commandId: string;
  sequenceNo: bigint;
  brokerAccountId: string;
  symbol: string;
  commandType: string;
  side: string;
  payloadSha256: string;
  issuedAt: string;
  expiresAt: string;
}) {
  return [
    input.commandId,
    String(input.sequenceNo),
    input.brokerAccountId,
    input.symbol,
    input.commandType,
    input.side,
    input.payloadSha256,
    input.issuedAt,
    input.expiresAt,
  ].join("\n");
}

function timestampWithinDrift(isoTs: string, maxDriftSeconds: number) {
  const ts = Date.parse(isoTs);
  if (!Number.isFinite(ts)) {
    return false;
  }
  const driftMs = Math.abs(Date.now() - ts);
  return driftMs <= maxDriftSeconds * 1000;
}

async function registerAiNonce(aiServiceId: string, nonce: string) {
  try {
    await prisma.aiNonce.create({
      data: {
        aiServiceId,
        nonce,
        expiresAt: new Date(Date.now() + AI_NONCE_TTL_SECONDS * 1000),
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function registerAgentNonce(agentId: string, nonce: string) {
  try {
    await prisma.agentNonce.create({
      data: {
        agentId,
        nonce,
        expiresAt: new Date(Date.now() + AGENT_NONCE_TTL_SECONDS * 1000),
      },
    });
    return true;
  } catch {
    return false;
  }
}

function envAiServiceSecret(serviceId: string) {
  const normalized = serviceId.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return process.env[`AI_SERVICE_SECRET_${normalized}`]?.trim() || null;
}

async function resolveAiServiceSigningSecret(service: {
  id: string;
  serviceName: string;
  signingSecret: string | null;
  signingSecretKeyVersion?: number | null;
}) {
  const stored = service.signingSecret || "";
  if (!stored) {
    return envAiServiceSecret(service.serviceName);
  }

  const resolved = decryptSecret(stored, service.signingSecretKeyVersion ?? null);
  if (resolved.migratedFromLegacy || resolved.needsReencrypt || !service.signingSecretKeyVersion) {
    try {
      const encrypted = encryptSecret(resolved.plaintext);
      await prisma.aiService.update({
        where: { id: service.id },
        data: {
          signingSecret: encrypted.ciphertext,
          signingSecretKeyVersion: encrypted.keyVersion,
        },
      });
    } catch {
      // Non-blocking migration path.
    }
  }

  return resolved.plaintext;
}

async function resolveAgentSigningSecret(secret: {
  id?: string | null;
  secretCiphertext: string;
  secretKeyVersion?: number | null;
}) {
  const resolved = decryptSecret(secret.secretCiphertext, secret.secretKeyVersion ?? null);
  if (secret.id && (resolved.migratedFromLegacy || resolved.needsReencrypt || !secret.secretKeyVersion)) {
    try {
      const encrypted = encryptSecret(resolved.plaintext);
      await prisma.agentSecret.update({
        where: { id: secret.id },
        data: {
          secretCiphertext: encrypted.ciphertext,
          secretKeyVersion: encrypted.keyVersion,
        },
      });
    } catch {
      // Non-blocking migration path.
    }
  }
  return resolved.plaintext;
}

export async function verifyAiSignedRequest(request: Request, rawBody: string) {
  const correlationId = randomId("corr");
  const path = canonicalRequestPath(request);
  const auth = (request.headers.get("authorization") || "").trim();
  const serviceId = (request.headers.get("x-ai-service-id") || "").trim();
  const modelId = (request.headers.get("x-model-id") || "").trim();
  const modelVersion = (request.headers.get("x-model-version") || "").trim();
  const timestamp = (request.headers.get("x-timestamp") || "").trim();
  const nonce = (request.headers.get("x-nonce") || "").trim();
  const keyVersion = (request.headers.get("x-key-version") || "").trim();
  const signature = (request.headers.get("x-signature") || "").trim();

  if (!serviceId || !modelId || !timestamp || !nonce || !keyVersion || !signature) {
    return { ok: false as const, response: errorResponse(400, "MISSING_HEADERS", "Missing AI signing headers", correlationId) };
  }

  const internalTokens = configuredInternalServiceTokens();
  const requireInternalToken = process.env.NODE_ENV === "production" || internalTokens.length > 0;
  if (requireInternalToken) {
    if (!internalTokens.length) {
      return {
        ok: false as const,
        response: errorResponse(500, "SERVICE_TOKEN_UNSET", "Internal service token is not configured", correlationId),
      };
    }
    const presentedToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    let matchedToken = false;
    for (const token of internalTokens) {
      matchedToken = timingSafeEquals(token, presentedToken) || matchedToken;
    }
    if (!matchedToken) {
      return { ok: false as const, response: errorResponse(401, "INVALID_SERVICE_TOKEN", "Invalid internal service token", correlationId) };
    }
  }

  if (!timestampWithinDrift(timestamp, AI_TIME_DRIFT_SECONDS)) {
    return { ok: false as const, response: errorResponse(401, "TIMESTAMP_DRIFT", "Request timestamp outside allowed drift", correlationId) };
  }

  const service = await prisma.aiService.findUnique({
    where: { serviceName: serviceId },
    include: {
      models: {
        where: {
          modelId,
          active: true,
        },
        select: { id: true },
      },
    },
  });

  if (!service || service.status.toUpperCase() !== "ACTIVE") {
    return { ok: false as const, response: errorResponse(403, "SERVICE_NOT_ALLOWED", "AI service is not active", correlationId) };
  }

  const hasAllowlist = Boolean((service.ipAllowlist || "").trim());
  let sourceIp = normalizeRequestIp(request);
  if (hasAllowlist && !sourceIp) {
    if (proxyHeadersExplicitlyDisabled()) {
      return {
        ok: false as const,
        response: errorResponse(
          503,
          "SOURCE_IP_UNAVAILABLE",
          "IP allowlist is configured but source IP is unavailable while proxy headers are disabled",
          correlationId,
        ),
      };
    }
    sourceIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;
  }
  if (!isIpAllowedByList(sourceIp, service.ipAllowlist)) {
    return {
      ok: false as const,
      response: errorResponse(403, "SERVICE_IP_NOT_ALLOWED", "Source IP is not allowlisted for this service", correlationId),
    };
  }

  if (!service.models.length) {
    return { ok: false as const, response: errorResponse(403, "MODEL_NOT_ALLOWED", "Model is not allowlisted for this service", correlationId) };
  }

  if (String(service.keyVersion) !== keyVersion) {
    return { ok: false as const, response: errorResponse(401, "KEY_VERSION_MISMATCH", "Key version mismatch", correlationId) };
  }

  const normalizedBody = normalizeJsonBodyString(rawBody || "");
  const bodyHash = sha256Hex(normalizedBody);
  const secret = await resolveAiServiceSigningSecret({
    id: service.id,
    serviceName: service.serviceName,
    signingSecret: service.signingSecret,
    signingSecretKeyVersion: service.signingSecretKeyVersion,
  });
  if (!secret) {
    return { ok: false as const, response: errorResponse(500, "SERVICE_KEY_UNSET", "Service signing secret is not configured", correlationId) };
  }

  let signatureOk = false;
  for (const candidatePath of canonicalPathVariants(path)) {
    const canonical = aiSignaturePayload({
      method: request.method,
      path: candidatePath,
      bodySha256: bodyHash,
      timestamp,
      nonce,
      serviceId,
      modelId,
      keyVersion,
    });
    if (timingSafeEquals(hmacBase64(secret, canonical), signature)) {
      signatureOk = true;
      break;
    }
    if (normalizedBody.length === 0) {
      // Legacy clients signed empty bodies with an empty hash string.
      const legacyCanonical = aiSignaturePayload({
        method: request.method,
        path: candidatePath,
        bodySha256: "",
        timestamp,
        nonce,
        serviceId,
        modelId,
        keyVersion,
      });
      if (timingSafeEquals(hmacBase64(secret, legacyCanonical), signature)) {
        signatureOk = true;
        break;
      }
    }
  }
  if (!signatureOk) {
    return { ok: false as const, response: errorResponse(401, "INVALID_SIGNATURE", "Signature verification failed", correlationId) };
  }

  const nonceOk = await registerAiNonce(service.id, nonce);
  if (!nonceOk) {
    return { ok: false as const, response: errorResponse(409, "NONCE_REPLAY", "Nonce already used", correlationId) };
  }

  return {
    ok: true as const,
    correlationId,
    service,
    modelId,
    modelVersion,
    bodyHash,
  };
}

type AgentVerificationOptions = {
  requireAccessToken?: boolean;
  expectedAgentId?: string;
};

export async function verifyAgentSignedRequest(request: Request, rawBody: string, options?: AgentVerificationOptions) {
  const correlationId = randomId("corr");
  const path = canonicalRequestPath(request);
  const auth = (request.headers.get("authorization") || "").trim();
  const agentId = (request.headers.get("x-agent-id") || "").trim();
  const timestamp = (request.headers.get("x-timestamp") || "").trim();
  const nonce = (request.headers.get("x-nonce") || "").trim();
  const keyVersion = (request.headers.get("x-key-version") || "").trim();
  const signature = (request.headers.get("x-signature") || "").trim();

  if (!agentId || !timestamp || !nonce || !keyVersion || !signature) {
    return { ok: false as const, response: errorResponse(400, "MISSING_HEADERS", "Missing agent signing headers", correlationId) };
  }

  if (options?.expectedAgentId && options.expectedAgentId !== agentId) {
    return { ok: false as const, response: errorResponse(403, "AGENT_MISMATCH", "Agent ID mismatch", correlationId) };
  }

  if (!timestampWithinDrift(timestamp, AGENT_TIME_DRIFT_SECONDS)) {
    return { ok: false as const, response: errorResponse(401, "TIMESTAMP_DRIFT", "Request timestamp outside allowed drift", correlationId) };
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      brokerAccount: {
        select: {
          id: true,
          status: true,
          isActive: true,
          accountLogin: true,
          brokerServer: true,
        },
      },
      secrets: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!agent || (agent.status !== AgentStatus.ACTIVE && agent.status !== AgentStatus.STANDBY)) {
    return { ok: false as const, response: errorResponse(403, "AGENT_REVOKED", "Agent is not active", correlationId) };
  }
  if (!agent.brokerAccount.isActive || agent.brokerAccount.status !== BrokerAccountStatus.ACTIVE) {
    return { ok: false as const, response: errorResponse(403, "AGENT_REVOKED", "Agent broker account is not active", correlationId) };
  }

  const keyVersionInt = Number.parseInt(keyVersion, 10);
  if (!Number.isFinite(keyVersionInt)) {
    return { ok: false as const, response: errorResponse(400, "INVALID_KEY_VERSION", "Invalid key version", correlationId) };
  }

  const secret = agent.secrets.find((item) => item.keyVersion === keyVersionInt && item.active);
  if (!secret) {
    return { ok: false as const, response: errorResponse(401, "UNKNOWN_KEY_VERSION", "Agent key version not active", correlationId) };
  }
  const signingSecret = await resolveAgentSigningSecret(secret);

  const normalizedBody = normalizeJsonBodyString(rawBody || "");
  const bodyHash = sha256Hex(normalizedBody);
  let signatureOk = false;
  for (const candidatePath of canonicalPathVariants(path)) {
    const canonical = agentSignaturePayload({
      method: request.method,
      path: candidatePath,
      bodySha256: bodyHash,
      timestamp,
      nonce,
      agentId,
      keyVersion,
    });
    if (timingSafeEquals(hmacBase64(signingSecret, canonical), signature)) {
      signatureOk = true;
      break;
    }
    if (normalizedBody.length === 0) {
      // Legacy clients signed empty bodies with an empty hash string.
      const legacyCanonical = agentSignaturePayload({
        method: request.method,
        path: candidatePath,
        bodySha256: "",
        timestamp,
        nonce,
        agentId,
        keyVersion,
      });
      if (timingSafeEquals(hmacBase64(signingSecret, legacyCanonical), signature)) {
        signatureOk = true;
        break;
      }
    }
  }
  if (!signatureOk) {
    return { ok: false as const, response: errorResponse(401, "INVALID_SIGNATURE", "Signature verification failed", correlationId) };
  }

  const needsAccessToken = options?.requireAccessToken !== false;
  if (needsAccessToken) {
    if (!auth.startsWith("Bearer ")) {
      return { ok: false as const, response: errorResponse(401, "MISSING_ACCESS_TOKEN", "Missing access token", correlationId) };
    }
    const token = auth.slice(7).trim();
    try {
      const verified = await jwtVerify(token, tokenSecret(), {
        algorithms: ["HS256"],
        clockTolerance: 5,
      });
      const jti = typeof verified.payload.jti === "string" ? verified.payload.jti : "";
      if (verified.payload.sub !== agent.id || verified.payload.typ !== "agent_access" || !jti) {
        return { ok: false as const, response: errorResponse(401, "INVALID_ACCESS_TOKEN", "Invalid access token", correlationId) };
      }

      const session = await prisma.agentSession.findUnique({
        where: { accessTokenJti: jti },
        select: {
          agentId: true,
          revokedAt: true,
          accessExpiresAt: true,
        },
      });
      if (!session || session.agentId !== agent.id || session.revokedAt || session.accessExpiresAt.getTime() <= Date.now()) {
        return { ok: false as const, response: errorResponse(401, "INVALID_ACCESS_TOKEN", "Invalid access token", correlationId) };
      }
    } catch {
      return { ok: false as const, response: errorResponse(401, "INVALID_ACCESS_TOKEN", "Invalid access token", correlationId) };
    }
  }

  const nonceOk = await registerAgentNonce(agent.id, nonce);
  if (!nonceOk) {
    return { ok: false as const, response: errorResponse(409, "NONCE_REPLAY", "Nonce already used", correlationId) };
  }

  return {
    ok: true as const,
    correlationId,
    agent,
  };
}

export async function signAndIssueAgentSession(
  agent: Agent,
  options?: {
    tx?: Prisma.TransactionClient;
  },
) {
  const now = Date.now();
  const accessExpiresAt = new Date(now + AGENT_ACCESS_TOKEN_SECONDS * 1000);
  const refreshExpiresAt = new Date(now + AGENT_REFRESH_TOKEN_SECONDS * 1000);
  const accessJti = randomId("jti");
  const refreshToken = randomId("rft") + crypto.randomBytes(24).toString("hex");
  const refreshTokenHash = sha256Hex(refreshToken);

  const accessToken = await new SignJWT({
    typ: "agent_access",
    aid: agent.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(agent.id)
    .setIssuedAt()
    .setJti(accessJti)
    .setExpirationTime(`${AGENT_ACCESS_TOKEN_SECONDS}s`)
    .sign(tokenSecret());

  const db = options?.tx || prisma;
  await db.agentSession.create({
    data: {
      agentId: agent.id,
      accessTokenJti: accessJti,
      refreshTokenHash,
      issuedAt: new Date(now),
      accessExpiresAt,
      refreshExpiresAt,
    },
  });

  return {
    accessToken,
    accessTokenExpiresAt: accessExpiresAt,
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt,
  };
}

export async function refreshAgentAccessToken(agentId: string, refreshToken: string) {
  const refreshHash = sha256Hex(refreshToken);
  const now = Date.now();
  const session = await prisma.agentSession.findFirst({
    where: {
      agentId,
      refreshTokenHash: refreshHash,
      revokedAt: null,
      refreshExpiresAt: {
        gt: new Date(now),
      },
    },
    orderBy: [{ issuedAt: "desc" }],
  });

  if (!session) {
    return null;
  }

  const accessJti = randomId("jti");
  const accessExpiresAt = new Date(now + AGENT_ACCESS_TOKEN_SECONDS * 1000);
  const token = await new SignJWT({
    typ: "agent_access",
    aid: agentId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(agentId)
    .setIssuedAt()
    .setJti(accessJti)
    .setExpirationTime(`${AGENT_ACCESS_TOKEN_SECONDS}s`)
    .sign(tokenSecret());

  await prisma.agentSession.update({
    where: { id: session.id },
    data: {
      accessTokenJti: accessJti,
      accessExpiresAt,
      lastSeenAt: new Date(),
    },
  });

  return {
    accessToken: token,
    accessTokenExpiresAt: accessExpiresAt,
  };
}

export function hashEnrollmentToken(rawToken: string) {
  return sha256Hex(rawToken.trim());
}

export function createEnrollmentTokenRaw() {
  return `enr_live_${crypto.randomBytes(24).toString("hex")}`;
}

export function formatAgentPolicy(policy: {
  policyVersion: number;
  aiEnabled: boolean;
  closeOnlyMode: boolean;
  manualApprovalMode: boolean;
  maxRiskPerTradePct: Prisma.Decimal;
  maxDailyLossPct: Prisma.Decimal;
  maxOpenTradesTotal: number;
  maxOpenTradesPerSymbol: number;
  maxSpreadPoints: number;
  maxSlippagePoints: number;
  weekendTradingAllowed: boolean;
  symbols: Array<{ symbol: string; isAllowed: boolean }>;
} | null) {
  const allowedSymbols = policy?.symbols.filter((item) => item.isAllowed).map((item) => item.symbol) ?? [];
  const blockedSymbols = policy?.symbols.filter((item) => !item.isAllowed).map((item) => item.symbol) ?? [];

  return {
    policy_version: policy?.policyVersion ?? 1,
    ai_enabled: policy?.aiEnabled ?? true,
    close_only_mode: policy?.closeOnlyMode ?? false,
    manual_approval_mode: policy?.manualApprovalMode ?? false,
    max_risk_per_trade_pct: policy ? Number(policy.maxRiskPerTradePct) : 1.0,
    max_daily_loss_pct: policy ? Number(policy.maxDailyLossPct) : 5.0,
    max_open_trades_total: policy?.maxOpenTradesTotal ?? 0,
    max_open_trades_per_symbol: policy?.maxOpenTradesPerSymbol ?? 0,
    max_spread_points: policy?.maxSpreadPoints ?? 20,
    max_slippage_points: policy?.maxSlippagePoints ?? 25,
    allowed_symbols: allowedSymbols,
    blocked_symbols: blockedSymbols,
    trading_sessions: ["london", "newyork"],
    weekend_trading_allowed: policy?.weekendTradingAllowed ?? false,
  };
}

export async function getEffectivePolicyForAgent(agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      brokerAccountId: true,
    },
  });
  if (!agent) {
    return null;
  }

  const policy = await prisma.userPolicy.findUnique({
    where: { brokerAccountId: agent.brokerAccountId },
    include: {
      symbols: {
        select: {
          symbol: true,
          isAllowed: true,
        },
      },
    },
  });

  return {
    brokerAccountId: agent.brokerAccountId,
    policy: formatAgentPolicy(policy),
  };
}

function normalizeCommandType(actionType: string): SupportedActionType | null {
  const value = normalizeActionTypeForValidation(actionType);
  if (supportedActionTypeSet.has(value)) {
    return value as SupportedActionType;
  }
  return null;
}

function normalizeSide(side: string): SupportedSide | null {
  const value = normalizeSideForValidation(side);
  if (supportedSideSet.has(value)) {
    return value as SupportedSide;
  }
  return null;
}

function commandExpiresAt() {
  return new Date(Date.now() + 5 * 60 * 1000);
}

function asJsonRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parsePositiveNumber(value: unknown) {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseNonNegativeInteger(value: unknown) {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
}

function inferPipSize(symbol: string, assetClass: string) {
  if (assetClass.toUpperCase().includes("FOREX")) {
    return symbol.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
  }
  return 0.0001;
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}

function derivePositionIntent(input: {
  commandType: string;
  side: string;
  symbol: string;
  assetClass: string;
  riskProfile: Record<string, unknown> | null;
  marketContext: Record<string, unknown> | null;
}) {
  const positionRef = randomId("posref");
  const lotSize = parsePositiveNumber(input.riskProfile?.lot_size);
  const explicitSl = parsePositiveNumber(input.riskProfile?.sl);
  const explicitTp = parsePositiveNumber(input.riskProfile?.tp);
  const slPips = parseNonNegativeInteger(input.riskProfile?.sl_pips);
  const tpPips = parseNonNegativeInteger(input.riskProfile?.tp_pips);
  const bid = parsePositiveNumber(input.marketContext?.bid);
  const ask = parsePositiveNumber(input.marketContext?.ask);
  const pipSize = parsePositiveNumber(input.marketContext?.pip_size) || inferPipSize(input.symbol, input.assetClass);

  let stopLoss: number | null = explicitSl;
  let takeProfit: number | null = explicitTp;

  if (input.commandType === "OPEN" && (stopLoss === null || takeProfit === null) && bid && ask && pipSize > 0) {
    const entryPrice = input.side === "SHORT" ? bid : ask;
    if (stopLoss === null && slPips !== null && slPips > 0) {
      const delta = slPips * pipSize;
      stopLoss = input.side === "SHORT" ? roundPrice(entryPrice + delta) : roundPrice(entryPrice - delta);
    }
    if (takeProfit === null && tpPips !== null && tpPips > 0) {
      const delta = tpPips * pipSize;
      takeProfit = input.side === "SHORT" ? roundPrice(entryPrice - delta) : roundPrice(entryPrice + delta);
    }
  }

  return {
    clientPositionRef: positionRef,
    lotSize,
    stopLoss,
    takeProfit,
  };
}

function startOfUtcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

async function resolveDailyLossPctForBrokerAccount(brokerAccountId: string, now: Date): Promise<number | null> {
  const dayStart = startOfUtcDay(now);
  const [baselineBeforeDay, latestSnapshot] = await Promise.all([
    prisma.positionSnapshot.findFirst({
      where: {
        brokerAccountId,
        snapshotTime: {
          lte: dayStart,
        },
      },
      orderBy: [{ snapshotTime: "desc" }],
      select: {
        balance: true,
      },
    }),
    prisma.positionSnapshot.findFirst({
      where: {
        brokerAccountId,
      },
      orderBy: [{ snapshotTime: "desc" }],
      select: {
        equity: true,
      },
    }),
  ]);

  let baseline = baselineBeforeDay;
  if (!baseline) {
    baseline = await prisma.positionSnapshot.findFirst({
      where: {
        brokerAccountId,
        snapshotTime: {
          gte: dayStart,
        },
      },
      orderBy: [{ snapshotTime: "asc" }],
      select: {
        balance: true,
      },
    });
  }

  if (!baseline || !latestSnapshot) {
    return null;
  }

  const openingBalance = Number(baseline.balance);
  const currentEquity = Number(latestSnapshot.equity);
  if (!Number.isFinite(openingBalance) || !Number.isFinite(currentEquity) || openingBalance <= 0) {
    return null;
  }

  const lossPct = ((openingBalance - currentEquity) / openingBalance) * 100;
  if (!Number.isFinite(lossPct)) {
    return null;
  }
  return Math.max(0, lossPct);
}

function buildPositionIntentPayload(input: {
  commandType: SupportedActionType;
  symbol: string;
  positionIntent: {
    clientPositionRef: string;
    lotSize: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
  };
}) {
  switch (input.commandType) {
    case "OPEN":
      return {
        mode: "new_position",
        client_position_ref: input.positionIntent.clientPositionRef,
        volume_lots: input.positionIntent.lotSize,
        stop_loss: input.positionIntent.stopLoss,
        take_profit: input.positionIntent.takeProfit,
      };
    case "CLOSE":
      return {
        mode: "close_position",
        client_position_ref: input.positionIntent.clientPositionRef,
        volume_lots: input.positionIntent.lotSize,
      };
    case "ADJUST_SL":
      return {
        mode: "adjust_stop_loss",
        client_position_ref: input.positionIntent.clientPositionRef,
        stop_loss: input.positionIntent.stopLoss,
      };
    case "ADJUST_TP":
      return {
        mode: "adjust_take_profit",
        client_position_ref: input.positionIntent.clientPositionRef,
        take_profit: input.positionIntent.takeProfit,
      };
    case "CLOSE_ALL_SYMBOL":
      return {
        mode: "close_all_symbol",
        symbol: input.symbol,
      };
    case "CLOSE_ALL_ACCOUNT":
      return {
        mode: "close_all_account",
      };
    case "HOLD":
      return {
        mode: "hold",
      };
  }
}

export async function projectAndPublishFromAiAction(aiAction: AiAction) {
  const actionMarket = marketFromAssetClass(aiAction.assetClass);
  const policiesRaw = await prisma.userPolicy.findMany({
    where: {
      aiEnabled: true,
      brokerAccount: {
        isActive: true,
        status: BrokerAccountStatus.ACTIVE,
      },
    },
    include: {
      symbols: true,
      brokerAccount: {
        select: {
          id: true,
          createdAt: true,
        },
      },
      user: {
        select: {
          subscription: {
            select: {
              status: true,
              expiresAt: true,
              plan: {
                select: {
                  automationMarket: true,
                  tier: true,
                  slug: true,
                  name: true,
                },
              },
            },
          },
          tradingProfile: {
            select: {
              accountState: true,
              tradeState: true,
              autotradeEnabled: true,
            },
          },
        },
      },
    },
  });

  const policiesByUser = new Map<string, (typeof policiesRaw)[number]>();
  for (const policy of policiesRaw) {
    const current = policiesByUser.get(policy.userId);
    if (!current) {
      policiesByUser.set(policy.userId, policy);
      continue;
    }
    if (policy.brokerAccount.createdAt.getTime() > current.brokerAccount.createdAt.getTime()) {
      policiesByUser.set(policy.userId, policy);
    }
  }
  const policies = Array.from(policiesByUser.values());

  let approved = 0;
  let blocked = 0;
  const publishEvaluatedAt = new Date();
  const dailyLossPctByBrokerAccount = new Map<string, number | null>();

  for (const policy of policies) {
    const commandType = normalizeCommandType(aiAction.actionType);
    const side = normalizeSide(aiAction.side);
    const commandTypeValue = commandType || normalizeActionTypeForValidation(aiAction.actionType);
    const sideValue = side || normalizeSideForValidation(aiAction.side);

    let blockedReason: string | null = null;
    if (!commandType) {
      blockedReason = "UNSUPPORTED_ACTION_TYPE";
    } else if (!side) {
      blockedReason = "UNSUPPORTED_SIDE";
    }

    if (!blockedReason) {
      const eligibility = evaluatePublishEligibility({
        actionMarket,
        personalRuntimeRequired: Boolean(policy.user.subscription?.plan && planRequiresBrokerRuntimeSetup(policy.user.subscription.plan)),
        subscriptionStatus: policy.user.subscription?.status,
        subscriptionExpiresAt: policy.user.subscription?.expiresAt,
        subscriptionMarket: policy.user.subscription?.plan.automationMarket,
        accountState: policy.user.tradingProfile?.accountState,
        tradeState: policy.user.tradingProfile?.tradeState,
        autotradeEnabled: policy.user.tradingProfile?.autotradeEnabled,
      });
      if (!eligibility.eligible) {
        blockedReason = eligibility.reason || "TRADING_NOT_ACTIVE";
      }
    }

    if (!blockedReason && commandType) {
      let dailyLossPct: number | null = null;
      if (commandType === "OPEN") {
        if (!dailyLossPctByBrokerAccount.has(policy.brokerAccountId)) {
          let resolved: number | null = null;
          try {
            resolved = await resolveDailyLossPctForBrokerAccount(policy.brokerAccountId, publishEvaluatedAt);
          } catch {
            resolved = null;
          }
          dailyLossPctByBrokerAccount.set(policy.brokerAccountId, resolved);
        }
        dailyLossPct = dailyLossPctByBrokerAccount.get(policy.brokerAccountId) ?? null;
      }

      const policyGate = evaluatePolicyCommandEligibility({
        commandType,
        symbol: aiAction.symbol,
        symbols: policy.symbols.map((row) => ({
          symbol: row.symbol,
          isAllowed: row.isAllowed,
        })),
        weekendTradingAllowed: policy.weekendTradingAllowed,
        maxDailyLossPct: Number(policy.maxDailyLossPct),
        dailyLossPct,
        now: publishEvaluatedAt,
      });
      if (!policyGate.eligible) {
        blockedReason = policyGate.reason || "POLICY_REJECTED";
      }
    }

    if (!blockedReason && policy.manualApprovalMode) {
      blockedReason = "MANUAL_APPROVAL_MODE";
    } else if (!blockedReason && policy.closeOnlyMode && commandType === "OPEN") {
      blockedReason = "CLOSE_ONLY_MODE";
    }

    const leader = blockedReason
      ? null
      : await prisma.agent.findFirst({
          where: {
            brokerAccountId: policy.brokerAccountId,
            isExecutionLeader: true,
            status: AgentStatus.ACTIVE,
          },
          orderBy: [{ updatedAt: "desc" }],
          select: {
            id: true,
            secrets: {
              where: { active: true },
              orderBy: [{ keyVersion: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: {
                id: true,
                keyVersion: true,
                secretCiphertext: true,
                secretKeyVersion: true,
              },
            },
          },
        });

    if (!leader && !blockedReason) {
      blockedReason = "NO_ACTIVE_LEADER";
    }
    const leaderSecret = leader?.secrets?.[0] || null;
    if (!blockedReason && !leaderSecret) {
      blockedReason = "NO_AGENT_SECRET";
    }
    let leaderSigningSecret = "";
    if (!blockedReason && leaderSecret) {
      try {
        leaderSigningSecret = await resolveAgentSigningSecret(leaderSecret);
      } catch {
        blockedReason = "NO_AGENT_SECRET";
      }
    }

    const riskProfile = asJsonRecord(aiAction.riskProfileJson);
    const marketContext = asJsonRecord(aiAction.marketContextJson);
    const positionIntent = derivePositionIntent({
      commandType: commandType || "HOLD",
      side: side || "NONE",
      symbol: aiAction.symbol,
      assetClass: aiAction.assetClass,
      riskProfile,
      marketContext,
    });

    const candidate = await prisma.commandCandidate.create({
      data: {
        actionId: aiAction.id,
        userId: policy.userId,
        brokerAccountId: policy.brokerAccountId,
        targetAgentPolicy: "LEADER_ONLY",
        symbol: aiAction.symbol,
        assetClass: aiAction.assetClass,
        commandType: commandTypeValue,
        side: sideValue,
        sizingJson: {
          mode: "risk_percent",
          risk_pct: Number(policy.maxRiskPerTradePct),
          requested_lot_size: positionIntent.lotSize,
        },
        executionConstraintsJson: {
          max_spread_points: policy.maxSpreadPoints,
          max_slippage_points: policy.maxSlippagePoints,
          expire_if_market_closed: true,
          allowed_fill_modes: ["FOK", "IOC"],
        },
        sl: positionIntent.stopLoss !== null ? new Prisma.Decimal(positionIntent.stopLoss.toFixed(8)) : null,
        tp: positionIntent.takeProfit !== null ? new Prisma.Decimal(positionIntent.takeProfit.toFixed(8)) : null,
        status: blockedReason ? "BLOCKED" : "APPROVED",
        blockedReason,
      },
    });

    if (blockedReason || !leader || !leaderSecret || !leaderSigningSecret) {
      blocked += 1;
      continue;
    }

    let published: { id: string; sequenceNo: bigint } | null = null;
    let publishedSequence = BigInt(0);
    const maxPublishAttempts = 5;
    for (let attempt = 0; attempt < maxPublishAttempts; attempt += 1) {
      const maxSeq = await prisma.publishedCommand.aggregate({
        where: { agentId: leader.id },
        _max: { sequenceNo: true },
      });
      const nextSeq = (maxSeq._max.sequenceNo ?? BigInt(0)) + BigInt(1);
      const issuedAt = new Date();
      const expiresAt = commandExpiresAt();
      const commandId = randomId("cmd");
      const payload = {
        command_id: commandId,
        action_id: aiAction.actionId,
        user_id: policy.userId,
        broker_account_id: policy.brokerAccountId,
        symbol: aiAction.symbol,
        asset_class: aiAction.assetClass,
        command_type: commandTypeValue,
        side: sideValue,
        position_intent: buildPositionIntentPayload({
          commandType: commandType || "HOLD",
          symbol: aiAction.symbol,
          positionIntent,
        }),
        sizing: {
          mode: "risk_percent",
          risk_pct: Number(policy.maxRiskPerTradePct),
        },
        execution_constraints: {
          max_spread_points: policy.maxSpreadPoints,
          max_slippage_points: policy.maxSlippagePoints,
          expire_if_market_closed: true,
          allowed_fill_modes: ["FOK", "IOC"],
        },
        risk_controls: {
          max_open_trades_total: policy.maxOpenTradesTotal,
          max_open_trades_per_symbol: policy.maxOpenTradesPerSymbol,
          close_only_override: policy.closeOnlyMode,
        },
        issued_at: issuedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      };

      const payloadString = JSON.stringify(payload);
      const payloadHash = sha256Hex(payloadString);
      const signatureSource = commandSignaturePayload({
        commandId,
        sequenceNo: nextSeq,
        brokerAccountId: policy.brokerAccountId,
        symbol: aiAction.symbol,
        commandType: commandTypeValue,
        side: sideValue,
        payloadSha256: payloadHash,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
      const signature = hmacBase64(leaderSigningSecret, signatureSource);

      try {
        published = await prisma.publishedCommand.create({
          data: {
            commandId,
            actionId: aiAction.id,
            userId: policy.userId,
            brokerAccountId: policy.brokerAccountId,
            agentId: leader.id,
            sequenceNo: nextSeq,
            symbol: aiAction.symbol,
            assetClass: aiAction.assetClass,
            commandType: commandTypeValue,
            side: sideValue,
            payloadJson: payload,
            signature,
            signatureKeyId: `agt_sig_v${leaderSecret.keyVersion}`,
            issuedAt,
            expiresAt,
            leaseStatus: "PENDING",
            executionStatus: "PENDING",
          },
          select: {
            id: true,
            sequenceNo: true,
          },
        });
        publishedSequence = nextSeq;
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          attempt + 1 < maxPublishAttempts
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!published) {
      await prisma.commandCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "BLOCKED",
          blockedReason: "SEQUENCE_CONTENTION",
        },
      });
      blocked += 1;
      continue;
    }

    await prisma.commandEvent.create({
      data: {
        commandId: published.id,
        eventType: "PUBLISHED",
        eventPayloadJson: {
          candidate_id: candidate.id,
          sequence_no: Number(publishedSequence),
          agent_id: leader.id,
        },
      },
    });

    approved += 1;
  }

  return {
    approved,
    blocked,
    total_candidates: approved + blocked,
  };
}

export async function writeAudit(input: {
  actorType: string;
  actorId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}, options?: {
  client?: Pick<Prisma.TransactionClient, "auditLog">;
  force?: boolean;
}) {
  if (!options?.force && !INCLUDE_HIGH_VOLUME_AUDIT && HIGH_VOLUME_AUDIT_EVENTS.has(input.eventType)) {
    return;
  }

  try {
    const db = options?.client ?? prisma;
    await db.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        metadataJson: input.metadata as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    let message = "";
    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === "string") {
      message = error;
    } else {
      try {
        message = JSON.stringify(error);
      } catch {
        message = String(error);
      }
    }
    const lower = String(message || "").toLowerCase();
    const isAuditTableFull =
      (lower.includes("auditlog") && lower.includes("table is full")) ||
      (lower.includes("code: 1114") && lower.includes("table is full"));

    if (isAuditTableFull) {
      console.warn(`[audit-log] skipped write because storage is full (event=${input.eventType}, actor=${input.actorType})`);
      return;
    }

    throw error;
  }
}

export async function pauseAutonomousExecutionForBrokerSpecMismatch(input: {
  userId: string;
  brokerAccountId: string;
  expectedBrokerLogin: string;
  expectedBrokerServer: string;
  receivedBrokerLogin: string;
  receivedBrokerServer: string;
  source: "register" | "heartbeat";
  actorAgentId?: string | null;
  correlationId?: string | null;
}) {
  let policyVersion: number | null = null;
  let policyChanged = false;
  let cancelledPendingCommands = 0;

  if (hasDatabaseConfig) {
    try {
    const updateResult = await prisma.$transaction(async (tx) => {
      const currentPolicy = await tx.userPolicy.findUnique({
        where: { brokerAccountId: input.brokerAccountId },
        select: {
          id: true,
          policyVersion: true,
          aiEnabled: true,
          closeOnlyMode: true,
        },
      });
      if (!currentPolicy) {
        return {
          policyVersion: null as number | null,
          policyChanged: false,
          cancelledPendingCommands: 0,
        };
      }

      let nextPolicyVersion = currentPolicy.policyVersion;
      let changed = false;
      if (currentPolicy.aiEnabled || !currentPolicy.closeOnlyMode) {
        nextPolicyVersion = currentPolicy.policyVersion + 1;
        await tx.userPolicy.update({
          where: { id: currentPolicy.id },
          data: {
            aiEnabled: false,
            closeOnlyMode: true,
            policyVersion: nextPolicyVersion,
          },
        });
        changed = true;
      }

      const cancelled = await tx.publishedCommand.updateMany({
        where: {
          brokerAccountId: input.brokerAccountId,
          leaseStatus: "PENDING",
          executionStatus: "PENDING",
        },
        data: {
          leaseStatus: "CANCELLED",
          executionStatus: "CANCELLED_POLICY_DISABLED",
        },
      });

      return {
        policyVersion: nextPolicyVersion,
        policyChanged: changed,
        cancelledPendingCommands: cancelled.count,
      };
    });

    policyVersion = updateResult.policyVersion;
    policyChanged = updateResult.policyChanged;
    cancelledPendingCommands = updateResult.cancelledPendingCommands;
    } catch {
    // Continue to response path even if emergency pause update fails unexpectedly.
    }
  }

  if (hasDatabaseConfig) {
    try {
    const title = "Trading paused: broker account mismatch";
    const recentNotice = await prisma.notification.findFirst({
      where: {
        userId: input.userId,
        title,
        createdAt: {
          gte: new Date(Date.now() - 15 * 60 * 1000),
        },
      },
      select: { id: true },
    });

    if (!recentNotice) {
      await notifyUser(input.userId, {
        title,
        message:
          "Your MetaTrader login/server does not match the approved broker account in Nister AI. Autonomous execution is paused until this is corrected.",
        href: "/dashboard/connect-app",
        email: {
          subject: "Nister AI paused autonomous execution for safety",
        },
      });
    }
    } catch {
    // Notification failures should not block API safety responses.
    }
  }

  if (hasDatabaseConfig) {
    try {
    await writeAudit({
      actorType: input.actorAgentId ? "AGENT" : "SYSTEM",
      actorId: input.actorAgentId || "system",
      eventType: "BROKER_SPEC_MISMATCH_PAUSED",
      entityType: "BROKER_ACCOUNT",
      entityId: input.brokerAccountId,
      metadata: {
        source: input.source,
        correlation_id: input.correlationId || null,
        expected_broker_login: input.expectedBrokerLogin,
        expected_broker_server: input.expectedBrokerServer,
        received_broker_login: input.receivedBrokerLogin,
        received_broker_server: input.receivedBrokerServer,
        policy_changed: policyChanged,
        policy_version: policyVersion,
        cancelled_pending_commands: cancelledPendingCommands,
      },
    });
    } catch {
    // Non-blocking.
    }
  }

  return {
    policyChanged,
    policyVersion,
    cancelledPendingCommands,
  };
}

export async function ensureBrokerAccountForUser(input: {
  userId: string;
  brokerOptionId?: string;
  brokerName: string;
  brokerServer: string;
  accountLogin: string;
  accountMode: "demo" | "real";
}) {
  const brokerOptionId = (input.brokerOptionId || "").trim();
  const brokerNameInput = input.brokerName.trim();
  const brokerOption = await prisma.brokerOption.findFirst({
    where: brokerOptionId
      ? {
          id: brokerOptionId,
          active: true,
        }
      : {
          name: brokerNameInput,
          active: true,
        },
    select: {
      id: true,
      name: true,
    },
  });

  if (!brokerOption) {
    throw new Error("UNSUPPORTED_BROKER");
  }

  const mode = input.accountMode === "real" ? BrokerAccountMode.REAL : BrokerAccountMode.DEMO;
  const existing = await prisma.brokerAccount.findFirst({
    where: {
      userId: input.userId,
      brokerServer: input.brokerServer,
      accountLogin: input.accountLogin,
    },
  });
  const existingAny = existing
    ? null
    : await prisma.brokerAccount.findFirst({
        where: {
          userId: input.userId,
        },
        orderBy: [{ createdAt: "desc" }],
      });
  const targetAccountId = existing?.id || existingAny?.id || null;

  let account;
  if (targetAccountId) {
    account = await prisma.brokerAccount.update({
      where: {
        id: targetAccountId,
      },
      data: {
        brokerName: brokerOption.name,
        brokerServer: input.brokerServer,
        accountLogin: input.accountLogin,
        accountMode: mode,
        status: BrokerAccountStatus.ACTIVE,
        isActive: true,
      },
    });
  } else {
    account = await prisma.brokerAccount.create({
      data: {
        userId: input.userId,
        brokerName: brokerOption.name,
        brokerServer: input.brokerServer,
        accountLogin: input.accountLogin,
        accountMode: mode,
        status: BrokerAccountStatus.ACTIVE,
        isActive: true,
      },
    });
  }

  await prisma.brokerAccount.updateMany({
    where: {
      userId: input.userId,
      id: { not: account.id },
    },
    data: {
      isActive: false,
      status: BrokerAccountStatus.DISABLED,
    },
  });

  return account;
}

export function enrollmentResponse(token: string, expiresAt: Date) {
  return {
    enrollment_token: token,
    expires_at: expiresAt.toISOString(),
    api_base_url: baseUrl(),
    allowlist_url: baseUrl(),
  };
}

export function mapHostType(value: "local" | "vps") {
  return value === "vps" ? AgentHostType.VPS : AgentHostType.LOCAL;
}

function trustProxyHeaders() {
  const raw = (process.env.CONTROL_PLANE_TRUST_PROXY_HEADERS || "").trim().toLowerCase();
  if (raw) {
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  }
  return process.env.NODE_ENV !== "production";
}

function proxyHeadersExplicitlyDisabled() {
  const raw = (process.env.CONTROL_PLANE_TRUST_PROXY_HEADERS || "").trim().toLowerCase();
  if (!raw) {
    return false;
  }
  return raw === "0" || raw === "false" || raw === "no" || raw === "off";
}

export function normalizeRequestIp(request: Request) {
  if (!trustProxyHeaders()) {
    return null;
  }
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export function commandHashFromPayload(payload: unknown) {
  return sha256Hex(JSON.stringify(payload));
}

export function bodyHashForRequest(rawBody: string) {
  return sha256Hex(rawBody || "");
}

export function bodyHashBase64(rawBody: string) {
  return sha256Buffer(rawBody || "").toString("base64");
}
