import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { appendAuthNextParam, safeAuthNextPath } from "@/lib/auth-redirects";
import { isOrgParentHost } from "@/lib/request-host";
import { getTrustedPublicHosts } from "@/lib/public-url";

const VISITOR_COOKIE_NAME = "nister_vid";
const SESSION_COOKIE_NAME = "nister_sid";
const PROTECTED_PATH_PREFIXES = ["/dashboard", "/admin", "/app"];
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LEGACY_SERVICE_COMPARISON_PATH = `/${["local", "vs", "managed", "vps", "trading", "automation"].join("-")}`;

function normalizeHost(rawHost: string | null | undefined) {
  return (rawHost || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/:\d+$/, "");
}

function originHost(origin: string) {
  try {
    return normalizeHost(new URL(origin).host);
  } catch {
    return "";
  }
}

function requestHost(request: NextRequest) {
  const forwarded = normalizeHost(request.headers.get("x-forwarded-host"));
  if (forwarded) {
    return forwarded;
  }
  return normalizeHost(request.headers.get("host"));
}

function requestProtocol(request: NextRequest) {
  const forwardedProto = (request.headers.get("x-forwarded-proto") || "").split(",")[0]?.trim().toLowerCase();
  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }
  return request.nextUrl.protocol.replace(":", "").toLowerCase();
}

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  const scriptUnsafeEval = dev ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${scriptUnsafeEval} https://static.cloudflareinsights.com https://www.clarity.ms https://client.crisp.chat https://widget.intercom.io https://js.intercomcdn.com https://app.intercom.io https://embed.tawk.to https://*.tawk.to https://www.googletagmanager.com https://www.google-analytics.com https://challenges.cloudflare.com https://*.posthog.com https://*.i.posthog.com`,
    "style-src 'self' 'unsafe-inline' https://*.tawk.to https://*.crisp.chat https://client.crisp.chat https://js.intercomcdn.com https://fonts.googleapis.com",
    "img-src 'self' https: data:",
    "font-src 'self' https: data:",
    "connect-src 'self' https: wss://*.tawk.to wss://client.relay.crisp.chat wss://client.relay.rescue.crisp.chat wss://*.intercom.io wss://*.intercom-messenger.com https://www.googletagmanager.com https://www.google-analytics.com https://challenges.cloudflare.com https://*.posthog.com https://*.i.posthog.com",
    "frame-src 'self' https://*.crisp.chat https://widget.intercom.io https://js.intercomcdn.com https://*.tawk.to https://challenges.cloudflare.com",
    "worker-src 'self' blob: https://client.crisp.chat",
    "media-src 'self' data: blob: https://*.tawk.to https://*.crisp.chat https://*.intercomcdn.com",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function securityHeaders(nonce: string) {
  return {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-DNS-Prefetch-Control": "off",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Origin-Agent-Cluster": "?1",
    "Content-Security-Policy": contentSecurityPolicy(nonce),
  };
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function decorateResponse(response: NextResponse, request: NextRequest, nonce: string) {
  const hasVisitor = Boolean(request.cookies.get(VISITOR_COOKIE_NAME)?.value);
  const hasSessionMarker = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!hasVisitor) {
    response.cookies.set(VISITOR_COOKIE_NAME, createId("vid"), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  if (!hasSessionMarker) {
    response.cookies.set(SESSION_COOKIE_NAME, createId("sid"), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }

  for (const [key, value] of Object.entries(securityHeaders(nonce))) {
    response.headers.set(key, value);
  }
  const ref = request.nextUrl.searchParams.get("ref");
  if (request.method === "GET" && ref && /^[A-Za-z0-9]{4,24}$/.test(ref)) response.cookies.set("nister_ref", ref.toUpperCase(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  // Keep both headers so legacy components and Next's internal nonce wiring both work.
  response.headers.set("x-nonce", nonce);
  response.headers.set("x-csp-nonce", nonce);

  if (requestProtocol(request) === "https") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return response;
}

function buildForwardedNextResponse(request: NextRequest, nonce: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", contentSecurityPolicy(nonce));
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-csp-nonce", nonce);
  requestHeaders.set("x-nister-request-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function buildInternalRewriteUrl(request: NextRequest, pathname: string) {
  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = pathname;
  if (isLoopbackHost(rewriteUrl.hostname)) {
    rewriteUrl.protocol = "http:";
  }
  return rewriteUrl;
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const { pathname } = request.nextUrl;
  const isProtectedRoute = PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const trustedHosts = getTrustedPublicHosts();

  if (process.env.NODE_ENV === "production" && requestProtocol(request) !== "https") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.protocol = "https";
    return decorateResponse(NextResponse.redirect(redirectUrl, 307), request, nonce);
  }

  if (request.method.toUpperCase() === "GET" && pathname === LEGACY_SERVICE_COMPARISON_PATH) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/starter-vs-managed-funds";
    redirectUrl.search = "";
    return decorateResponse(NextResponse.redirect(redirectUrl, 308), request, nonce);
  }

  if (request.method.toUpperCase() === "GET" && isOrgParentHost(requestHost(request))) {
    if (pathname === "/" || pathname === "/contact") {
      const rewriteUrl = buildInternalRewriteUrl(request, pathname === "/" ? "/org" : "/org/contact");
      return decorateResponse(NextResponse.rewrite(rewriteUrl), request, nonce);
    }
  }

  if (STATE_CHANGING_METHODS.has(request.method.toUpperCase())) {
    const origin = (request.headers.get("origin") || "").trim();
    if (origin.toLowerCase() === "null") {
      return decorateResponse(
        NextResponse.json(
          {
            status: "rejected",
            error: "UNTRUSTED_ORIGIN",
            message: "Null origin is not allowed for state-changing requests",
          },
          { status: 403 },
        ),
        request,
        nonce,
      );
    }

    if (origin) {
      const sourceHost = originHost(origin);
      const targetHost = requestHost(request);
      const trustedSource = sourceHost && trustedHosts.has(sourceHost);
      const trustedTarget = targetHost && trustedHosts.has(targetHost);
      if (!trustedSource || !trustedTarget || sourceHost !== targetHost) {
        return decorateResponse(
          NextResponse.json(
            {
              status: "rejected",
              error: "UNTRUSTED_ORIGIN",
              message: "Cross-origin state-changing request denied",
            },
            { status: 403 },
          ),
          request,
          nonce,
        );
      }
    }
  }

  if (isProtectedRoute) {
    const token = request.cookies.get("nister_session")?.value;
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "Please log in to continue");
      appendAuthNextParam(loginUrl.searchParams, safeAuthNextPath(`${pathname}${request.nextUrl.search}`));
      return decorateResponse(NextResponse.redirect(loginUrl), request, nonce);
    }
  }

  return decorateResponse(buildForwardedNextResponse(request, nonce), request, nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
