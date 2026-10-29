import { NextRequest, NextResponse } from "next/server";
import { safeAuthNextPath } from "@/lib/auth-redirects";
import { getPublicOriginFromRequest } from "@/lib/public-url";
import {
  buildSocialAuthAuthorizationUrl,
  createSocialAuthState,
  loadSocialAuthProviderConfig,
  normalizeSocialProvider,
  socialAuthConfigToSettings,
  socialAuthStateCookieName,
  socialAuthStateCookieOptions,
} from "@/lib/social-auth";

function loginErrorResponse(request: NextRequest, message: string) {
  const redirectUrl = new URL("/login", getPublicOriginFromRequest(request));
  redirectUrl.searchParams.set("error", message);
  return NextResponse.redirect(redirectUrl, 302);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const params = await context.params;
  const provider = normalizeSocialProvider(params.provider);
  if (!provider) {
    return loginErrorResponse(request, "Unsupported social login provider");
  }

  const config = await loadSocialAuthProviderConfig(provider);
  if (!config.available) {
    return loginErrorResponse(request, `${config.label} login is currently unavailable`);
  }

  const nextPath = safeAuthNextPath(request.nextUrl.searchParams.get("next"));
  const state = createSocialAuthState(nextPath);
  const redirectUri = new URL(`/api/auth/social/${provider}/callback`, getPublicOriginFromRequest(request)).toString();
  const authorizeUrl = buildSocialAuthAuthorizationUrl({
    provider,
    settings: socialAuthConfigToSettings(config),
    state,
    redirectUri,
  });

  const response = NextResponse.redirect(authorizeUrl, 302);
  response.cookies.set(
    socialAuthStateCookieName(provider),
    state,
    socialAuthStateCookieOptions(provider, process.env.NODE_ENV === "production"),
  );
  return response;
}
