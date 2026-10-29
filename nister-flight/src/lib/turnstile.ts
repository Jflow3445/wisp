import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secret-box";

export type TurnstileAction = "signup" | "login" | "forgot-password";

type TurnstileSettingsLike = Record<string, unknown>;

type TurnstileActionState = {
  enabled: boolean;
  protect: boolean;
  siteKey: string | null;
};

type TurnstileVerifySuccess = {
  success: true;
};

type TurnstileVerifyFailure = {
  success: false;
  error: string;
};

export type TurnstileVerifyResult = TurnstileVerifySuccess | TurnstileVerifyFailure;

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";
const TURNSTILE_REQUIRED_ERROR = "Please complete the security check and try again.";
const TURNSTILE_FAILED_ERROR = "Security check failed. Please try again.";
const TURNSTILE_UNAVAILABLE_ERROR = "Security check is temporarily unavailable. Please try again later.";

function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

function asRecord(input: unknown): TurnstileSettingsLike {
  if (!input || typeof input !== "object") {
    return {};
  }
  return input as TurnstileSettingsLike;
}

function readString(record: TurnstileSettingsLike, key: string) {
  const value = record[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function readBoolean(record: TurnstileSettingsLike, key: string) {
  const value = record[key];
  return value === true || value === "true" || value === 1 || value === "1";
}

function actionToggleKey(action: TurnstileAction) {
  switch (action) {
    case "signup":
      return "turnstileProtectSignup";
    case "login":
      return "turnstileProtectLogin";
    case "forgot-password":
      return "turnstileProtectForgotPassword";
  }
}

function decryptedSecretValue(rawValue: string | null | undefined, storedKeyVersion?: number | null) {
  const value = (rawValue || "").trim();
  if (!value) {
    return null;
  }

  if (!value.startsWith("sb1:")) {
    return value;
  }

  try {
    const decrypted = decryptSecret(value, storedKeyVersion ?? null).plaintext.trim();
    return decrypted || null;
  } catch {
    return null;
  }
}

async function readTurnstileSecretFromDatabase() {
  if (!hasDatabaseConfig()) {
    return null;
  }

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ turnstileSecretKey: string | null; turnstileSecretKeyVersion: number | null }>>(
      "SELECT turnstileSecretKey, turnstileSecretKeyVersion FROM PlatformSetting WHERE id = ? LIMIT 1",
      1,
    );
    const row = rows[0] ?? null;
    if (!row?.turnstileSecretKey) {
      return null;
    }
    return decryptedSecretValue(row.turnstileSecretKey, row.turnstileSecretKeyVersion);
  } catch {
    return null;
  }
}

async function resolveTurnstileSecret(settings: unknown) {
  const record = asRecord(settings);

  const configuredSecret = decryptedSecretValue(
    readString(record, "turnstileSecretKey") || readString(record, "turnstileSecret") || readString(record, "turnstileSecretValue"),
    Number.isFinite(Number(record.turnstileSecretKeyVersion))
      ? Number(record.turnstileSecretKeyVersion)
      : null,
  );
  if (configuredSecret) {
    return configuredSecret;
  }

  const persistedSecret = await readTurnstileSecretFromDatabase();
  if (persistedSecret) {
    return persistedSecret;
  }

  return (process.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET || "").trim() || null;
}

export function getTurnstileActionState(settings: unknown, action: TurnstileAction): TurnstileActionState {
  const record = asRecord(settings);
  return {
    enabled: readBoolean(record, "turnstileEnabled"),
    protect: readBoolean(record, actionToggleKey(action)),
    siteKey: readString(record, "turnstileSiteKey"),
  };
}

export function shouldRenderTurnstileChallenge(settings: unknown, action: TurnstileAction) {
  const state = getTurnstileActionState(settings, action);
  return state.enabled && state.protect && Boolean(state.siteKey);
}

export function extractTurnstileToken(formData: FormData) {
  const raw = formData.get(TURNSTILE_RESPONSE_FIELD);
  if (typeof raw !== "string") {
    return null;
  }
  const token = raw.trim();
  return token || null;
}

function turnstileError(message: string): TurnstileVerifyFailure {
  return { success: false, error: message };
}

export async function verifyTurnstileToken(input: {
  secret: string;
  token: string;
  remoteIp?: string | null;
}): Promise<TurnstileVerifyResult> {
  if (!input.secret.trim()) {
    return turnstileError(TURNSTILE_UNAVAILABLE_ERROR);
  }
  if (!input.token.trim()) {
    return turnstileError(TURNSTILE_REQUIRED_ERROR);
  }

  try {
    const body = new URLSearchParams({
      secret: input.secret,
      response: input.token,
    });
    if (input.remoteIp && input.remoteIp.trim()) {
      body.set("remoteip", input.remoteIp.trim());
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      return turnstileError(TURNSTILE_FAILED_ERROR);
    }

    const payload = (await response.json().catch(() => null)) as
      | { success?: unknown }
      | null;

    if (!payload || payload.success !== true) {
      return turnstileError(TURNSTILE_FAILED_ERROR);
    }

    return { success: true };
  } catch {
    return turnstileError(TURNSTILE_FAILED_ERROR);
  }
}

export async function validateTurnstileSubmission(input: {
  settings: unknown;
  action: TurnstileAction;
  formData: FormData;
  remoteIp?: string | null;
}): Promise<TurnstileVerifyResult | { success: true }> {
  const state = getTurnstileActionState(input.settings, input.action);
  if (!state.enabled || !state.protect) {
    return { success: true };
  }

  const token = extractTurnstileToken(input.formData);
  if (!token) {
    return turnstileError(TURNSTILE_REQUIRED_ERROR);
  }

  const secret = await resolveTurnstileSecret(input.settings);
  if (!secret) {
    return turnstileError(TURNSTILE_UNAVAILABLE_ERROR);
  }

  return verifyTurnstileToken({
    secret,
    token,
    remoteIp: input.remoteIp,
  });
}

export function getTurnstileWidgetScriptUrl() {
  return TURNSTILE_SCRIPT_URL;
}

export function getTurnstileResponseFieldName() {
  return TURNSTILE_RESPONSE_FIELD;
}

export function getTurnstileSafeErrorMessage(result: TurnstileVerifyResult) {
  return result.success ? null : result.error;
}
