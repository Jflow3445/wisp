import { validateReferralCode } from "./referrals";
import bcrypt from "bcryptjs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { decryptSecret } from "@/lib/secret-box";
import { DEFAULT_AUTH_NEXT, isExplicitAuthNextPath, isSupportAuthNextPath, safeAuthNextPath } from "@/lib/auth-redirects";
import {
  isAllowedPublicEmailDomain,
  PUBLIC_EMAIL_DOMAIN_BLOCK_ERROR,
} from "@/lib/public-email-domains";
import { prisma } from "@/lib/prisma";
import { enforceSignupHumanityGate } from "@/lib/signup-humanity";

export type SocialAuthProvider = "google" | "facebook";
export type SocialAccountProviderValue = "GOOGLE" | "FACEBOOK";

export type SocialAuthSettings = {
  googleSocialAuthEnabled?: boolean | null;
  googleSocialAuthClientId?: string | null;
  googleSocialAuthClientSecret?: string | null;
  googleSocialAuthClientSecretKeyVersion?: number | null;
  facebookSocialAuthEnabled?: boolean | null;
  facebookSocialAuthClientId?: string | null;
  facebookSocialAuthClientSecret?: string | null;
  facebookSocialAuthClientSecretKeyVersion?: number | null;
  requireEmailVerification?: boolean | null;
  enforceVerifiedEmailForActivation?: boolean | null;
};

export type SocialAuthProviderConfig = {
  provider: SocialAuthProvider;
  label: string;
  accountProvider: SocialAccountProviderValue;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  clientSecretKeyVersion: number | null;
  available: boolean;
  authorizeUrl: string;
  tokenUrl: string;
  profileUrl: string;
  scope: string[];
};

export type SocialAuthProviderProfile = {
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
};

export type SocialSignupAntiAbuseContext = {
  requestIp: string | null;
  userAgent: string | null;
};

export type SocialAuthRedirectInput = {
  role: UserRole;
  requireEmailVerification: boolean;
  emailVerifiedAt: Date | null;
  needsLegalReacceptance: boolean;
  memberEntryRoute: string;
  email: string;
  requestedNextPath?: string;
};

const SOCIAL_AUTH_STATE_TTL_SECONDS = 10 * 60;
const SOCIAL_AUTH_COOKIE_PREFIX = "nister_social_auth_state";
const SOCIAL_AUTH_STATE_NEXT_SEPARATOR = ".";

const SOCIAL_PROVIDER_CONFIGS: Record<
  SocialAuthProvider,
  Omit<SocialAuthProviderConfig, "enabled" | "clientId" | "clientSecret" | "clientSecretKeyVersion" | "available">
> = {
  google: {
    provider: "google",
    label: "Google",
    accountProvider: "GOOGLE",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: ["openid", "email", "profile"],
  },
  facebook: {
    provider: "facebook",
    label: "Facebook",
    accountProvider: "FACEBOOK",
    authorizeUrl: "https://www.facebook.com/v20.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    profileUrl: "https://graph.facebook.com/me?fields=id,name,email,picture",
    scope: ["email", "public_profile"],
  },
};

function readBooleanSetting(settings: SocialAuthSettings, key: keyof SocialAuthSettings) {
  const value = settings[key];
  return value === true || value === "true" || value === 1 || value === "1";
}

function readStringSetting(settings: SocialAuthSettings, key: keyof SocialAuthSettings) {
  const value = settings[key];
  return typeof value === "string" ? value.trim() : "";
}

function readNumberSetting(settings: SocialAuthSettings, key: keyof SocialAuthSettings) {
  const raw = settings[key];
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function socialAuthSettingKeys(provider: SocialAuthProvider) {
  return provider === "google"
    ? {
        enabled: "googleSocialAuthEnabled" as const,
        clientId: "googleSocialAuthClientId" as const,
        clientSecret: "googleSocialAuthClientSecret" as const,
        clientSecretKeyVersion: "googleSocialAuthClientSecretKeyVersion" as const,
      }
    : {
        enabled: "facebookSocialAuthEnabled" as const,
        clientId: "facebookSocialAuthClientId" as const,
        clientSecret: "facebookSocialAuthClientSecret" as const,
        clientSecretKeyVersion: "facebookSocialAuthClientSecretKeyVersion" as const,
      };
}

export function normalizeSocialProvider(raw: string | null | undefined): SocialAuthProvider | null {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "google" || value === "facebook") {
    return value;
  }
  return null;
}

export function socialAuthProviderLabel(provider: SocialAuthProvider) {
  return SOCIAL_PROVIDER_CONFIGS[provider].label;
}

