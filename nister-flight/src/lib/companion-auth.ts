import { getPersonalRuntimeAccess } from "@/lib/personal-runtime-access";
import crypto from "node:crypto";
import { UserAccountState, UserRole } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/site";

const COMPANION_ACCESS_SECONDS = 15 * 60;
const COMPANION_REFRESH_SECONDS = 14 * 24 * 60 * 60;
const DEFAULT_SECRET = "development-companion-secret-change-this-now";

export type CompanionSessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  emailVerifiedAt: Date | null;
  tradingProfile: {
    accountState: UserAccountState;
  } | null;
};

export type CompanionAccessClaims = {
  sub: string;
  email: string;
  role: UserRole;
  typ: "companion_access";
};

export type CompanionRefreshClaims = {
  sub: string;
  jti: string;
  typ: "companion_refresh";
};

function companionSecret() {
  const configured = process.env.COMPANION_TOKEN_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || "";
  const production = process.env.NODE_ENV === "production";
  const secret = configured || DEFAULT_SECRET;
  if (production && (!configured || configured === DEFAULT_SECRET || configured.length < 32)) {
    throw new Error("COMPANION_TOKEN_SECRET (or SESSION_SECRET fallback) must be set to a strong value in production.");
  }
  return new TextEncoder().encode(secret);
}

function randomTokenId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function hashRefreshTokenId(tokenId: string) {
  return crypto.createHash("sha256").update(tokenId, "utf8").digest("hex");
}

export async function issueCompanionSession(
  user: CompanionSessionUser,
  options?: {
    replacedSessionId?: string | null;
  },
) {
  const accessExpiresAt = new Date(Date.now() + COMPANION_ACCESS_SECONDS * 1000);
  const refreshExpiresAt = new Date(Date.now() + COMPANION_REFRESH_SECONDS * 1000);
  const accessJti = randomTokenId("cmp_acc");
  const refreshJti = randomTokenId("cmp_ref");

  const accessToken = await new SignJWT({
    typ: "companion_access",
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setJti(accessJti)
    .setExpirationTime(`${COMPANION_ACCESS_SECONDS}s`)
    .sign(companionSecret());

  const refreshToken = await new SignJWT({
    typ: "companion_refresh",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setJti(refreshJti)
    .setExpirationTime(`${COMPANION_REFRESH_SECONDS}s`)
    .sign(companionSecret());

  const createdSession = await prisma.companionSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: hashRefreshTokenId(refreshJti),
      refreshExpiresAt,
    },
    select: { id: true },
  });

  if (options?.replacedSessionId) {
    await prisma.companionSession.updateMany({
      where: {
        id: options.replacedSessionId,
        userId: user.id,
      },
      data: {
        revokedAt: new Date(),
        replacedById: createdSession.id,
      },
    });
  }

  return {
    accessToken,
    accessTokenExpiresAt: accessExpiresAt,
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt,
  };
}

export async function verifyCompanionAccessToken(token: string): Promise<CompanionAccessClaims | null> {
  const value = token.trim();
  if (!value) {
    return null;
  }

  try {
    const verified = await jwtVerify(value, companionSecret(), {
      algorithms: ["HS256"],
      clockTolerance: 5,
    });

    const sub = typeof verified.payload.sub === "string" ? verified.payload.sub : "";
    const email = typeof verified.payload.email === "string" ? verified.payload.email : "";
    const typ = verified.payload.typ === "companion_access" ? "companion_access" : null;
    const role = verified.payload.role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.MEMBER;
    if (!sub || !email || !typ) {
      return null;
    }

    return {
      sub,
      email,
      role,
      typ,
    };
  } catch {
    return null;
  }
}

export async function verifyCompanionRefreshToken(token: string): Promise<CompanionRefreshClaims | null> {
  const value = token.trim();
  if (!value) {
    return null;
  }

  try {
    const verified = await jwtVerify(value, companionSecret(), {
      algorithms: ["HS256"],
      clockTolerance: 5,
    });

    const sub = typeof verified.payload.sub === "string" ? verified.payload.sub : "";
    const jti = typeof verified.payload.jti === "string" ? verified.payload.jti : "";
    const typ = verified.payload.typ === "companion_refresh" ? "companion_refresh" : null;
    if (!sub || !typ || !jti) {
      return null;
    }

    return {
      sub,
      jti,
      typ,
    };
  } catch {
    return null;
  }
}

export async function consumeCompanionRefreshSession(claims: CompanionRefreshClaims): Promise<string | null> {
  const now = new Date();
  const session = await prisma.companionSession.findFirst({
    where: {
      userId: claims.sub,
      refreshTokenHash: hashRefreshTokenId(claims.jti),
      revokedAt: null,
      refreshExpiresAt: {
        gt: now,
      },
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
    },
  });
  if (!session) {
    return null;
  }

  const consumed = await prisma.companionSession.updateMany({
    where: {
      id: session.id,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
    },
  });
  if (consumed.count !== 1) {
    return null;
  }
  return session.id;
}

export function bearerTokenFromRequest(request: Request) {
  const auth = (request.headers.get("authorization") || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return auth.slice(7).trim();
}

export async function validateCompanionUser(user: CompanionSessionUser) {
  const settings = await getPlatformSettings();
  if ((settings.requireEmailVerification || settings.enforceVerifiedEmailForActivation) && user.role !== UserRole.ADMIN && !user.emailVerifiedAt) {
    return { ok: false as const, code: "EMAIL_NOT_VERIFIED", message: "Email verification is required." };
  }

  const accountState = user.tradingProfile?.accountState;
  if (accountState === UserAccountState.SUSPENDED || accountState === UserAccountState.CLOSED) {
    return { ok: false as const, code: "ACCOUNT_RESTRICTED", message: "Your account is restricted. Contact support." };
  }

  if (user.role !== UserRole.ADMIN) {
    const access = await getPersonalRuntimeAccess(user.id, true);
    if (!access.allowed) return { ok: false as const, code: "PERSONAL_RUNTIME_UNAVAILABLE", message: "An active Starter subscription and completed prerequisites are required. Managed Funds does not use the personal runtime." };
  }
  return { ok: true as const };
}
