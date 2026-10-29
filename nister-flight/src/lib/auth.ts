import { UserAccountState, UserRole } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/site";
import { appendAuthNextParam, safeAuthNextPath } from "@/lib/auth-redirects";

const SESSION_COOKIE_NAME = "nister_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const defaultSecret = "development-only-secret-change-this-now";

type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
};

function sessionSecret() {
  const configured = process.env.SESSION_SECRET?.trim() || "";
  const production = process.env.NODE_ENV === "production";
  const secret = configured || defaultSecret;
  if (production && (!configured || configured === defaultSecret || configured.length < 32)) {
    throw new Error("SESSION_SECRET must be set to a strong value in production.");
  }
  return new TextEncoder().encode(secret);
}

function sessionCookieDomain() {
  const productionFallback = process.env.NODE_ENV === "production" ? "nisterai.com" : undefined;
  const configured = process.env.SESSION_COOKIE_DOMAIN?.trim();
  if (configured) {
    return configured;
  }

  const base = process.env.APP_BASE_URL?.trim();
  if (!base) {
    return productionFallback;
  }

  try {
    const hostname = new URL(base).hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return productionFallback;
    }
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return productionFallback;
  }
}

type SessionCookieMutationStore = {
  set: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax";
      maxAge: number;
      expires: Date;
      path: string;
      domain?: string;
    },
  ) => unknown;
  delete: (options: { name: string; path: string; domain?: string }) => unknown;
};

function sessionCookieScopes(domain?: string): Array<string | undefined> {
  const normalized = (domain || "").trim().toLowerCase().replace(/^\./, "");
  const scopes: Array<string | undefined> = [undefined];
  if (!normalized) {
    return scopes;
  }
  const variants = [normalized, `.${normalized}`];
  for (const variant of variants) {
    if (!scopes.includes(variant)) {
      scopes.push(variant);
    }
  }
  return scopes;
}

export function applySessionClearCookie(
  cookieStore: SessionCookieMutationStore,
  options: { secure: boolean; domain?: string },
) {
  for (const domain of sessionCookieScopes(options.domain)) {
    const scope = {
      path: "/",
      ...(domain ? { domain } : {}),
    };

    cookieStore.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: options.secure,
      sameSite: "lax",
      maxAge: 0,
      expires: new Date(0),
      ...scope,
    });
    cookieStore.delete({
      name: SESSION_COOKIE_NAME,
      ...scope,
    });
  }
}

async function signSession(payload: SessionPayload) {
  return new SignJWT({ email: payload.email, name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(sessionSecret());
}

export async function createSession(payload: SessionPayload) {
  const token = await signSession(payload);
  const cookieStore = await cookies();
  const domain = sessionCookieDomain();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    domain,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  applySessionClearCookie(cookieStore, {
    secure: process.env.NODE_ENV === "production",
    domain: sessionCookieDomain(),
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
      clockTolerance: 5,
    });
    if (!payload.sub || typeof payload.sub !== "string") {
      return null;
    }

    const email = typeof payload.email === "string" ? payload.email : "";
    const name = typeof payload.name === "string" ? payload.name : "";
    const role = payload.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.MEMBER;

    return {
      sub: payload.sub,
      email,
      name,
      role,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await readSession();
  if (!session) {
    return null;
  }

  try {
    return await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerifiedAt: true,
        referralCode: true,
        referredById: true,
        tradingProfile: {
          select: {
            accountState: true,
          },
        },
      },
    });
  } catch {
    return null;
  }
}

type RequireUserOptions = {
  allowUnverifiedEmail?: boolean;
};

export async function getCurrentApiUser() {
  const user = await getCurrentUser();
  if (!user || user.tradingProfile?.accountState === UserAccountState.SUSPENDED || user.tradingProfile?.accountState === UserAccountState.CLOSED) return null;
  return user;
}

export async function requireUser(options: RequireUserOptions = {}) {
  const user = await getCurrentUser();
  if (!user) {
    const requestHeaders = await headers();
    const params = new URLSearchParams({ error: "Please log in to continue" });
    appendAuthNextParam(params, safeAuthNextPath(requestHeaders.get("x-nister-request-path")));
    redirect(`/login?${params.toString()}`);
  }

  const settings = await getPlatformSettings();
  if (
    (settings.requireEmailVerification || settings.enforceVerifiedEmailForActivation) &&
    user.role !== UserRole.ADMIN &&
    !user.emailVerifiedAt &&
    !options.allowUnverifiedEmail
  ) {
    redirect(`/verify-email?email=${encodeURIComponent(user.email)}&error=Please+verify+your+email+first`);
  }

  if (
    user.tradingProfile?.accountState === UserAccountState.SUSPENDED ||
    user.tradingProfile?.accountState === UserAccountState.CLOSED
  ) {
    redirect("/login?error=Your+account+is+restricted.+Contact+support");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== UserRole.ADMIN) {
    redirect("/dashboard?error=Admin+access+required");
  }
  return user;
}