export function socialAuthProviderAccountValue(provider: SocialAuthProvider): SocialAccountProviderValue {
  return SOCIAL_PROVIDER_CONFIGS[provider].accountProvider;
}

export function socialAuthStateCookieName(provider: SocialAuthProvider) {
  return `${SOCIAL_AUTH_COOKIE_PREFIX}:${provider}`;
}

export function socialAuthStateCookiePath(provider: SocialAuthProvider) {
  return `/api/auth/social/${provider}`;
}

export function createSocialAuthState(nextPath?: string | null) {
  const nonce = randomBytes(32).toString("base64url");
  const safeNext = safeAuthNextPath(nextPath);
  if (!isExplicitAuthNextPath(safeNext)) {
    return nonce;
  }

  return `${nonce}${SOCIAL_AUTH_STATE_NEXT_SEPARATOR}${Buffer.from(safeNext, "utf8").toString("base64url")}`;
}

export function getSocialAuthStateNextPath(state: string) {
  const separatorIndex = state.indexOf(SOCIAL_AUTH_STATE_NEXT_SEPARATOR);
  if (separatorIndex < 0) {
    return DEFAULT_AUTH_NEXT;
  }

  const encoded = state.slice(separatorIndex + SOCIAL_AUTH_STATE_NEXT_SEPARATOR.length);
  if (!encoded) {
    return DEFAULT_AUTH_NEXT;
  }

  try {
    return safeAuthNextPath(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return DEFAULT_AUTH_NEXT;
  }
}

export function isSocialAuthStateValid(expected: string, actual: string) {
  if (!expected || !actual || expected.length !== actual.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
}

export function getSocialAuthProviderConfig(
  settings: SocialAuthSettings,
  provider: SocialAuthProvider,
): SocialAuthProviderConfig {
  const keys = socialAuthSettingKeys(provider);
  const base = SOCIAL_PROVIDER_CONFIGS[provider];
  const enabled = readBooleanSetting(settings, keys.enabled);
  const clientId = readStringSetting(settings, keys.clientId);
  const clientSecretCiphertext = readStringSetting(settings, keys.clientSecret);
  const clientSecretKeyVersion = readNumberSetting(settings, keys.clientSecretKeyVersion);
  const decryptedSecret = decryptSecret(clientSecretCiphertext, clientSecretKeyVersion).plaintext.trim();
  const available = enabled && Boolean(clientId) && Boolean(decryptedSecret);

  return {
    ...base,
    enabled,
    clientId,
    clientSecret: decryptedSecret,
    clientSecretKeyVersion,
    available,
  };
}

export function isSocialAuthProviderAvailable(settings: SocialAuthSettings, provider: SocialAuthProvider) {
  return getSocialAuthProviderConfig(settings, provider).available;
}

export async function loadSocialAuthProviderConfig(provider: SocialAuthProvider) {
  const settings = await prisma.platformSetting.findUnique({
    where: { id: 1 },
    select: {
      googleSocialAuthEnabled: true,
      googleSocialAuthClientId: true,
      googleSocialAuthClientSecret: true,
      googleSocialAuthClientSecretKeyVersion: true,
      facebookSocialAuthEnabled: true,
      facebookSocialAuthClientId: true,
      facebookSocialAuthClientSecret: true,
      facebookSocialAuthClientSecretKeyVersion: true,
    },
  });

  return getSocialAuthProviderConfig(settings || {}, provider);
}

export function socialAuthConfigToSettings(config: SocialAuthProviderConfig): SocialAuthSettings {
  if (config.provider === "google") {
    return {
      googleSocialAuthEnabled: config.enabled,
      googleSocialAuthClientId: config.clientId,
      googleSocialAuthClientSecret: config.clientSecret,
      googleSocialAuthClientSecretKeyVersion: config.clientSecretKeyVersion,
    };
  }

  return {
    facebookSocialAuthEnabled: config.enabled,
    facebookSocialAuthClientId: config.clientId,
    facebookSocialAuthClientSecret: config.clientSecret,
    facebookSocialAuthClientSecretKeyVersion: config.clientSecretKeyVersion,
  };
}

export function buildSocialAuthAuthorizationUrl(input: {
  provider: SocialAuthProvider;
  settings: SocialAuthSettings;
  state: string;
  redirectUri: string;
}) {
  const config = getSocialAuthProviderConfig(input.settings, input.provider);
  if (!config.available) {
    throw new Error(`${config.label} login is not available`);
  }

  const redirectUrl = new URL(input.redirectUri);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUrl.toString());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope.join(" "));
  url.searchParams.set("state", input.state);

  if (input.provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }

  return url.toString();
}

