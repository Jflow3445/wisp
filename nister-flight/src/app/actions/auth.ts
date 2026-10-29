"use server";

import bcrypt from "bcryptjs";
import { MarketEnrollmentStatus, UserAccountState, UserRole } from "@prisma/client";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, clearSession, requireUser } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email-verification";
import { legalConsentError, recordLegalAcceptance, userNeedsLegalReacceptance } from "@/lib/legal";
import { isMarketEnabled, isOfferedAutomationMarket, parseAutomationMarketFromQuery } from "@/lib/market-access";
import { ensureMarketEnrollment } from "@/lib/market-waitlist";
import { consumePasswordResetToken, sendPasswordResetEmail } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { isAllowedPublicEmailDomain, PUBLIC_EMAIL_DOMAIN_BLOCK_ERROR } from "@/lib/public-email-domains";
import { ensureUserReferralCode, validateReferralCode } from "@/lib/referrals";
import { getRequestIpFromHeaders } from "@/lib/request-security";
import { enforceSignupAntiAbuse, isDisposableSignupEmailBlocked } from "@/lib/signup-abuse";
import { enforceSignupHumanityGate } from "@/lib/signup-humanity";
import { ensureTradingProfile, getPlatformSettings } from "@/lib/site";
import { notifyUser } from "@/lib/notifications";
import { normalizeCredentialEmail, verifyUserPassword } from "@/lib/credential-auth";
import { validateTurnstileSubmission } from "@/lib/turnstile";
import { withAuthRateLimitFallback, withAuthRateLimitRetry } from "@/lib/auth-rate-limit";
import {
  appendAuthNextParam,
  isExplicitAuthNextPath,
  isSupportAuthNextPath,
  safeAuthNextPath,
} from "@/lib/auth-redirects";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(10).max(128),
  referralCode: z.string().trim().max(24).optional(),
  preferredMarket: z.string().trim().max(24).optional(),
  planSlug: z.string().trim().max(191).optional(),
  waitlistIntent: z.string().trim().max(24).optional(),
  annualPrepaySelected: z.boolean().optional(),
  legalConsent: z.boolean(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(20).max(256),
    password: z.string().min(10).max(128),
    confirmPassword: z.string().min(10).max(128),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

function toErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object" || !("issues" in error)) {
    return fallback;
  }
  const first = (error as { issues?: Array<{ message?: string }> }).issues?.[0];
  return first?.message || fallback;
}

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return false;
  }
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

function rateKey(email: string) {
  return `login:${email.toLowerCase()}`;
}

function readBooleanSetting(settings: unknown, key: string) {
  if (!settings || typeof settings !== "object") {
    return false;
  }
  const value = (settings as Record<string, unknown>)[key];
  return value === true || value === "true" || value === 1 || value === "1";
}

function asBool(value: FormDataEntryValue | null) {
  return value === "true" || value === "on" || value === "1";
}

function authRedirectPath(path: "/login" | "/signup", params: Record<string, string>, nextPath: string) {
  const searchParams = new URLSearchParams(params);
  appendAuthNextParam(searchParams, nextPath);
  return `${path}?${searchParams.toString()}`;
}

