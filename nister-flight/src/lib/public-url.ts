const DEFAULT_PUBLIC_APP_URL = "https://nisterai.com";

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeProtocol(raw: string | null) {
  const value = (raw || "").split(",")[0]?.trim().toLowerCase() || "";
  if (value === "http" || value === "https") {
    return value;
  }
  return null;
}

function normalizeHost(raw: string | null) {
  return (raw || "").split(",")[0]?.trim().toLowerCase() || null;
}

function stripPort(host: string) {
  return host.replace(/:\d+$/, "");
}

function canonicalHostName(host: string) {
  return stripPort(host.trim().toLowerCase()).replace(/^\[|\]$/g, "").replace(/^www\./, "");
}

function isLoopbackHost(host: string) {
  const normalized = canonicalHostName(host);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function safeOrigin(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return null;
  }
}

function envConfiguredOrigins() {
  const values = [
    process.env.APP_BASE_URL || "",
    process.env.APP_ALLOWED_ORIGINS || "",
  ]
    .flatMap((entry) => entry.split(/[\s,;\r\n]+/))
    .map((entry) => entry.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const origin = safeOrigin(stripTrailingSlash(value));
    if (!origin) {
      continue;
    }
    if (process.env.NODE_ENV === "production" && isLoopbackHost(new URL(origin).hostname)) {
      continue;
    }
    if (!seen.has(origin)) {
      seen.add(origin);
      out.push(origin);
    }
  }
  return out;
}

export function getTrustedPublicOrigins() {
  const configured = envConfiguredOrigins();
  if (configured.length) {
    return configured;
  }
  if (process.env.NODE_ENV !== "production") {
    return ["http://localhost:3000", DEFAULT_PUBLIC_APP_URL];
  }
  return [DEFAULT_PUBLIC_APP_URL];
}

export function getTrustedPublicHosts() {
  const hosts = new Set(getTrustedPublicOrigins().map((origin) => canonicalHostName(new URL(origin).host)));
  if (process.env.NODE_ENV !== "production") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
    hosts.add("::1");
  }
  return hosts;
}

export function isTrustedPublicOrigin(origin: string) {
  const parsed = safeOrigin(origin);
  if (!parsed) {
    return false;
  }
  const trusted = getTrustedPublicOrigins();
  const host = canonicalHostName(new URL(parsed).host);
  return trusted.some((allowed) => canonicalHostName(new URL(allowed).host) === host);
}

export function getPublicAppBaseUrl() {
  const trusted = getTrustedPublicOrigins();
  const primary = trusted[0] || DEFAULT_PUBLIC_APP_URL;
  return stripTrailingSlash(primary);
}

export function getPublicOriginFromRequest(request: Request) {
  const trustedHosts = getTrustedPublicHosts();
  const hostHeader = normalizeHost(request.headers.get("x-forwarded-host")) || normalizeHost(request.headers.get("host"));
  const host = hostHeader || "";
  const hostName = canonicalHostName(host);
  const requestProtocol =
    normalizeProtocol(request.headers.get("x-forwarded-proto")) ||
    normalizeProtocol(new URL(request.url).protocol.replace(":", "")) ||
    (process.env.NODE_ENV === "production" ? "https" : "http");

  if (host && trustedHosts.has(hostName)) {
    const protocol = process.env.NODE_ENV === "production" ? "https" : requestProtocol;
    return `${protocol}://${host}`;
  }

  return getPublicAppBaseUrl();
}

export function toPublicUrl(path: string, request?: Request) {
  const base = request ? getPublicOriginFromRequest(request) : getPublicAppBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, base).toString();
}