export function socialAuthStateCookieOptions(provider: SocialAuthProvider, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: SOCIAL_AUTH_STATE_TTL_SECONDS,
    path: socialAuthStateCookiePath(provider),
  };
}

export function clearSocialAuthStateCookieOptions(provider: SocialAuthProvider, secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: 0,
    expires: new Date(0),
    path: socialAuthStateCookiePath(provider),
  };
}

export function normalizeSocialProfileName(name: string, email: string) {
  const trimmed = name.trim();
  if (trimmed) {
    return trimmed.slice(0, 80);
  }
  const localPart = email.split("@")[0]?.trim() || "";
  return (localPart || email).slice(0, 80);
}

async function readResponseErrorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as Record<string, unknown>;
      const message = [
        payload.error_description,
        payload.error_message,
        payload.message,
        payload.error,
      ]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .find(Boolean);
      if (message) {
        return message;
      }
    } else {
      const text = (await response.text()).trim();
      if (text) {
        return text.slice(0, 200);
      }
    }
  } catch {
    // Fall through to the provided fallback.
  }
  return fallback;
}

export async function exchangeSocialAuthCode(input: {
  provider: SocialAuthProvider;
  settings: SocialAuthSettings;
  code: string;
  redirectUri: string;
}) {
  const config = getSocialAuthProviderConfig(input.settings, input.provider);
  if (!config.available) {
    throw new Error(`${config.label} login is not available`);
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
  });

  if (input.provider === "google") {
    body.set("grant_type", "authorization_code");
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readResponseErrorMessage(response, `Unable to exchange ${config.label} authorization code`));
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) {
    throw new Error(`Unable to exchange ${config.label} authorization code`);
  }

  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : null;
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : Number(payload.expires_in || 0);

  return {
    accessToken,
    refreshToken,
    expiresIn: Number.isFinite(expiresIn) ? expiresIn : null,
    raw: payload,
  };
}

export async function fetchSocialAuthProfile(input: {
  provider: SocialAuthProvider;
  settings: SocialAuthSettings;
  accessToken: string;
}) {
  const config = getSocialAuthProviderConfig(input.settings, input.provider);
  if (!config.available) {
    throw new Error(`${config.label} login is not available`);
  }

  if (input.provider === "google") {
    const response = await fetch(config.profileUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response, `Unable to fetch ${config.label} profile`));
    }

    const profile = (await response.json()) as Record<string, unknown>;
    const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
    if (!email) {
      throw new Error(`${config.label} account did not return an email address`);
    }

    const providerAccountId = typeof profile.sub === "string" ? profile.sub.trim() : "";
    if (!providerAccountId) {
      throw new Error(`${config.label} account did not return a stable user identifier`);
    }

    return {
      providerAccountId,
      email,
      emailVerified: profile.email_verified === true,
      name: normalizeSocialProfileName(
        typeof profile.name === "string" ? profile.name : "",
        email,
      ),
      avatarUrl: typeof profile.picture === "string" ? profile.picture.trim() || null : null,
    } satisfies SocialAuthProviderProfile;
  }

  const profileUrl = new URL(config.profileUrl);
  profileUrl.searchParams.set("access_token", input.accessToken);

  const response = await fetch(profileUrl, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await readResponseErrorMessage(response, `Unable to fetch ${config.label} profile`));
  }

  const profile = (await response.json()) as Record<string, unknown>;
  const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (!email) {
    throw new Error(`${config.label} account did not return an email address`);
  }

  const providerAccountId = typeof profile.id === "string" ? profile.id.trim() : "";
  if (!providerAccountId) {
    throw new Error(`${config.label} account did not return a stable user identifier`);
  }

  const picture = profile.picture as { data?: { url?: unknown } } | undefined;
  const avatarUrl = typeof picture?.data?.url === "string" ? picture.data.url.trim() || null : null;

  return {
    providerAccountId,
    email,
    emailVerified: true,
    name: normalizeSocialProfileName(typeof profile.name === "string" ? profile.name : "", email),
    avatarUrl,
  } satisfies SocialAuthProviderProfile;
}

export function resolveSocialAuthPostLoginRoute(input: SocialAuthRedirectInput) {
  if (input.role === UserRole.ADMIN) {
    return "/admin";
  }

  const requestedNextPath = safeAuthNextPath(input.requestedNextPath);
  if (isSupportAuthNextPath(requestedNextPath)) {
    return requestedNextPath;
  }

  if (input.requireEmailVerification && !input.emailVerifiedAt) {
    return `/verify-email?email=${encodeURIComponent(input.email)}`;
  }

  if (input.needsLegalReacceptance) {
    return `/legal/accept?next=${encodeURIComponent("/dashboard")}`;
  }

  return isExplicitAuthNextPath(requestedNextPath) ? requestedNextPath : input.memberEntryRoute;
}

