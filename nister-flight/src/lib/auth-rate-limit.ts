let warnedAuthRateLimitUnavailable = false;

export async function withAuthRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (attempt >= 2 || (code !== "P2002" && code !== "P2034")) throw error;
    }
  }
}

type PrismaLikeErrorMeta = {
  modelName?: unknown;
  table?: unknown;
  column?: unknown;
};

type PrismaLikeError = {
  code?: unknown;
  message?: unknown;
  meta?: PrismaLikeErrorMeta;
};

function includesAuthRateLimit(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  return /auth[_\s-]?rate[_\s-]?limit/i.test(value);
}

export function isAuthRateLimitSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const prismaError = error as PrismaLikeError;
  const code = typeof prismaError.code === "string" ? prismaError.code : "";
  if (code !== "P2021" && code !== "P2022") {
    return false;
  }

  if (includesAuthRateLimit(prismaError.meta?.modelName)) {
    return true;
  }
  if (includesAuthRateLimit(prismaError.meta?.table)) {
    return true;
  }
  if (includesAuthRateLimit(prismaError.meta?.column)) {
    return true;
  }
  if (includesAuthRateLimit(prismaError.message)) {
    return true;
  }

  return false;
}

function logAuthRateLimitFallback(error: unknown) {
  if (warnedAuthRateLimitUnavailable) {
    return;
  }
  warnedAuthRateLimitUnavailable = true;

  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "unknown";
  const message =
    typeof (error as { message?: unknown })?.message === "string"
      ? (error as { message: string }).message
      : "Auth rate limit schema unavailable";

  console.warn(`[auth-rate-limit] bypassing login rate-limit persistence (${code}): ${message}`);
}

export async function withAuthRateLimitFallback<T>(operation: () => Promise<T>, fallbackValue: T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isAuthRateLimitSchemaError(error)) {
      throw error;
    }
    logAuthRateLimitFallback(error);
    return fallbackValue;
  }
}