function pathWithNotice(path: string, key: "success" | "error", message: string) {
  const url = new URL(path, "https://nisterai.com");
  url.searchParams.set(key, message);
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

async function createUserSession(user: { id: string; email: string; name: string; role: UserRole }) {
  await createSession({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
}

async function sendSupportFlowVerificationEmailIfNeeded(
  settings: unknown,
  user: { id: string; email: string; name: string; emailVerifiedAt: Date | null },
) {
  const verificationRequired =
    readBooleanSetting(settings, "requireEmailVerification") ||
    readBooleanSetting(settings, "enforceVerifiedEmailForActivation");

  if (!verificationRequired || user.emailVerifiedAt) {
    return null;
  }

  const sent = await sendVerificationEmail({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  return sent
    ? { key: "success" as const, message: "Support is open. A verification email has also been sent." }
    : {
        key: "error" as const,
        message: "Support is open. Email verification delivery is temporarily unavailable.",
      };
}

function extractSignupPayload(formData: FormData) {
  return {
    name: String(formData.get("name") || ""),
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || ""),
    referralCode: String(formData.get("referralCode") || "").trim() || undefined,
    preferredMarket: String(formData.get("preferredMarket") || "").trim() || undefined,
    planSlug: String(formData.get("planSlug") || "").trim() || undefined,
    waitlistIntent: String(formData.get("waitlistIntent") || "").trim() || undefined,
    annualPrepaySelected: asBool(formData.get("annualPrepaySelected")),
    legalConsent: asBool(formData.get("legalConsent")),
  };
}

export async function validateSignupPayload(
  formData: FormData,
  settings?: unknown,
): Promise<{ success: true; data: z.infer<typeof signupSchema> } | { success: false; error: string }> {
  const payload = extractSignupPayload(formData);
  const parsed = signupSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: toErrorMessage(parsed.error, "Invalid signup details"),
    };
  }
  if (!parsed.data.legalConsent) {
    return {
      success: false,
      error: legalConsentError(),
    };
  }
  if (parsed.data.preferredMarket && !isOfferedAutomationMarket(parseAutomationMarketFromQuery(parsed.data.preferredMarket))) {
    return { success: false, error: "Forex is the only model currently available." };
  }
  if (parsed.data.annualPrepaySelected) {
    return { success: false, error: "Annual model prepayment is not offered. Choose a current Forex plan." };
  }
  if (!isAllowedPublicEmailDomain(parsed.data.email)) {
    return {
      success: false,
      error: PUBLIC_EMAIL_DOMAIN_BLOCK_ERROR,
    };
  }
  if (isDisposableSignupEmailBlocked(parsed.data.email, settings)) {
    return {
      success: false,
      error: "Disposable email addresses are not allowed.",
    };
  }
  return {
    success: true,
    data: parsed.data,
  };
}

async function isLoginLocked(key: string) {
  const row = await withAuthRateLimitFallback(
    () =>
      prisma.authRateLimit.findUnique({
        where: { key },
        select: { lockedUntil: true },
      }),
    null,
  );

  if (!row?.lockedUntil) {
    return null;
  }

  if (row.lockedUntil.getTime() <= Date.now()) {
    await withAuthRateLimitFallback(
      () =>
        prisma.authRateLimit.update({
          where: { key },
          data: {
            lockedUntil: null,
          },
        }),
      null,
    );
    return null;
  }

  return row.lockedUntil;
}

async function registerFailedLoginAttempt(key: string, userId: string | null, maxAttempts: number, lockMinutes: number) {
  const now = new Date();
  await withAuthRateLimitFallback(
    () => withAuthRateLimitRetry(() => prisma.$transaction(async (tx) => {
      const existing = await tx.authRateLimit.findUnique({
        where: { key },
        select: { attempts: true, userId: true },
      });

      const attempts = (existing?.attempts ?? 0) + 1;
      const lock = attempts >= maxAttempts ? new Date(now.getTime() + lockMinutes * 60_000) : null;

      return tx.authRateLimit.upsert({
        where: { key },
        update: {
          attempts: lock ? 0 : attempts,
          lockedUntil: lock,
          lastAttemptAt: now,
          userId: existing?.userId ?? userId ?? undefined,
        },
        create: {
          key,
          attempts: lock ? 0 : attempts,
          lockedUntil: lock,
          lastAttemptAt: now,
          userId: userId ?? undefined,
        },
      });
    }, { isolationLevel: "Serializable" })),
    null,
  );
}

async function clearFailedLoginAttempts(key: string, userId: string) {
  await withAuthRateLimitFallback(
    () => withAuthRateLimitRetry(() =>
      prisma.authRateLimit.upsert({
        where: { key },
        update: {
          attempts: 0,
          lockedUntil: null,
          lastAttemptAt: new Date(),
          userId,
        },
        create: {
          key,
          attempts: 0,
          lockedUntil: null,
          lastAttemptAt: new Date(),
          userId,
        },
      })),
    null,
  );
}

export async function loginAction(formData: FormData) {
  const nextPath = safeAuthNextPath(String(formData.get("next") || ""));
  let stage = "parse-login-payload";
  try {
    const payload = {
      email: normalizeCredentialEmail(String(formData.get("email") || "")),
      password: String(formData.get("password") || ""),
    };

    const parsed = loginSchema.safeParse(payload);
    if (!parsed.success) {
      redirect(authRedirectPath("/login", { error: toErrorMessage(parsed.error, "Invalid credentials") }, nextPath));
    }

    stage = "load-platform-settings";
    const settings = await getPlatformSettings();
    stage = "read-request-headers";
    const requestHeaders = await headers();
    const requestIp = getRequestIpFromHeaders(requestHeaders);
    stage = "validate-turnstile";
    const turnstileResult = await validateTurnstileSubmission({
      settings,
      action: "login",
      formData,
      remoteIp: requestIp,
    });
    if (!turnstileResult.success) {
      redirect(authRedirectPath("/login", { error: turnstileResult.error }, nextPath));
    }

    const key = rateKey(parsed.data.email);
    stage = "check-login-rate-limit";
    const lockedUntil = await isLoginLocked(key);
    if (lockedUntil) {
      redirect(authRedirectPath("/login", { error: "Too many attempts. Please try again later" }, nextPath));
    }

    stage = "load-user";
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) {
      stage = "record-failed-login-missing-user";
      await registerFailedLoginAttempt(key, null, settings.loginMaxAttempts, settings.loginLockMinutes);
      redirect(authRedirectPath("/login", { error: "Invalid email or password" }, nextPath));
    }

    stage = "verify-password";
    const ok = await verifyUserPassword(user, parsed.data.password);
    if (!ok) {
      stage = "record-failed-login-invalid-password";
      await registerFailedLoginAttempt(key, user.id, settings.loginMaxAttempts, settings.loginLockMinutes);
      redirect(authRedirectPath("/login", { error: "Invalid email or password" }, nextPath));
    }

    stage = "check-legal-reacceptance";
    const needsLegalReaccept = user.role !== UserRole.ADMIN ? await userNeedsLegalReacceptance(user.id) : false;
    stage = "ensure-trading-profile";
    const profile = await ensureTradingProfile(user.id);
    if (
      profile?.accountState === UserAccountState.SUSPENDED ||
      profile?.accountState === UserAccountState.CLOSED
    ) {
      redirect(authRedirectPath("/login", { error: "Your account is restricted. Contact support" }, nextPath));
    }

    stage = "ensure-referral-code";
    await ensureUserReferralCode(user.id, user.name, user.referralCode);
    stage = "clear-failed-login-attempts";
    await clearFailedLoginAttempts(key, user.id);

    if (user.role === UserRole.ADMIN) {
      stage = "create-admin-session";
      await createUserSession(user);
      redirect("/admin");
    }

    if (isSupportAuthNextPath(nextPath)) {
      stage = "create-support-session";
      const notice = await sendSupportFlowVerificationEmailIfNeeded(settings, user);
      await createUserSession(user);
      redirect(notice ? pathWithNotice(nextPath, notice.key, notice.message) : nextPath);
    }

    if (readBooleanSetting(settings, "enforceVerifiedEmailForActivation") && !user.emailVerifiedAt) {
      stage = "send-verification-email-enforced";
      const sent = await sendVerificationEmail({
        userId: user.id,
        email: user.email,
        name: user.name,
      });
      const params = new URLSearchParams({
        email: user.email,
      });
      if (sent) {
        params.set("success", "A new verification email has been sent.");
      } else {
        params.set("error", "Please verify your email. Email delivery is temporarily unavailable. Contact support.");
      }
      redirect(`/verify-email?${params.toString()}`);
    }

    stage = "create-member-session";
    await createUserSession(user);

    if (settings.requireEmailVerification && !user.emailVerifiedAt) {
      stage = "send-verification-email-required";
      const sent = await sendVerificationEmail({
        userId: user.id,
        email: user.email,
        name: user.name,
      });
      const params = new URLSearchParams({
        email: user.email,
      });
      if (sent) {
        params.set("success", "A new verification email has been sent.");
      } else {
        params.set("error", "Please verify your email. Email delivery is temporarily unavailable. Contact support.");
      }
      redirect(`/verify-email?${params.toString()}`);
    }

    if (needsLegalReaccept) {
      redirect(`/legal/accept?next=${encodeURIComponent("/dashboard")}`);
    }

    stage = "resolve-member-entry-route";
    const entryRoute = "/dashboard";
    redirect(isExplicitAuthNextPath(nextPath) ? nextPath : entryRoute);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    console.error(`[auth.login] unexpected failure at stage=${stage}`, error);
    redirect(authRedirectPath("/login", { error: "Login is temporarily unavailable. Please try again" }, nextPath));
  }
}

export async function signupAction(formData: FormData) {
  const nextPath = safeAuthNextPath(String(formData.get("next") || ""));
  const signupError = (error: string): never => {
    const context: Record<string, string> = { error };
    for (const [field, query] of [["planSlug", "plan"], ["preferredMarket", "market"], ["waitlistIntent", "intent"], ["referralCode", "ref"]]) {
      const value = String(formData.get(field) || "").trim();
      if (value) context[query] = value;
    }
    redirect(authRedirectPath("/signup", context, nextPath));
  };
  const settings = await getPlatformSettings();
  const validated = await validateSignupPayload(formData, settings);
  if (!validated.success) {
    return signupError(validated.error);
  }
  const parsed = validated;
  const requestedPlan = parsed.data.planSlug
    ? await prisma.pricingPlan.findFirst({ where: { slug: parsed.data.planSlug, active: true, automationMarket: "FOREX" }, select: { id: true, automationMarket: true } })
    : null;
  if (parsed.data.planSlug && !requestedPlan) {
    signupError("The selected plan is no longer available. Choose another plan.");
  }

  const requestHeaders = await headers();
  const requestIp = getRequestIpFromHeaders(requestHeaders);
  const turnstileResult = await validateTurnstileSubmission({
    settings,
    action: "signup",
    formData,
    remoteIp: requestIp,
  });
  if (!turnstileResult.success) {
    signupError(turnstileResult.error);
  }

  const antiAbuse = await enforceSignupAntiAbuse(
    {
      email: parsed.data.email,
      requestIp,
      settings,
    },
  );
  if (!antiAbuse.allowed) {
    signupError(antiAbuse.error);
  }

  const humanityGate = await enforceSignupHumanityGate({
    name: parsed.data.name,
    email: parsed.data.email,
    requestIp,
    userAgent: requestHeaders.get("user-agent"),
  });
  if (!humanityGate.allowed) {
    signupError(humanityGate.error);
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existing) {
    redirect(authRedirectPath("/login", { error: "Account already exists. Please log in" }, nextPath));
  }

  let referrerId: string | null = null;
  if (parsed.data.referralCode) {
    const referralValidation = await validateReferralCode(parsed.data.referralCode, {
      applicantEmail: parsed.data.email,
    });
    if (!referralValidation.valid) {
      if (referralValidation.reason === "invalid_format") {
        signupError("Invalid referral code");
      }
      if (referralValidation.reason === "not_found") {
        signupError("Referral code not found");
      }
      signupError("Self-referral is not allowed");
    }
    referrerId = referralValidation.referrer?.id || null;
    if (!referrerId) {
      signupError("Referral code not found");
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      referredById: referrerId,
      emailVerifiedAt:
        readBooleanSetting(settings, "requireEmailVerification") || readBooleanSetting(settings, "enforceVerifiedEmailForActivation")
          ? null
          : new Date(),
    },
  });

  await ensureUserReferralCode(user.id, user.name, null);
  await recordLegalAcceptance({
    userId: user.id,
    email: user.email,
    context: "SIGNUP",
  });

  if (referrerId) {
    await notifyUser(referrerId, {
      title: "A new referral has been recorded",
      message:
        "Someone joined Nister Flight through your invite. Rewards are earned after their confirmed deposit and eligible gameplay, under the current referral rules.",
      href: "/dashboard/referrals",
      email: {
        subject: "A new referral has been recorded",
        text:
          "Someone joined Nister Flight through your invite. Rewards are earned after their confirmed deposit and eligible gameplay, under the current referral rules.",
      },
    });
  }

  await prisma.userTradingProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      maxRiskPerTradeBps: settings.userDefaultRiskBps,
      dailyLossLimitBps: settings.userDefaultDailyLossBps,
      maxConcurrentTrades: settings.userDefaultMaxConcurrentTrades,
    },
  });

  const selectedMarket = requestedPlan?.automationMarket || parseAutomationMarketFromQuery(parsed.data.preferredMarket) || "FOREX";
  if (selectedMarket) {
    await prisma.userPreference.upsert({
      where: { userId: user.id },
      update: {
        preferredMarket: selectedMarket,
      },
      create: {
        userId: user.id,
        preferredMarket: selectedMarket,
      },
    });

    const marketLive = isMarketEnabled(settings, selectedMarket);
    const enrollmentStatus =
      marketLive ? MarketEnrollmentStatus.ACTIVE : MarketEnrollmentStatus.WAITLIST_PENDING;
    await ensureMarketEnrollment({
      userId: user.id,
      market: selectedMarket,
      planId: requestedPlan?.id,
      status: enrollmentStatus,
      annualPrepaySelected: false,
    });
  }

  if (
    readBooleanSetting(settings, "requireEmailVerification") ||
    readBooleanSetting(settings, "enforceVerifiedEmailForActivation")
  ) {
    const sent = await sendVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    if (isSupportAuthNextPath(nextPath)) {
      await createUserSession(user);
      redirect(
        pathWithNotice(
          nextPath,
          sent ? "success" : "error",
          sent
            ? "Account created. Support is open and a verification email has been sent."
            : "Account created. Support is open, but verification email delivery is temporarily unavailable.",
        ),
      );
    }
    if (sent) {
      redirect(`/verify-email?sent=1&email=${encodeURIComponent(user.email)}`);
    }
    redirect(`/verify-email?error=${encodeURIComponent("Email delivery is temporarily unavailable. Contact support.")}&email=${encodeURIComponent(user.email)}`);
  }

  await createUserSession(user);

  const entryRoute = "/dashboard";
  redirect(isExplicitAuthNextPath(nextPath) ? nextPath : entryRoute);
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function resendVerificationEmailAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) {
    redirect("/verify-email?error=Enter+your+email+address");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerifiedAt: true,
    },
  });

  if (user && !user.emailVerifiedAt) {
    const sent = await sendVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    if (!sent) {
      redirect(`/verify-email?error=${encodeURIComponent("Email delivery is temporarily unavailable. Contact support.")}&email=${encodeURIComponent(email)}`);
    }
  }

  redirect(`/verify-email?sent=1&email=${encodeURIComponent(email)}`);
}