function prismaSocialAccountModel() {
  const candidate = (prisma as unknown as Record<string, unknown>).userSocialAccount;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Social account model is unavailable");
  }
  return candidate as {
    findFirst: (args: Record<string, unknown>) => Promise<{ id: string; userId: string } | null>;
    create: (args: Record<string, unknown>) => Promise<unknown>;
  } & Record<string, unknown>;
}

async function findExistingSocialAccount(provider: SocialAuthProvider, providerAccountId: string) {
  const model = prismaSocialAccountModel();
  return model.findFirst({
    where: {
      provider: socialAuthProviderAccountValue(provider),
      providerAccountId,
    },
    select: {
      id: true,
      userId: true,
    },
  });
}

async function createSocialAccountLink(input: {
  userId: string;
  provider: SocialAuthProvider;
  providerAccountId: string;
}) {
  const model = prismaSocialAccountModel();
  try {
    await model.create({
      data: {
        userId: input.userId,
        provider: socialAuthProviderAccountValue(input.provider),
        providerAccountId: input.providerAccountId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}

async function createSocialPasswordHash() {
  return bcrypt.hash(randomBytes(32).toString("hex"), 12);
}

async function ensureSocialUser(input: {
  provider: SocialAuthProvider;
  profile: SocialAuthProviderProfile;
  antiAbuseContext?: SocialSignupAntiAbuseContext;
  referralCode?: string;
}) {
  const existingAccount = await findExistingSocialAccount(input.provider, input.profile.providerAccountId);
  if (existingAccount) {
    const user = await prisma.user.findUnique({
      where: { id: existingAccount.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerifiedAt: true,
        referralCode: true,
        tradingProfile: {
          select: {
            accountState: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error("Linked social account points to a missing user");
    }

    if (input.profile.emailVerified && !user.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
        },
      });
      user.emailVerifiedAt = new Date();
    }

    return user;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.profile.email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerifiedAt: true,
      referralCode: true,
      tradingProfile: {
        select: {
          accountState: true,
        },
      },
    },
  });

  if (existingUser) {
    if (input.profile.emailVerified && !existingUser.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          emailVerifiedAt: new Date(),
        },
      });
      existingUser.emailVerifiedAt = new Date();
    }

    await createSocialAccountLink({
      userId: existingUser.id,
      provider: input.provider,
      providerAccountId: input.profile.providerAccountId,
    });
    return existingUser;
  }

  if (!isAllowedPublicEmailDomain(input.profile.email)) {
    throw new Error(PUBLIC_EMAIL_DOMAIN_BLOCK_ERROR);
  }

  const humanityGate = await enforceSignupHumanityGate({
    name: input.profile.name,
    email: input.profile.email,
    requestIp: input.antiAbuseContext?.requestIp || null,
    userAgent: input.antiAbuseContext?.userAgent || null,
  });
  if (!humanityGate.allowed) {
    throw new Error(humanityGate.error);
  }

  const referral = input.referralCode ? await validateReferralCode(input.referralCode, { applicantEmail: input.profile.email }) : null;
  const created = await prisma.user.create({
    data: {
      referredById: referral?.valid ? referral.referrer?.id : undefined,
      email: input.profile.email,
      name: input.profile.name,
      passwordHash: await createSocialPasswordHash(),
      emailVerifiedAt: input.profile.emailVerified ? new Date() : null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerifiedAt: true,
      referralCode: true,
      tradingProfile: {
        select: {
          accountState: true,
        },
      },
    },
  });

  await createSocialAccountLink({
    userId: created.id,
    provider: input.provider,
    providerAccountId: input.profile.providerAccountId,
  });

  return created;
}

export async function prepareSocialLoginUser(input: {
  provider: SocialAuthProvider;
  profile: SocialAuthProviderProfile;
  antiAbuseContext?: SocialSignupAntiAbuseContext;
  referralCode?: string;
}) {
  return ensureSocialUser(input);
}

export async function finalizeSocialLoginUser(userId: string) {
  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerifiedAt: true,
      referralCode: true,
      tradingProfile: {
        select: {
          accountState: true,
        },
      },
    },
  });

  if (!profile) {
    throw new Error("Social login user no longer exists");
  }

  return profile;
}

export async function getSocialLoginEntryRoute(userId: string) {
  void userId; return "/dashboard";
}
