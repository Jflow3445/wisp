import { UserAccountState, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { isSupportAuthNextPath } from "@/lib/auth-redirects";
import { sendVerificationEmail } from "@/lib/email-verification";
import { userNeedsLegalReacceptance } from "@/lib/legal";
import { getPublicOriginFromRequest } from "@/lib/public-url";
import { ensureUserReferralCode } from "@/lib/referrals";
import { getRequestIpFromHeaders } from "@/lib/request-security";
import { ensureTradingProfile, getPlatformSettings } from "@/lib/site";
import {
  clearSocialAuthStateCookieOptions,
  exchangeSocialAuthCode,
  fetchSocialAuthProfile,
  getSocialAuthStateNextPath,
  getSocialLoginEntryRoute,
  isSocialAuthStateValid,
  loadSocialAuthProviderConfig,
  normalizeSocialProvider,
  prepareSocialLoginUser,
  resolveSocialAuthPostLoginRoute,
  socialAuthConfigToSettings,
  socialAuthStateCookieName,
  socialAuthProviderLabel,
  type SocialAuthProvider,
} from "@/lib/social-auth";

function loginErrorResponse(request: NextRequest, provider: SocialAuthProvider | null, message: string) {
  const redirectUrl = new URL("/login", getPublicOriginFromRequest(request));
  redirectUrl.searchParams.set("error", message);
  const response = NextResponse.redirect(redirectUrl, 302);
  if (provider) {
    response.cookies.set(
      socialAuthStateCookieName(provider),
      "",
      clearSocialAuthStateCookieOptions(provider, process.env.NODE_ENV === "production"),
    );
  }
  return response;
}

function redirectWithClearedStateCookie(
  request: NextRequest,
  provider: SocialAuthProvider,
  destination: string,
) {
  const response = NextResponse.redirect(new URL(destination, getPublicOriginFromRequest(request)), 302);
  response.cookies.set(
    socialAuthStateCookieName(provider),
    "",
    clearSocialAuthStateCookieOptions(provider, process.env.NODE_ENV === "production"),
  );
  return response;
}

function pathWithNotice(path: string, key: "success" | "error", message: string) {
  const url = new URL(path, "https://nisterai.com");
  url.searchParams.set(key, message);
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function socialLoginVerificationUrl(
  request: NextRequest,
  provider: SocialAuthProvider,
  message: string,
  email: string,
  success?: string,
) {
  const verifyUrl = new URL("/verify-email", getPublicOriginFromRequest(request));
  verifyUrl.searchParams.set("email", email);
  if (success) {
    verifyUrl.searchParams.set("success", success);
  } else {
    verifyUrl.searchParams.set("error", message);
  }

  const response = NextResponse.redirect(verifyUrl, 302);
  response.cookies.set(
    socialAuthStateCookieName(provider),
    "",
    clearSocialAuthStateCookieOptions(provider, process.env.NODE_ENV === "production"),
  );
  return response;
}

function legacyVerificationUrl(
  request: NextRequest,
  provider: SocialAuthProvider,
  email: string,
  success?: string,
  errorMessage?: string,
) {
  const verifyUrl = new URL("/verify-email", getPublicOriginFromRequest(request));
  verifyUrl.searchParams.set("email", email);
  if (success) {
    verifyUrl.searchParams.set("success", success);
  } else if (errorMessage) {
    verifyUrl.searchParams.set("error", errorMessage);
  }
  const response = NextResponse.redirect(verifyUrl, 302);
  response.cookies.set(
    socialAuthStateCookieName(provider),
    "",
    clearSocialAuthStateCookieOptions(provider, process.env.NODE_ENV === "production"),
  );
  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const params = await context.params;
  const provider = normalizeSocialProvider(params.provider);
  if (!provider) {
    return loginErrorResponse(request, null, "Unsupported social login provider");
  }

  const config = await loadSocialAuthProviderConfig(provider);
  if (!config.available) {
    return loginErrorResponse(request, provider, `${config.label} login is currently unavailable`);
  }

  const providerSettings = socialAuthConfigToSettings(config);
  const settings = await getPlatformSettings();

  const url = new URL(request.url);
  const oauthError = String(url.searchParams.get("error") || "").trim();
  if (oauthError) {
    const oauthDescription = String(url.searchParams.get("error_description") || "").trim();
    const message =
      oauthDescription ||
      (oauthError === "access_denied"
        ? `${socialAuthProviderLabel(provider)} login was cancelled`
        : `${socialAuthProviderLabel(provider)} login failed`);
    return loginErrorResponse(request, provider, message);
  }

  const state = String(url.searchParams.get("state") || "").trim();
  const code = String(url.searchParams.get("code") || "").trim();
  if (!state || !code) {
    return loginErrorResponse(request, provider, "Missing OAuth state or code");
  }

  const cookieState = request.cookies.get(socialAuthStateCookieName(provider))?.value || "";
  if (!cookieState || !isSocialAuthStateValid(cookieState, state)) {
    return loginErrorResponse(request, provider, "OAuth state validation failed");
  }
  const requestedNextPath = getSocialAuthStateNextPath(cookieState);

  const redirectUri = new URL(`/api/auth/social/${provider}/callback`, getPublicOriginFromRequest(request)).toString();

  let profile;
  try {
    const token = await exchangeSocialAuthCode({
      provider,
      settings: providerSettings,
      code,
      redirectUri,
    });
    profile = await fetchSocialAuthProfile({
      provider,
      settings: providerSettings,
      accessToken: token.accessToken,
    });
  } catch (error) {
    return loginErrorResponse(
      request,
      provider,
      error instanceof Error && error.message ? error.message : `${config.label} login failed`,
    );
  }

  let user;
  try {
    const requestIp = getRequestIpFromHeaders(request.headers);
    const userAgent = request.headers.get("user-agent");
    user = await prepareSocialLoginUser({
      referralCode: request.cookies.get("nister_ref")?.value,
      provider,
      profile,
      antiAbuseContext: {
        requestIp,
        userAgent,
      },
    });
  } catch (error) {
    return loginErrorResponse(
      request,
      provider,
      error instanceof Error && error.message ? error.message : "Unable to complete social login",
    );
  }

  const tradingProfile = await ensureTradingProfile(user.id);
  if (
    tradingProfile?.accountState === UserAccountState.SUSPENDED ||
    tradingProfile?.accountState === UserAccountState.CLOSED
  ) {
    return loginErrorResponse(request, provider, "Your account is restricted. Contact support");
  }

  await ensureUserReferralCode(user.id, user.name, user.referralCode);

  if (user.role === UserRole.ADMIN) {
    await createSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    return redirectWithClearedStateCookie(request, provider, "/admin");
  }

  const supportNextRequested = isSupportAuthNextPath(requestedNextPath);
  let supportVerificationNotice: { key: "success" | "error"; message: string } | null = null;
  if (
    supportNextRequested &&
    !user.emailVerifiedAt &&
    (settings.enforceVerifiedEmailForActivation || settings.requireEmailVerification)
  ) {
    const sent = await sendVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    supportVerificationNotice = sent
      ? { key: "success", message: "Support is open. A verification email has also been sent." }
      : { key: "error", message: "Support is open. Email verification delivery is temporarily unavailable." };
  }

  if (settings.enforceVerifiedEmailForActivation && !user.emailVerifiedAt && !supportNextRequested) {
    const sent = await sendVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    return legacyVerificationUrl(
      request,
      provider,
      user.email,
      sent ? "A new verification email has been sent." : undefined,
      sent ? undefined : "Please verify your email. Email delivery is temporarily unavailable. Contact support.",
    );
  }

  await createSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  const needsLegalReacceptance = await userNeedsLegalReacceptance(user.id);
  const memberEntryRoute = await getSocialLoginEntryRoute(user.id);
  const targetRoute = resolveSocialAuthPostLoginRoute({
    role: user.role,
    requireEmailVerification: Boolean(settings.requireEmailVerification),
    emailVerifiedAt: user.emailVerifiedAt,
    needsLegalReacceptance,
    memberEntryRoute,
    email: user.email,
    requestedNextPath,
  });

  if (targetRoute.startsWith("/verify-email")) {
    const sent = await sendVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    return socialLoginVerificationUrl(
      request,
      provider,
      "Please verify your email. Email delivery is temporarily unavailable. Contact support.",
      user.email,
      sent ? "A new verification email has been sent." : undefined,
    );
  }

  const destination = supportVerificationNotice
    ? pathWithNotice(targetRoute, supportVerificationNotice.key, supportVerificationNotice.message)
    : targetRoute;
  return redirectWithClearedStateCookie(request, provider, destination);
}