export async function requestPasswordResetAction(formData: FormData) {
  const parsed = forgotPasswordSchema.safeParse({
    email: String(formData.get("email") || "").trim().toLowerCase(),
  });

  if (!parsed.success) {
    redirect("/forgot-password?error=Please+enter+a+valid+email+address");
  }

  const settings = await getPlatformSettings();
  const requestHeaders = await headers();
  const requestIp = getRequestIpFromHeaders(requestHeaders);
  const turnstileResult = await validateTurnstileSubmission({
    settings,
    action: "forgot-password",
    formData,
    remoteIp: requestIp,
  });
  if (!turnstileResult.success) {
    redirect(`/forgot-password?error=${encodeURIComponent(turnstileResult.error)}`);
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (user) {
    const sent = await sendPasswordResetEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    if (!sent) {
    redirect("/forgot-password?error=Email+delivery+is+temporarily+unavailable.+Contact+support");
    }
  }

  redirect("/forgot-password?success=If+an+account+exists,+a+password+reset+link+has+been+sent");
}

export async function resetPasswordAction(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    token: String(formData.get("token") || "").trim(),
    password: String(formData.get("password") || ""),
    confirmPassword: String(formData.get("confirmPassword") || ""),
  });

  if (!parsed.success) {
    redirect(`/reset-password?token=${encodeURIComponent(String(formData.get("token") || ""))}&error=${encodeURIComponent(toErrorMessage(parsed.error, "Invalid password reset request"))}`);
  }

  const verification = await consumePasswordResetToken(parsed.data.token);
  if (!verification.ok) {
    const reason =
      verification.reason === "expired"
        ? "Password+reset+link+expired.+Request+a+new+one."
        : verification.reason === "used"
          ? "Password+reset+link+already+used."
          : "Invalid+password+reset+link.";
    redirect(`/reset-password?error=${reason}`);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: verification.user.id },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: verification.tokenId },
      data: { consumedAt: now },
    }),
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: verification.user.id,
        id: { not: verification.tokenId },
      },
    }),
  ]);

  redirect("/login?success=Password+updated.+You+can+log+in+now");
}

export async function acceptLegalTermsAction(formData: FormData) {
  const user = await requireUser({ allowUnverifiedEmail: true });
  const next = safeAuthNextPath(
    String(formData.get("next") || ""),
    user.role === UserRole.ADMIN ? "/admin" : "/dashboard",
  );
  const legalConsent = asBool(formData.get("legalConsent"));
  if (!legalConsent) {
    redirect(`/legal/accept?next=${encodeURIComponent(next)}&error=${encodeURIComponent(legalConsentError())}`);
  }

  await recordLegalAcceptance({
    userId: user.id,
    email: user.email,
    context: "RE_ACCEPT",
  });

  redirect(next);
}
