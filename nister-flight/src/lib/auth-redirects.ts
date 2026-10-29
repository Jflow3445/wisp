export const DEFAULT_AUTH_NEXT = "/dashboard";
export const SUPPORT_AUTH_NEXT = "/dashboard/support";

const AUTH_REDIRECT_BASE = "https://nisterai.com";
const UNSAFE_PATH_CHARS = /[\u0000-\u001f\u007f\\]/;

function allowedAuthPath(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/app/onboarding" ||
    pathname.startsWith("/app/onboarding/")
  );
}

function fallbackPath(fallback: string) {
  return fallback.startsWith("/") && !fallback.startsWith("//") ? fallback : DEFAULT_AUTH_NEXT;
}

export function safeAuthNextPath(raw: unknown, fallback = DEFAULT_AUTH_NEXT) {
  const safeFallback = fallbackPath(fallback);
  const value = typeof raw === "string" ? raw.trim() : "";

  if (!value || !value.startsWith("/") || value.startsWith("//") || UNSAFE_PATH_CHARS.test(value)) {
    return safeFallback;
  }

  try {
    const url = new URL(value, AUTH_REDIRECT_BASE);
    if (url.origin !== AUTH_REDIRECT_BASE) {
      return safeFallback;
    }

    const decodedPathname = decodeURIComponent(url.pathname);
    if (UNSAFE_PATH_CHARS.test(decodedPathname) || !allowedAuthPath(url.pathname)) {
      return safeFallback;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return safeFallback;
  }
}

export function isExplicitAuthNextPath(path: unknown) {
  const safePath = safeAuthNextPath(path);
  return safePath !== DEFAULT_AUTH_NEXT;
}

export function isSupportAuthNextPath(path: unknown) {
  const safePath = safeAuthNextPath(path);
  try {
    return new URL(safePath, AUTH_REDIRECT_BASE).pathname === SUPPORT_AUTH_NEXT;
  } catch {
    return false;
  }
}

export function appendAuthNextParam(params: URLSearchParams, nextPath: string) {
  const safeNext = safeAuthNextPath(nextPath);
  if (isExplicitAuthNextPath(safeNext)) {
    params.set("next", safeNext);
  }
  return params;
}
