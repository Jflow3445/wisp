import { resolveSelectedPlanForMarket } from "@/lib/plan-selection";
import {
  AutomationMarket,
  BrokerAccountStatus,
  ExecutionMode,
  ExecutionSessionStatus,
  MarketEnrollmentStatus,
  OfferAddonBilling,
  PaymentStatus,
  PlanTier,
  Prisma,
  ReferralCommissionStatus,
  SubscriptionStatus,
  TicketStatus,
  UserAccountState,
  UserFundsState,
  UserRole,
  UserTradeState,
} from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  PRODUCT_PLAN_REGISTRY,
  productKindForPlan,
  type ProductPlanKind,
} from "@/lib/product-capabilities";
import { getPublicAppBaseUrl } from "@/lib/public-url";
import { calculateReferralAmounts } from "@/lib/referrals";
import { sanitizeNavigableUrl } from "@/lib/safe-url";
import { planSignupHref } from "@/lib/plan-signup";

const hasDatabaseConfig = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);

export type SiteContentView = {
  id: number;
  brandName: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  trustBar: string;
  loginHeadline: string;
  loginSubhead: string;
  dashboardHeadline: string;
  dashboardSubhead: string;
  footerTagline: string;
  telegramUrl: string;
  updatedAt: Date;
};

export type HomeMetricView = {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
  active: boolean;
};

export type PricingPlanView = {
  id: string;
  slug: string;
  tier: "BASIC" | "PRO_MANAGED" | null;
  productKind: ProductPlanKind;
  automationMarket: AutomationMarket;
  name: string;
  subtitle: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  badge: string | null;
  ctaLabel: string;
  ctaHref: string;
  executionMode: ExecutionMode;
  maxAccounts: number;
  maxTerminals: number;
  mt5SetupIncluded: boolean;
  companionDeploymentIncluded: boolean;
  advancedMonitoring: boolean;
  autoRecovery: boolean;
  prioritySupport: boolean;
  uptimeFocusedOperation: boolean;
  highlight: boolean;
  features: string[];
  sortOrder: number;
  active: boolean;
};

export type FaqItemView = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  active: boolean;
};

export type GuideItemView = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  sortOrder: number;
  active: boolean;
};

export type BrokerOptionView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  signupUrl: string;
  guideUrl: string | null;
  minDepositUsd: number | null;
  regionNote: string | null;
  setupSteps: string[];
  active: boolean;
  sortOrder: number;
};

export type PaymentMethodView = {
  id: string;
  displayName: string;
  symbol: string;
  network: string;
  walletAddress: string;
  qrImageUrl: string | null;
  instructions: string | null;
  active: boolean;
  sortOrder: number;
};

export type OfferAddonView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  billing: OfferAddonBilling;
  priceUsdCents: number;
  eligibleTiers: Array<"BASIC" | "PRO_MANAGED">;
  highlight: boolean;
  active: boolean;
  sortOrder: number;
};

export type TrustSnapshotView = {
  windowDays: number;
  approvedPayments: number;
  approvalRatePct: number | null;
  medianReviewMinutes: number | null;
  reviewSlaHours: number;
};

export type ConversionFunnelSnapshotView = {
  windowDays: number;
  pricingViews: number;
  choosePlanViews: number;
  checkoutViews: number;
  checkoutSubmissions: number;
  paymentApprovals: number;
};

export type PlatformSettingsView = {
  id: number;
  requireActiveSubscription: boolean;
  referralEnabled: boolean;
  referralDiscountBps: number;
  referralCommissionBps: number;
  supportEmail: string;
  telegramUrl: string;
  requireEmailVerification: boolean;
  loginMaxAttempts: number;
  loginLockMinutes: number;
  maxPaymentSubmissionsPerDay: number;
  paymentSubmissionCooldownMins: number;
  userDefaultRiskBps: number;
  userDefaultDailyLossBps: number;
  userDefaultMaxConcurrentTrades: number;
  analyticsEnabled: boolean;
  analyticsProvider: string;
  analyticsSiteKey: string | null;
  analyticsHost: string | null;
  sessionReplayEnabled: boolean;
  sessionReplaySamplePct: number;
  ga4Enabled: boolean;
  ga4MeasurementId: string | null;
  posthogProjectKey: string | null;
  posthogHost: string | null;
  posthogSessionReplayEnabled: boolean;
  posthogSessionReplaySamplePct: number;
  posthogFeatureFlagsEnabled: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  turnstileProtectSignup: boolean;
  turnstileProtectLogin: boolean;
  turnstileProtectForgotPassword: boolean;
  googleSocialAuthEnabled: boolean;
  googleSocialAuthClientId: string | null;
  googleSocialAuthConfigured: boolean;
  facebookSocialAuthEnabled: boolean;
  facebookSocialAuthClientId: string | null;
  facebookSocialAuthConfigured: boolean;
  signupIpMaxAttempts: number;
  signupIpWindowMinutes: number;
  signupIpLockMinutes: number;
  signupEmailMaxAttempts: number;
  signupEmailWindowMinutes: number;
  signupEmailLockMinutes: number;
  signupBlockDisposableDomains: boolean;
  signupDisposableDomains: string[];
  enforceVerifiedEmailForActivation: boolean;
  experimentPricingEnabled: boolean;
  experimentPricingRolloutPct: number;
  liveChatEnabled: boolean;
  liveChatProvider: string;
  liveChatAppId: string | null;
  liveChatSalesPrompt: string;
  abandonmentRecoveryEnabled: boolean;
  abandonmentReminderDelayMins: number;
  abandonmentEscalationDelayMins: number;
  abandonmentMaxReminders: number;
  trustProofEnabled: boolean;
  trustProofWindowDays: number;
  trustReviewSlaHours: number;
  trustGuaranteeCopy: string;
  offerAddonsEnabled: boolean;
  offerUrgencyBannerEnabled: boolean;
  offerUrgencyCopy: string;
  marketForexEnabled: boolean;
  marketStocksEnabled: boolean;
  marketOptionsEnabled: boolean;
  tronSolidityNodeUrl: string | null;
  tronFullNodeUrl: string | null;
  tronMerchantReceiveAddress: string | null;
  tronUsdtContractAddress: string | null;
  tronInvoiceTtlMinutes: number;
  tronInvoiceGraceMinutes: number;
  tronAmountReuseCooldownMinutes: number;
  tronInvoiceOffsetSlots: number;
  tronWatcherMaxBlocks: number;
  updatedAt: Date;
};

export type UserTradingProfileView = {
  accountState: UserAccountState;
  fundsState: UserFundsState;
  tradeState: UserTradeState;
  availableFundsUsdCents: number | null;
  allocatedFundsUsdCents: number | null;
  maxRiskPerTradeBps: number;
  dailyLossLimitBps: number;
  maxConcurrentTrades: number;
  autotradeEnabled: boolean;
  manualNotes: string | null;
  updatedAt: Date;
};

export type SubscriptionView = {
  id: string;
  status: SubscriptionStatus;
  startedAt: Date | null;
  expiresAt: Date | null;
  plan: PricingPlanView;
};

export type UserPaymentSubmissionView = {
  id: string;
  txHash: string;
  planSlug: string | null;
  visitorId: string | null;
  amountUsdCents: number | null;
  planPriceUsdCents: number | null;
  discountUsdCents: number | null;
  addonChargeUsdCents: number | null;
  finalAmountUsdCents: number | null;
  addons: {
    slug: string;
    name: string;
    billing: "ONE_TIME" | "RECURRING";
    priceUsdCents: number;
  }[];
  experimentKey: string | null;
  experimentVariant: string | null;
  referralCodeUsed: string | null;
  note: string | null;
  status: PaymentStatus;
  reviewNote: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  paymentMethod: {
    displayName: string;
    symbol: string;
    network: string;
  };
};

export type AdminPaymentSubmissionView = UserPaymentSubmissionView & {
  user: {
    id: string;
    name: string;
    email: string;
  };
  reviewer: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export type ReferralEarningView = {
  id: string;
  status: ReferralCommissionStatus;
  commissionUsdCents: number;
  discountUsdCents: number;
  grossAmountUsdCents: number;
  commissionPercentBps: number;
  discountPercentBps: number;
  createdAt: Date;
  referredUser: {
    id: string;
    name: string;
    email: string;
  };
  paymentSubmission: {
    id: string;
    planSlug: string | null;
    status: PaymentStatus;
    submittedAt: Date;
  };
};

export type ReferralOverviewView = {
  referralCode: string | null;
  referralLink: string | null;
  isReferredUser: boolean;
  referredUsersCount: number;
  conversionsCount: number;
  commissionPendingUsdCents: number;
  commissionPaidUsdCents: number;
  commissionTotalUsdCents: number;
  recentEarnings: ReferralEarningView[];
};

export type NotificationView = {
  id: string;
  type: "PAYMENT" | "SYSTEM" | "SUPPORT";
  title: string;
  message: string;
  href: string | null;
  isRead: boolean;
  createdAt: Date;
};

export type SupportTicketView = {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: TicketStatus;
  adminReply: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export type AdminUserControlView = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  referralCode: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  referredBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  subscription: {
    status: SubscriptionStatus;
    planName: string | null;
    planSlug: string | null;
    expiresAt: Date | null;
  } | null;
  tradingProfile: UserTradingProfileView;
  counts: {
    payments: number;
    referrals: number;
    commissionsEarned: number;
  };
};

export type AdminUserControlsQueryView = {
  page?: number;
  pageSize?: number;
  query?: string;
  accountState?: UserAccountState | "ALL";
};

export type AdminUserControlsPageView = {
  rows: AdminUserControlView[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  stateCounts: {
    ALL: number;
    PENDING_REVIEW: number;
    LIMITED: number;
    SUSPENDED: number;
  };
};

export type AdminReferralCommissionView = {
  id: string;
  status: ReferralCommissionStatus;
  commissionUsdCents: number;
  discountUsdCents: number;
  grossAmountUsdCents: number;
  createdAt: Date;
  paymentSubmission: {
    id: string;
    planSlug: string | null;
    txHash: string;
    status: PaymentStatus;
  };
  referrer: {
    id: string;
    name: string;
    email: string;
  };
  referredUser: {
    id: string;
    name: string;
    email: string;
  };
};

export type AdminReferralCommissionsCursorQueryView = {
  cursor?: string | null;
  pageSize?: number;
  status?: ReferralCommissionStatus | "ALL" | string | null;
  partnerEmail?: string | null;
  referredEmail?: string | null;
  planSlug?: string | null;
};

export type AdminReferralCommissionsCursorPageView = {
  rows: AdminReferralCommissionView[];
  nextCursor: string | null;
  pageSize: number;
  totalRows: number;
};

export type DashboardStateView = {
  selectedPlan?: PricingPlanView | null;
  user: {
    id: string;
    name: string;
    email: string;
    tradingProfile: UserTradingProfileView | null;
    subscription: SubscriptionView | null;
    subscriptionActive: boolean;
    marketEnrollments: Array<{
      market: AutomationMarket;
      status: MarketEnrollmentStatus;
      planId: string | null;
      annualPrepaySelected: boolean;
      annualPrepayAmountUsdCents: number | null;
      annualPrepayPaidAt: Date | null;
      launchEmailSentAt: Date | null;
      unlockedAt: Date | null;
      joinedAt: Date;
      updatedAt: Date;
    }>;
  } | null;
  settings: PlatformSettingsView;
  methods: PaymentMethodView[];
  submissions: UserPaymentSubmissionView[];
  latestSubmission: UserPaymentSubmissionView | null;
  hasApprovedSubmission: boolean;
  brokers: BrokerOptionView[];
  activeBrokerAccount: {
    id: string;
    brokerName: string;
    brokerServer: string;
    accountLogin: string;
    accountMode: "DEMO" | "REAL";
  } | null;
  preference: {
    preferredBrokerId: string | null;
    preferredMarket: AutomationMarket | null;
    tradingGoal: string | null;
    experienceLevel: string | null;
    connectionDetails: ConnectionDetailsView | null;
    updatedAt: Date;
  } | null;
  referral: ReferralOverviewView;
  notifications: NotificationView[];
  licensedEaClients: {
    id: string;
    clientKey: string;
    label: string | null;
    active: boolean;
    lastSeenAt: Date | null;
    updatedAt: Date;
  }[];
};

export type ExecutionEntitlementView = {
  userId: string;
  settings: PlatformSettingsView;
  subscription: SubscriptionView | null;
  hasActiveSubscription: boolean;
  plan: PricingPlanView | null;
};

export type DiscountPriceView = {
  basePriceCents: number;
  discountCents: number;
  finalPriceCents: number;
  commissionCents: number;
};

export type ConnectionDetailsView = {
  brokerAccountNumber: string | null;
  brokerServer: string | null;
  brokerAccountType: string | null;
  localTerminalLabel: string | null;
  localEaClientKey: string | null;
  managedContactEmail: string | null;
  managedProvisioningNote: string | null;
};

const defaultSiteContent: SiteContentView = {
  id: 1,
  brandName: "Nister AI",
  heroEyebrow: "Signal-gated AI execution",
  heroTitle: "Autonomous Forex Trading through your own broker account.",
  heroSubtitle:
    "Autonomous AI trading on your own broker account.",
  primaryCtaLabel: "Start Forex Setup",
  primaryCtaHref: "/signup",
  secondaryCtaLabel: "View Pricing",
  secondaryCtaHref: "/pricing",
  trustBar: "Nister AI executes only when setup, risk, connection, activation, and signal gates are valid.",
  loginHeadline: "Access your Nister AI workspace",
  loginSubhead: "Log in to continue setup, manage your account, and monitor your autonomous trading environment.",
  dashboardHeadline: "Your Trading Operations Workspace",
  dashboardSubhead: "Track activation, payment verification, account state, and execution readiness in one place.",
  footerTagline: "Risk notice: Trading involves real risk. There are no guaranteed profits, and losses are possible.",
  telegramUrl: "https://t.me/nister_ai",
  updatedAt: new Date(),
};

export const defaultMetrics: HomeMetricView[] = [
  { id: "metric-1", label: "Execution model", value: "Signal-gated", sortOrder: 1, active: true },
  { id: "metric-2", label: "Account structure", value: "Self-custody", sortOrder: 2, active: true },
  { id: "metric-3", label: "Operating posture", value: "System-led", sortOrder: 3, active: true },
];

const defaultFaq: FaqItemView[] = [
  {
    id: "faq-1",
    question: "Does Nister AI guarantee profits?",
    answer: "No. Trading always involves risk, and losses are possible.",
    sortOrder: 1,
    active: true,
  },
  {
    id: "faq-2",
    question: "Can beginners use Nister AI?",
    answer: "Yes. Choose Starter if you want to run the AI through your own broker account, or Managed Funds if you want Nister to manage pooled Forex capital and monthly payout operations.",
    sortOrder: 2,
    active: true,
  },
];

const defaultGuide: GuideItemView[] = [
  {
    id: "guide-1",
    slug: "quick-start",
    title: "Quick Start Guide",
    summary: "Create account, verify email, choose plan, complete setup, and go live.",
    content:
      "1) Create your account. 2) Verify your email. 3) Choose a plan. 4) Complete payment verification. 5) Follow broker and setup instructions from your dashboard.",
    sortOrder: 1,
    active: true,
  },
];

export const defaultBrokers: BrokerOptionView[] = [
  {
    id: "broker-1",
    slug: "recommended-broker",
    name: "Recommended Broker",
    description: "Low-latency MetaTrader (MT5/MT4) execution with transparent spread conditions.",
    logoUrl: null,
    signupUrl: "https://nisterai.com",
    guideUrl: "/guide",
    minDepositUsd: 200,
    regionNote: "Availability depends on your region.",
    setupSteps: [
      "Create and verify your broker account.",
      "Generate MetaTrader credentials (MT5/MT4).",
      "Apply your setup instructions from the Nister AI dashboard.",
    ],
    active: true,
    sortOrder: 1,
  },
];

export const defaultPaymentMethods: PaymentMethodView[] = [
  {
    id: "payment-1",
    displayName: "Tether USD",
    symbol: "USDT",
    network: "TRC20",
    walletAddress: "TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    qrImageUrl: null,
    instructions: "Send exact amount on TRC20 and submit transaction hash for verification.",
    active: true,
    sortOrder: 1,
  },
];

const defaultOfferAddons: OfferAddonView[] = [];

const defaultPlatformSettings: PlatformSettingsView = {
  id: 1,
  requireActiveSubscription: true,
  referralEnabled: true,
  referralDiscountBps: 500,
  referralCommissionBps: 1000,
  supportEmail: "support@nisterai.com",
  telegramUrl: "https://t.me/nister_ai",
  requireEmailVerification: true,
  loginMaxAttempts: 6,
  loginLockMinutes: 30,
  maxPaymentSubmissionsPerDay: 5,
  paymentSubmissionCooldownMins: 5,
  userDefaultRiskBps: 200,
  userDefaultDailyLossBps: 600,
  userDefaultMaxConcurrentTrades: 3,
  analyticsEnabled: true,
  analyticsProvider: "internal",
  analyticsSiteKey: null,
  analyticsHost: null,
  sessionReplayEnabled: false,
  sessionReplaySamplePct: 20,
  ga4Enabled: false,
  ga4MeasurementId: null,
  posthogProjectKey: null,
  posthogHost: null,
  posthogSessionReplayEnabled: false,
  posthogSessionReplaySamplePct: 20,
  posthogFeatureFlagsEnabled: true,
  turnstileEnabled: false,
  turnstileSiteKey: null,
  turnstileProtectSignup: true,
  turnstileProtectLogin: true,
  turnstileProtectForgotPassword: true,
  googleSocialAuthEnabled: false,
  googleSocialAuthClientId: null,
  googleSocialAuthConfigured: false,
  facebookSocialAuthEnabled: false,
  facebookSocialAuthClientId: null,
  facebookSocialAuthConfigured: false,
  signupIpMaxAttempts: 8,
  signupIpWindowMinutes: 60,
  signupIpLockMinutes: 60,
  signupEmailMaxAttempts: 5,
  signupEmailWindowMinutes: 1440,
  signupEmailLockMinutes: 1440,
  signupBlockDisposableDomains: true,
  signupDisposableDomains: [],
  enforceVerifiedEmailForActivation: true,
  experimentPricingEnabled: true,
  experimentPricingRolloutPct: 100,
  liveChatEnabled: false,
  liveChatProvider: "telegram",
  liveChatAppId: null,
  liveChatSalesPrompt: "Questions before you pay? Use live chat and get a direct answer before checkout.",
  abandonmentRecoveryEnabled: true,
  abandonmentReminderDelayMins: 240,
  abandonmentEscalationDelayMins: 1440,
  abandonmentMaxReminders: 3,
  trustProofEnabled: true,
  trustProofWindowDays: 30,
  trustReviewSlaHours: 6,
  trustGuaranteeCopy: "Manual wallet validation and admin review are required before activation.",
  offerAddonsEnabled: false,
  offerUrgencyBannerEnabled: true,
  offerUrgencyCopy: "Payment queue is reviewed throughout the day. Submit now to secure the next review cycle.",
  marketForexEnabled: true,
  marketStocksEnabled: false,
  marketOptionsEnabled: false,
  tronSolidityNodeUrl: null,
  tronFullNodeUrl: null,
  tronMerchantReceiveAddress: null,
  tronUsdtContractAddress: null,
  tronInvoiceTtlMinutes: 30,
  tronInvoiceGraceMinutes: 20,
  tronAmountReuseCooldownMinutes: 240,
  tronInvoiceOffsetSlots: 99,
  tronWatcherMaxBlocks: 200,
  updatedAt: new Date(),
};

const defaultPlans: PricingPlanView[] = PRODUCT_PLAN_REGISTRY.map((plan) => ({
  id: `plan-${plan.slug}`,
  slug: plan.slug,
  tier: plan.tier,
  productKind: plan.productKind,
  automationMarket: AutomationMarket[plan.automationMarket],
  name: plan.publicName,
  subtitle: plan.subtitle,
  monthlyPriceCents: plan.monthlyPriceCents,
  annualPriceCents: null,
  badge: plan.badge,
  ctaLabel: plan.ctaLabel,
  ctaHref: plan.ctaHref,
  executionMode: ExecutionMode[plan.executionMode],
  maxAccounts: plan.maxAccounts,
  maxTerminals: plan.maxTerminals,
  mt5SetupIncluded: plan.mt5SetupIncluded,
  companionDeploymentIncluded: plan.companionDeploymentIncluded,
  advancedMonitoring: plan.advancedMonitoring,
  autoRecovery: plan.autoRecovery,
  prioritySupport: plan.prioritySupport,
  uptimeFocusedOperation: plan.uptimeFocusedOperation,
  highlight: plan.highlight,
  features: plan.features,
  sortOrder: plan.sortOrder,
  active: plan.active,
}));

function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function jsonToStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeDisposableDomains(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function jsonToTierArray(value: Prisma.JsonValue): Array<"BASIC" | "PRO_MANAGED"> {
  if (!Array.isArray(value)) {
    return ["BASIC", "PRO_MANAGED"];
  }
  const tiers = value
    .map((item) => (typeof item === "string" ? item.trim().toUpperCase() : ""))
    .filter((item): item is "BASIC" | "PRO_MANAGED" => item === "BASIC" || item === "PRO_MANAGED");
  if (!tiers.length) {
    return ["BASIC", "PRO_MANAGED"];
  }
  return Array.from(new Set(tiers));
}

function asTrimmedString(value: unknown, max: number) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, max);
}

function mapConnectionDetails(value: Prisma.JsonValue | null | undefined): ConnectionDetailsView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  return {
    brokerAccountNumber: asTrimmedString(row.brokerAccountNumber, 120),
    brokerServer: asTrimmedString(row.brokerServer, 120),
    brokerAccountType: asTrimmedString(row.brokerAccountType, 120),
    localTerminalLabel: asTrimmedString(row.localTerminalLabel, 120),
    localEaClientKey: asTrimmedString(row.localEaClientKey, 160),
    managedContactEmail: asTrimmedString(row.managedContactEmail, 160),
    managedProvisioningNote: asTrimmedString(row.managedProvisioningNote, 191),
  };
}

function noDb<T>(fallback: T): T {
  return fallback;
}

function appBaseUrl() {
  return getPublicAppBaseUrl();
}

function sumCents(value: number | null | undefined) {
  return typeof value === "number" ? value : 0;
}

function median(numbers: number[]) {
  if (!numbers.length) {
    return null;
  }
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function defaultTradingProfile(settings: PlatformSettingsView): UserTradingProfileView {
  return {
    accountState: UserAccountState.PENDING_REVIEW,
    fundsState: UserFundsState.UNFUNDED,
    tradeState: UserTradeState.ONBOARDING,
    availableFundsUsdCents: null,
    allocatedFundsUsdCents: null,
    maxRiskPerTradeBps: settings.userDefaultRiskBps,
    dailyLossLimitBps: settings.userDefaultDailyLossBps,
    maxConcurrentTrades: settings.userDefaultMaxConcurrentTrades,
    autotradeEnabled: false,
    manualNotes: null,
    updatedAt: new Date(),
  };
}

function normalizeSettings(input: {
  requireActiveSubscription: boolean;
  referralEnabled: boolean;
  referralDiscountBps: number;
  referralCommissionBps: number;
  supportEmail: string;
  telegramUrl: string;
  requireEmailVerification: boolean;
  loginMaxAttempts: number;
  loginLockMinutes: number;
  maxPaymentSubmissionsPerDay: number;
  paymentSubmissionCooldownMins: number;
  userDefaultRiskBps: number;
  userDefaultDailyLossBps: number;
  userDefaultMaxConcurrentTrades: number;
  analyticsEnabled: boolean;
  analyticsProvider: string;
  analyticsSiteKey: string | null;
  analyticsHost: string | null;
  sessionReplayEnabled: boolean;
  sessionReplaySamplePct: number;
  ga4Enabled: boolean;
  ga4MeasurementId: string | null;
  posthogProjectKey: string | null;
  posthogHost: string | null;
  posthogSessionReplayEnabled: boolean;
  posthogSessionReplaySamplePct: number;
  posthogFeatureFlagsEnabled: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  turnstileProtectSignup: boolean;
  turnstileProtectLogin: boolean;
  turnstileProtectForgotPassword: boolean;
  googleSocialAuthEnabled: boolean;
  googleSocialAuthClientId: string | null;
  googleSocialAuthClientSecret: string | null;
  facebookSocialAuthEnabled: boolean;
  facebookSocialAuthClientId: string | null;
  facebookSocialAuthClientSecret: string | null;
  signupIpMaxAttempts: number;
  signupIpWindowMinutes: number;
  signupIpLockMinutes: number;
  signupEmailMaxAttempts: number;
  signupEmailWindowMinutes: number;
  signupEmailLockMinutes: number;
  signupBlockDisposableDomains: boolean;
  signupDisposableDomains: Prisma.JsonValue | null;
  enforceVerifiedEmailForActivation: boolean;
  experimentPricingEnabled: boolean;
  experimentPricingRolloutPct: number;
  liveChatEnabled: boolean;
  liveChatProvider: string;
  liveChatAppId: string | null;
  liveChatSalesPrompt: string;
  abandonmentRecoveryEnabled: boolean;
  abandonmentReminderDelayMins: number;
  abandonmentEscalationDelayMins: number;
  abandonmentMaxReminders: number;
  trustProofEnabled: boolean;
  trustProofWindowDays: number;
  trustReviewSlaHours: number;
  trustGuaranteeCopy: string;
  offerAddonsEnabled: boolean;
  offerUrgencyBannerEnabled: boolean;
  offerUrgencyCopy: string;
  marketForexEnabled: boolean;
  marketStocksEnabled: boolean;
  marketOptionsEnabled: boolean;
  tronSolidityNodeUrl: string | null;
  tronFullNodeUrl: string | null;
  tronMerchantReceiveAddress: string | null;
  tronUsdtContractAddress: string | null;
  tronInvoiceTtlMinutes: number;
  tronInvoiceGraceMinutes: number;
  tronAmountReuseCooldownMinutes: number;
  tronInvoiceOffsetSlots: number;
  tronWatcherMaxBlocks: number;
  updatedAt: Date;
}): PlatformSettingsView {
  return {
    id: 1,
    requireActiveSubscription: Boolean(input.requireActiveSubscription),
    referralEnabled: Boolean(input.referralEnabled),
    referralDiscountBps: clampInt(input.referralDiscountBps, 0, 5000, defaultPlatformSettings.referralDiscountBps),
    referralCommissionBps: clampInt(
      input.referralCommissionBps,
      0,
      7000,
      defaultPlatformSettings.referralCommissionBps,
    ),
    supportEmail: input.supportEmail?.trim() || defaultPlatformSettings.supportEmail,
    telegramUrl: sanitizeNavigableUrl(input.telegramUrl?.trim(), defaultPlatformSettings.telegramUrl),
    requireEmailVerification: Boolean(input.requireEmailVerification),
    loginMaxAttempts: clampInt(input.loginMaxAttempts, 3, 20, defaultPlatformSettings.loginMaxAttempts),
    loginLockMinutes: clampInt(input.loginLockMinutes, 1, 720, defaultPlatformSettings.loginLockMinutes),
    maxPaymentSubmissionsPerDay: clampInt(
      input.maxPaymentSubmissionsPerDay,
      1,
      50,
      defaultPlatformSettings.maxPaymentSubmissionsPerDay,
    ),
    paymentSubmissionCooldownMins: clampInt(
      input.paymentSubmissionCooldownMins,
      0,
      240,
      defaultPlatformSettings.paymentSubmissionCooldownMins,
    ),
    userDefaultRiskBps: clampInt(input.userDefaultRiskBps, 25, 5000, defaultPlatformSettings.userDefaultRiskBps),
    userDefaultDailyLossBps: clampInt(
      input.userDefaultDailyLossBps,
      100,
      10000,
      defaultPlatformSettings.userDefaultDailyLossBps,
    ),
    userDefaultMaxConcurrentTrades: clampInt(
      input.userDefaultMaxConcurrentTrades,
      1,
      30,
      defaultPlatformSettings.userDefaultMaxConcurrentTrades,
    ),
    analyticsEnabled: Boolean(input.analyticsEnabled),
    analyticsProvider: input.analyticsProvider?.trim() || defaultPlatformSettings.analyticsProvider,
    analyticsSiteKey: input.analyticsSiteKey?.trim() || null,
    analyticsHost: input.analyticsHost?.trim() || null,
    sessionReplayEnabled: Boolean(input.sessionReplayEnabled),
    sessionReplaySamplePct: clampInt(
      input.sessionReplaySamplePct,
      0,
      100,
      defaultPlatformSettings.sessionReplaySamplePct,
    ),
    ga4Enabled: Boolean(input.ga4Enabled),
    ga4MeasurementId: input.ga4MeasurementId?.trim() || null,
    posthogProjectKey: input.posthogProjectKey?.trim() || input.analyticsSiteKey?.trim() || null,
    posthogHost: input.posthogHost?.trim() || input.analyticsHost?.trim() || null,
    posthogSessionReplayEnabled: Boolean(input.posthogSessionReplayEnabled),
    posthogSessionReplaySamplePct: clampInt(
      input.posthogSessionReplaySamplePct,
      0,
      100,
      defaultPlatformSettings.posthogSessionReplaySamplePct,
    ),
    posthogFeatureFlagsEnabled: Boolean(input.posthogFeatureFlagsEnabled),
    turnstileEnabled: Boolean(input.turnstileEnabled),
    turnstileSiteKey: input.turnstileSiteKey?.trim() || null,
    turnstileProtectSignup: Boolean(input.turnstileProtectSignup),
    turnstileProtectLogin: Boolean(input.turnstileProtectLogin),
    turnstileProtectForgotPassword: Boolean(input.turnstileProtectForgotPassword),
    googleSocialAuthEnabled: Boolean(input.googleSocialAuthEnabled),
    googleSocialAuthClientId: input.googleSocialAuthClientId?.trim() || null,
    googleSocialAuthConfigured: Boolean(
      input.googleSocialAuthEnabled &&
        input.googleSocialAuthClientId?.trim() &&
        input.googleSocialAuthClientSecret?.trim(),
    ),
    facebookSocialAuthEnabled: Boolean(input.facebookSocialAuthEnabled),
    facebookSocialAuthClientId: input.facebookSocialAuthClientId?.trim() || null,
    facebookSocialAuthConfigured: Boolean(
      input.facebookSocialAuthEnabled &&
        input.facebookSocialAuthClientId?.trim() &&
        input.facebookSocialAuthClientSecret?.trim(),
    ),
    signupIpMaxAttempts: clampInt(input.signupIpMaxAttempts, 1, 100, defaultPlatformSettings.signupIpMaxAttempts),
    signupIpWindowMinutes: clampInt(
      input.signupIpWindowMinutes,
      1,
      10080,
      defaultPlatformSettings.signupIpWindowMinutes,
    ),
    signupIpLockMinutes: clampInt(input.signupIpLockMinutes, 1, 10080, defaultPlatformSettings.signupIpLockMinutes),
    signupEmailMaxAttempts: clampInt(
      input.signupEmailMaxAttempts,
      1,
      100,
      defaultPlatformSettings.signupEmailMaxAttempts,
    ),
    signupEmailWindowMinutes: clampInt(
      input.signupEmailWindowMinutes,
      1,
      10080,
      defaultPlatformSettings.signupEmailWindowMinutes,
    ),
    signupEmailLockMinutes: clampInt(
      input.signupEmailLockMinutes,
      1,
      10080,
      defaultPlatformSettings.signupEmailLockMinutes,
    ),
    signupBlockDisposableDomains: Boolean(input.signupBlockDisposableDomains),
    signupDisposableDomains: normalizeDisposableDomains(input.signupDisposableDomains),
    enforceVerifiedEmailForActivation: Boolean(input.enforceVerifiedEmailForActivation),
    experimentPricingEnabled: Boolean(input.experimentPricingEnabled),
    experimentPricingRolloutPct: clampInt(
      input.experimentPricingRolloutPct,
      0,
      100,
      defaultPlatformSettings.experimentPricingRolloutPct,
    ),
    liveChatEnabled: Boolean(input.liveChatEnabled),
    liveChatProvider: input.liveChatProvider?.trim() || defaultPlatformSettings.liveChatProvider,
    liveChatAppId: input.liveChatAppId?.trim() || null,
    liveChatSalesPrompt: input.liveChatSalesPrompt?.trim() || defaultPlatformSettings.liveChatSalesPrompt,
    abandonmentRecoveryEnabled: Boolean(input.abandonmentRecoveryEnabled),
    abandonmentReminderDelayMins: clampInt(
      input.abandonmentReminderDelayMins,
      15,
      10080,
      defaultPlatformSettings.abandonmentReminderDelayMins,
    ),
    abandonmentEscalationDelayMins: clampInt(
      input.abandonmentEscalationDelayMins,
      60,
      20160,
      defaultPlatformSettings.abandonmentEscalationDelayMins,
    ),
    abandonmentMaxReminders: clampInt(
      input.abandonmentMaxReminders,
      1,
      10,
      defaultPlatformSettings.abandonmentMaxReminders,
    ),
    trustProofEnabled: Boolean(input.trustProofEnabled),
    trustProofWindowDays: clampInt(
      input.trustProofWindowDays,
      7,
      365,
      defaultPlatformSettings.trustProofWindowDays,
    ),
    trustReviewSlaHours: clampInt(
      input.trustReviewSlaHours,
      1,
      72,
      defaultPlatformSettings.trustReviewSlaHours,
    ),
    trustGuaranteeCopy: input.trustGuaranteeCopy?.trim() || defaultPlatformSettings.trustGuaranteeCopy,
    offerAddonsEnabled: Boolean(input.offerAddonsEnabled),
    offerUrgencyBannerEnabled: Boolean(input.offerUrgencyBannerEnabled),
    offerUrgencyCopy: input.offerUrgencyCopy?.trim() || defaultPlatformSettings.offerUrgencyCopy,
    marketForexEnabled: Boolean(input.marketForexEnabled),
    marketStocksEnabled: false,
    marketOptionsEnabled: false,
    tronSolidityNodeUrl: input.tronSolidityNodeUrl?.trim() || null,
    tronFullNodeUrl: input.tronFullNodeUrl?.trim() || null,
    tronMerchantReceiveAddress: input.tronMerchantReceiveAddress?.trim() || null,
    tronUsdtContractAddress: input.tronUsdtContractAddress?.trim() || null,
    tronInvoiceTtlMinutes: clampInt(
      input.tronInvoiceTtlMinutes,
      1,
      60 * 24,
      defaultPlatformSettings.tronInvoiceTtlMinutes,
    ),
    tronInvoiceGraceMinutes: clampInt(
      input.tronInvoiceGraceMinutes,
      0,
      60 * 24,
      defaultPlatformSettings.tronInvoiceGraceMinutes,
    ),
    tronAmountReuseCooldownMinutes: clampInt(
      input.tronAmountReuseCooldownMinutes,
      1,
      60 * 24 * 7,
      defaultPlatformSettings.tronAmountReuseCooldownMinutes,
    ),
    tronInvoiceOffsetSlots: clampInt(
      input.tronInvoiceOffsetSlots,
      1,
      500,
      defaultPlatformSettings.tronInvoiceOffsetSlots,
    ),
    tronWatcherMaxBlocks: clampInt(
      input.tronWatcherMaxBlocks,
      1,
      500,
      defaultPlatformSettings.tronWatcherMaxBlocks,
    ),
    updatedAt: input.updatedAt,
  };
}

function mapPlan(plan: {
  id: string;
  slug: string;
  tier: "BASIC" | "PRO_MANAGED" | null;
  productKind?: ProductPlanKind | null;
  automationMarket: AutomationMarket;
  name: string;
  subtitle: string;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  badge: string | null;
  ctaLabel: string;
  ctaHref: string;
  executionMode: ExecutionMode;
  maxAccounts: number;
  maxTerminals: number;
  mt5SetupIncluded: boolean;
  companionDeploymentIncluded: boolean;
  advancedMonitoring: boolean;
  autoRecovery: boolean;
  prioritySupport: boolean;
  uptimeFocusedOperation: boolean;
  highlight: boolean;
  features: Prisma.JsonValue;
  sortOrder: number;
  active: boolean;
}): PricingPlanView {
  return {
    ...plan,
    productKind: plan.productKind ?? productKindForPlan(plan),
    ctaHref: planSignupHref(plan),
    features: jsonToStringArray(plan.features),
  };
}

function mapBroker(broker: {
  id: string;
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  signupUrl: string;
  guideUrl: string | null;
  minDepositUsd: number | null;
  regionNote: string | null;
  setupSteps: Prisma.JsonValue;
  active: boolean;
  sortOrder: number;
}): BrokerOptionView {
  return {
    ...broker,
    signupUrl: sanitizeNavigableUrl(broker.signupUrl, "/recommended-brokers"),
    guideUrl: broker.guideUrl ? sanitizeNavigableUrl(broker.guideUrl, "/guide") : null,
    setupSteps: jsonToStringArray(broker.setupSteps),
  };
}

function mapOfferAddon(addon: {
  id: string;
  slug: string;
  name: string;
  description: string;
  billing: OfferAddonBilling;
  priceUsdCents: number;
  eligibleTiers: Prisma.JsonValue;
  highlight: boolean;
  active: boolean;
  sortOrder: number;
}): OfferAddonView {
  return {
    ...addon,
    eligibleTiers: jsonToTierArray(addon.eligibleTiers),
  };
}

function mapSubmissionAddons(value: Prisma.JsonValue | null | undefined): UserPaymentSubmissionView["addons"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const row = item as Record<string, unknown>;
      const slug = typeof row.slug === "string" ? row.slug.trim() : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      const billingRaw = typeof row.billing === "string" ? row.billing.trim().toUpperCase() : "";
      const billing: "ONE_TIME" | "RECURRING" =
        billingRaw === "RECURRING" ? "RECURRING" : "ONE_TIME";
      const priceUsdCents =
        typeof row.priceUsdCents === "number" && Number.isFinite(row.priceUsdCents)
          ? Math.max(0, Math.round(row.priceUsdCents))
          : 0;
      if (!slug || !name || priceUsdCents <= 0) {
        return null;
      }
      return {
        slug,
        name,
        billing,
        priceUsdCents,
      };
    })
    .filter(
      (
        row,
      ): row is {
        slug: string;
        name: string;
        billing: "ONE_TIME" | "RECURRING";
        priceUsdCents: number;
      } => Boolean(row),
    );
}

function mapSubmission(submission: {
  id: string;
  txHash: string;
  planSlug: string | null;
  visitorId: string | null;
  amountUsdCents: number | null;
  planPriceUsdCents: number | null;
  discountUsdCents: number | null;
  addonChargeUsdCents: number | null;
  finalAmountUsdCents: number | null;
  addonsJson: Prisma.JsonValue | null;
  experimentKey: string | null;
  experimentVariant: string | null;
  referralCodeUsed: string | null;
  note: string | null;
  status: PaymentStatus;
  reviewNote: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  paymentMethod: {
    displayName: string;
    symbol: string;
    network: string;
  };
}): UserPaymentSubmissionView {
  return {
    id: submission.id,
    txHash: submission.txHash,
    planSlug: submission.planSlug,
    visitorId: submission.visitorId,
    amountUsdCents: submission.amountUsdCents,
    planPriceUsdCents: submission.planPriceUsdCents,
    discountUsdCents: submission.discountUsdCents,
    addonChargeUsdCents: submission.addonChargeUsdCents,
    finalAmountUsdCents: submission.finalAmountUsdCents,
    addons: mapSubmissionAddons(submission.addonsJson),
    experimentKey: submission.experimentKey,
    experimentVariant: submission.experimentVariant,
    referralCodeUsed: submission.referralCodeUsed,
    note: submission.note,
    status: submission.status,
    reviewNote: submission.reviewNote,
    submittedAt: submission.submittedAt,
    reviewedAt: submission.reviewedAt,
    paymentMethod: submission.paymentMethod,
  };
}

function isSupersededRejection(submission: UserPaymentSubmissionView) {
  return (
    submission.status === PaymentStatus.REJECTED &&
    /superseded by approved invoice confirmation/i.test(String(submission.reviewNote || ""))
  );
}

function submissionDecisionTimestamp(submission: UserPaymentSubmissionView) {
  return (submission.reviewedAt || submission.submittedAt).getTime();
}

export function resolveLatestSubmissionForStatus(
  submissions: UserPaymentSubmissionView[],
): UserPaymentSubmissionView | null {
  if (!submissions.length) {
    return null;
  }
  const ranked = [...submissions].sort((left, right) => {
    const leftSuperseded = isSupersededRejection(left);
    const rightSuperseded = isSupersededRejection(right);
    if (leftSuperseded !== rightSuperseded) {
      return leftSuperseded ? 1 : -1;
    }

    const rightDecisionTime = submissionDecisionTimestamp(right);
    const leftDecisionTime = submissionDecisionTimestamp(left);
    if (rightDecisionTime !== leftDecisionTime) {
      return rightDecisionTime - leftDecisionTime;
    }

    return right.submittedAt.getTime() - left.submittedAt.getTime();
  });
  return ranked[0] || null;
}

function mapTradingProfile(profile: {
  accountState: UserAccountState;
  fundsState: UserFundsState;
  tradeState: UserTradeState;
  availableFundsUsdCents: number | null;
  allocatedFundsUsdCents: number | null;
  maxRiskPerTradeBps: number;
  dailyLossLimitBps: number;
  maxConcurrentTrades: number;
  autotradeEnabled: boolean;
  manualNotes: string | null;
  updatedAt: Date;
}): UserTradingProfileView {
  return {
    accountState: profile.accountState,
    fundsState: profile.fundsState,
    tradeState: profile.tradeState,
    availableFundsUsdCents: profile.availableFundsUsdCents,
    allocatedFundsUsdCents: profile.allocatedFundsUsdCents,
    maxRiskPerTradeBps: profile.maxRiskPerTradeBps,
    dailyLossLimitBps: profile.dailyLossLimitBps,
    maxConcurrentTrades: profile.maxConcurrentTrades,
    autotradeEnabled: profile.autotradeEnabled,
    manualNotes: profile.manualNotes,
    updatedAt: profile.updatedAt,
  };
}

function trimPercent(raw: string) {
  return raw.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
export function formatUsd(cents: number | null | undefined) {
  const safe = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe / 100);
}

export function formatPercentFromBps(bps: number) {
  const safe = Number.isFinite(bps) ? Math.max(0, bps) : 0;
  return `${trimPercent((safe / 100).toFixed(2))}%`;
}

export function formatWalletAddress(address: string, start = 8, end = 6) {
  const value = (address || "").trim();
  if (!value) {
    return "-";
  }
  if (value.length <= start + end + 3) {
    return value;
  }
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function paymentStatusLabel(status: PaymentStatus) {
  switch (status) {
    case PaymentStatus.APPROVED:
      return "Approved";
    case PaymentStatus.REJECTED:
      return "Rejected";
    default:
      return "Pending";
  }
}

export function referralStatusLabel(status: ReferralCommissionStatus) {
  switch (status) {
    case ReferralCommissionStatus.APPROVED:
      return "Approved";
    case ReferralCommissionStatus.PAID:
      return "Paid";
    case ReferralCommissionStatus.REVERSED:
      return "Reversed";
    default:
      return "Pending";
  }
}

export function ticketStatusLabel(status: TicketStatus) {
  switch (status) {
    case TicketStatus.IN_PROGRESS:
      return "In Progress";
    case TicketStatus.RESOLVED:
      return "Resolved";
    case TicketStatus.CLOSED:
      return "Closed";
    default:
      return "Open";
  }
}

export function calculateDiscountedPriceCents(
  monthlyPriceCents: number,
  isReferredUser: boolean,
  settings: PlatformSettingsView,
): DiscountPriceView {
  const safeBase = Number.isFinite(monthlyPriceCents) && monthlyPriceCents > 0 ? Math.round(monthlyPriceCents) : 0;

  if (!settings.referralEnabled || !isReferredUser) {
    return {
      basePriceCents: safeBase,
      discountCents: 0,
      finalPriceCents: safeBase,
      commissionCents: 0,
    };
  }

  const calc = calculateReferralAmounts(safeBase, settings.referralDiscountBps, settings.referralCommissionBps);
  return {
    basePriceCents: calc.baseCents,
    discountCents: calc.discountCents,
    finalPriceCents: calc.finalCents,
    commissionCents: calc.commissionCents,
  };
}

export function isSubscriptionActive(subscription: {
  status: SubscriptionStatus;
  expiresAt: Date | null;
} | null | undefined) {
  if (!subscription) {
    return false;
  }
  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    return false;
  }
  if (subscription.expiresAt && subscription.expiresAt.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

export async function getPlatformSettings(): Promise<PlatformSettingsView> {
  if (!hasDatabaseConfig) {
    return noDb(defaultPlatformSettings);
  }
  try {
    const settings = await prisma.platformSetting.findUnique({ where: { id: 1 } });
    if (!settings) {
      return defaultPlatformSettings;
    }
    return normalizeSettings(settings);
  } catch {
    return defaultPlatformSettings;
  }
}

export async function getSiteContent(): Promise<SiteContentView> {
  if (!hasDatabaseConfig) {
    return noDb(defaultSiteContent);
  }
  try {
    const row = await prisma.siteContent.findUnique({ where: { id: 1 } });
    if (!row) {
      return defaultSiteContent;
    }
    return {
      ...defaultSiteContent,
      ...row,
      primaryCtaHref: sanitizeNavigableUrl(row.primaryCtaHref, defaultSiteContent.primaryCtaHref),
      secondaryCtaHref: sanitizeNavigableUrl(row.secondaryCtaHref, defaultSiteContent.secondaryCtaHref),
      telegramUrl: sanitizeNavigableUrl(row.telegramUrl, defaultSiteContent.telegramUrl),
    };
  } catch {
    return defaultSiteContent;
  }
}

export async function getPricingPlans(): Promise<PricingPlanView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultPlans);
  }
  try {
    const plans = await prisma.pricingPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return plans.map((plan) => mapPlan(plan));
  } catch {
    return [];
  }
}

export async function getActivePricingPlans(): Promise<PricingPlanView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultPlans.filter((plan) => plan.active));
  }
  try {
    const plans = await prisma.pricingPlan.findMany({
      where: { active: true, automationMarket: AutomationMarket.FOREX },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return plans.map((plan) => mapPlan(plan));
  } catch {
    return [];
  }
}

export async function getPlanBySlug(slug: string): Promise<PricingPlanView | null> {
  if (!hasDatabaseConfig) {
    return defaultPlans.find((item) => item.slug === slug) ?? null;
  }
  try {
    const row = await prisma.pricingPlan.findUnique({ where: { slug } });
    return row ? mapPlan(row) : null;
  } catch {
    return null;
  }
}

export async function getHomeMetrics(): Promise<HomeMetricView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultMetrics);
  }
  try {
    const metrics = await prisma.homeMetric.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    });
    return metrics.length ? metrics : defaultMetrics;
  } catch {
    return defaultMetrics;
  }
}

export async function getFaqItems(): Promise<FaqItemView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultFaq);
  }
  try {
    const rows = await prisma.faqItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { question: "asc" }],
    });
    return rows.length ? rows : defaultFaq;
  } catch {
    return defaultFaq;
  }
}

export async function getAllFaqItems(): Promise<FaqItemView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultFaq);
  }
  try {
    const rows = await prisma.faqItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { question: "asc" }],
    });
    return rows.length ? rows : defaultFaq;
  } catch {
    return defaultFaq;
  }
}

export async function getGuideItems(): Promise<GuideItemView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultGuide);
  }
  try {
    const rows = await prisma.guideItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    return rows.length ? rows : defaultGuide;
  } catch {
    return defaultGuide;
  }
}

export async function getAllGuideItems(): Promise<GuideItemView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultGuide);
  }
  try {
    const rows = await prisma.guideItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });
    return rows.length ? rows : defaultGuide;
  } catch {
    return defaultGuide;
  }
}

export async function getGuideItemBySlug(slug: string): Promise<GuideItemView | null> {
  if (!hasDatabaseConfig) {
    return defaultGuide.find((item) => item.slug === slug) ?? null;
  }
  try {
    return await prisma.guideItem.findUnique({ where: { slug } });
  } catch {
    return null;
  }
}

export async function getActiveBrokers(): Promise<BrokerOptionView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultBrokers);
  }
  try {
    const brokers = await prisma.brokerOption.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return brokers.map((broker) => mapBroker(broker));
  } catch {
    return [];
  }
}

export async function getBrokers(): Promise<BrokerOptionView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultBrokers);
  }
  try {
    const brokers = await prisma.brokerOption.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return brokers.map((broker) => mapBroker(broker));
  } catch {
    return [];
  }
}

export async function getActivePaymentMethods(): Promise<PaymentMethodView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultPaymentMethods);
  }
  try {
    const rows = await prisma.paymentMethod.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    });
    return rows;
  } catch {
    return [];
  }
}

export async function getPaymentMethods(): Promise<PaymentMethodView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultPaymentMethods);
  }
  try {
    const rows = await prisma.paymentMethod.findMany({
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    });
    return rows;
  } catch {
    return [];
  }
}

export async function getOfferAddons(): Promise<OfferAddonView[]> {
  if (!hasDatabaseConfig) {
    return noDb(defaultOfferAddons);
  }
  try {
    const rows = await prisma.offerAddon.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.length ? rows.map((row) => mapOfferAddon(row)) : defaultOfferAddons;
  } catch {
    return defaultOfferAddons;
  }
}

export async function getActiveOfferAddons(planTier?: PlanTier | null): Promise<OfferAddonView[]> {
  const rows = await getOfferAddons();
  return rows.filter((row) => {
    if (!row.active) {
      return false;
    }
    if (!planTier) {
      return true;
    }
    return row.eligibleTiers.includes(planTier);
  });
}

export async function getTrustSnapshot(windowDays: number, reviewSlaHours: number): Promise<TrustSnapshotView> {
  const safeWindow = clampInt(windowDays, 7, 365, defaultPlatformSettings.trustProofWindowDays);
  const safeSla = clampInt(reviewSlaHours, 1, 72, defaultPlatformSettings.trustReviewSlaHours);
  if (!hasDatabaseConfig) {
    return noDb({
      windowDays: safeWindow,
      approvedPayments: 0,
      approvalRatePct: null,
      medianReviewMinutes: null,
      reviewSlaHours: safeSla,
    });
  }

  const from = new Date(Date.now() - safeWindow * 24 * 60 * 60 * 1000);
  try {
    const [total, approved, reviewed] = await Promise.all([
      prisma.paymentSubmission.count({
        where: {
          submittedAt: { gte: from },
        },
      }),
      prisma.paymentSubmission.count({
        where: {
          status: PaymentStatus.APPROVED,
          submittedAt: { gte: from },
        },
      }),
      prisma.paymentSubmission.findMany({
        where: {
          reviewedAt: { not: null },
          submittedAt: { gte: from },
        },
        select: {
          submittedAt: true,
          reviewedAt: true,
        },
      }),
    ]);

    const minutes = reviewed
      .map((row) => {
        if (!row.reviewedAt) {
          return null;
        }
        return Math.max(1, Math.round((row.reviewedAt.getTime() - row.submittedAt.getTime()) / 60000));
      })
      .filter((value): value is number => typeof value === "number");

    return {
      windowDays: safeWindow,
      approvedPayments: approved,
      approvalRatePct: total > 0 ? Number(((approved / total) * 100).toFixed(1)) : null,
      medianReviewMinutes: median(minutes),
      reviewSlaHours: safeSla,
    };
  } catch {
    return {
      windowDays: safeWindow,
      approvedPayments: 0,
      approvalRatePct: null,
      medianReviewMinutes: null,
      reviewSlaHours: safeSla,
    };
  }
}

export async function getConversionFunnelSnapshot(windowDays: number): Promise<ConversionFunnelSnapshotView> {
  const safeWindow = clampInt(windowDays, 1, 365, 30);
  if (!hasDatabaseConfig) {
    return noDb({
      windowDays: safeWindow,
      pricingViews: 0,
      choosePlanViews: 0,
      checkoutViews: 0,
      checkoutSubmissions: 0,
      paymentApprovals: 0,
    });
  }
  const from = new Date(Date.now() - safeWindow * 24 * 60 * 60 * 1000);

  try {
    const [pricingViews, choosePlanViews, checkoutViews, checkoutSubmissions, paymentApprovals] =
      await Promise.all([
        prisma.conversionEvent.count({
          where: {
            eventName: "pricing_page_viewed",
            createdAt: { gte: from },
          },
        }),
        prisma.conversionEvent.count({
          where: {
            eventName: "onboarding_choose_plan_viewed",
            createdAt: { gte: from },
          },
        }),
        prisma.conversionEvent.count({
          where: {
            eventName: "onboarding_checkout_viewed",
            createdAt: { gte: from },
          },
        }),
        prisma.conversionEvent.count({
          where: {
            eventName: "onboarding_checkout_submitted",
            createdAt: { gte: from },
          },
        }),
        prisma.conversionEvent.count({
          where: {
            eventName: "payment_approved",
            createdAt: { gte: from },
          },
        }),
      ]);

    return {
      windowDays: safeWindow,
      pricingViews,
      choosePlanViews,
      checkoutViews,
      checkoutSubmissions,
      paymentApprovals,
    };
  } catch {
    return {
      windowDays: safeWindow,
      pricingViews: 0,
      choosePlanViews: 0,
      checkoutViews: 0,
      checkoutSubmissions: 0,
      paymentApprovals: 0,
    };
  }
}

export async function ensureTradingProfile(userId: string): Promise<UserTradingProfileView | null> {
  if (!hasDatabaseConfig) {
    const settings = await getPlatformSettings();
    return noDb(defaultTradingProfile(settings));
  }

  try {
    const settings = await getPlatformSettings();
    const profile = await prisma.userTradingProfile.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        maxRiskPerTradeBps: settings.userDefaultRiskBps,
        dailyLossLimitBps: settings.userDefaultDailyLossBps,
        maxConcurrentTrades: settings.userDefaultMaxConcurrentTrades,
      },
    });
    return mapTradingProfile(profile);
  } catch {
    return null;
  }
}

export async function getUnreadNotificationCount(userId: string) {
  if (!hasDatabaseConfig) {
    return 0;
  }
  try {
    return await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  } catch {
    return 0;
  }
}

export async function getUserSubscription(userId: string): Promise<SubscriptionView | null> {
  if (!hasDatabaseConfig) {
    return null;
  }
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      include: {
        plan: true,
      },
    });
    if (!sub) {
      return null;
    }
    return {
      id: sub.id,
      status: sub.status,
      startedAt: sub.startedAt,
      expiresAt: sub.expiresAt,
      plan: mapPlan(sub.plan),
    };
  } catch {
    return null;
  }
}

export async function getExecutionEntitlements(userId: string): Promise<ExecutionEntitlementView> {
  const settings = await getPlatformSettings();
  const subscription = await getUserSubscription(userId);
  const active = isSubscriptionActive(subscription);

  return {
    userId,
    settings,
    subscription,
    hasActiveSubscription: active,
    plan: active ? subscription?.plan ?? null : null,
  };
}

export async function assertManagedProvisioningAccess(userId: string) {
  const entitlements = await getExecutionEntitlements(userId);
  if (entitlements.settings.requireActiveSubscription && !entitlements.hasActiveSubscription) {
    throw new Error("Active subscription required");
  }
  if (!entitlements.plan || entitlements.plan.executionMode !== ExecutionMode.MANAGED) {
    throw new Error("Hosted runtime provisioning is not available for this plan");
  }
  return entitlements;
}
export async function assertExecutionAccess(input: {
  userId: string;
  mode: ExecutionMode;
  clientKey: string;
}) {
  if (!hasDatabaseConfig) {
    throw new Error("Database is not configured");
  }

  const entitlements = await getExecutionEntitlements(input.userId);
  if (entitlements.settings.requireActiveSubscription && !entitlements.hasActiveSubscription) {
    throw new Error("Active subscription required");
  }

  if (!entitlements.plan) {
    throw new Error("No active plan entitlements found");
  }

  if (input.mode === ExecutionMode.MANAGED && entitlements.plan.executionMode !== ExecutionMode.MANAGED) {
    throw new Error("This account cannot access hosted runtime provisioning endpoints");
  }

  const client = await prisma.licensedEaClient.findFirst({
    where: {
      userId: input.userId,
      clientKey: input.clientKey,
      active: true,
    },
    select: {
      id: true,
      clientKey: true,
      active: true,
    },
  });

  if (!client) {
    throw new Error("Signals are only accepted by licensed Nister AI App clients");
  }

  const activeSessions = await prisma.executionSession.findMany({
    where: {
      userId: input.userId,
      status: ExecutionSessionStatus.ACTIVE,
    },
    select: {
      id: true,
      mode: true,
    },
  });

  if (
    entitlements.plan.executionMode === ExecutionMode.MANAGED &&
    input.mode === ExecutionMode.LOCAL &&
    activeSessions.some((session) => session.mode === ExecutionMode.MANAGED)
  ) {
    throw new Error("Managed users cannot run unmanaged duplicate sessions");
  }

  if (activeSessions.length >= entitlements.plan.maxTerminals) {
    throw new Error("Execution terminal limit reached for current plan");
  }

  return {
    entitlements,
    clientId: client.id,
  };
}

export async function beginExecutionSession(input: {
  userId: string;
  mode: ExecutionMode;
  clientKey: string;
  source?: string | null;
}) {
  const allowed = await assertExecutionAccess({
    userId: input.userId,
    mode: input.mode,
    clientKey: input.clientKey,
  });

  const session = await prisma.executionSession.create({
    data: {
      userId: input.userId,
      mode: input.mode,
      status: ExecutionSessionStatus.ACTIVE,
      source: input.source || null,
    },
  });

  await prisma.executionLog.create({
    data: {
      userId: input.userId,
      sessionId: session.id,
      eaClientId: allowed.clientId,
      eventType: "SESSION_OPEN",
      payload: {
        mode: input.mode,
        source: input.source || null,
      },
    },
  });

  return session;
}

export async function endExecutionSession(input: {
  userId: string;
  sessionId: string;
  reason?: string | null;
  clientKey: string;
}) {
  if (!hasDatabaseConfig) {
    throw new Error("Database is not configured");
  }

  const client = await prisma.licensedEaClient.findFirst({
    where: {
      userId: input.userId,
      clientKey: input.clientKey,
      active: true,
    },
    select: { id: true },
  });
  if (!client) {
    throw new Error("Signals are only accepted by licensed Nister AI App clients");
  }

  const session = await prisma.executionSession.findFirst({
    where: {
      id: input.sessionId,
      userId: input.userId,
      status: ExecutionSessionStatus.ACTIVE,
    },
    select: {
      id: true,
      mode: true,
    },
  });
  if (!session) {
    throw new Error("Active execution session not found");
  }

  await prisma.executionSession.update({
    where: { id: session.id },
    data: {
      status: ExecutionSessionStatus.CLOSED,
      endedAt: new Date(),
    },
  });

  await prisma.executionLog.create({
    data: {
      userId: input.userId,
      sessionId: session.id,
      eaClientId: client.id,
      eventType: "SESSION_CLOSE",
      payload: {
        mode: session.mode,
        reason: input.reason || null,
      },
    },
  });
}

export async function logExecutionEvent(input: {
  userId: string;
  sessionId?: string | null;
  clientKey: string;
  eventType: string;
  symbol?: string | null;
  requestedPrice?: number | null;
  executedPrice?: number | null;
  slippagePips?: number | null;
  payload?: Prisma.JsonValue;
}) {
  if (!hasDatabaseConfig) {
    throw new Error("Database is not configured");
  }

  const client = await prisma.licensedEaClient.findFirst({
    where: {
      userId: input.userId,
      clientKey: input.clientKey,
      active: true,
    },
    select: { id: true },
  });

  if (!client) {
    throw new Error("Signals are only accepted by licensed Nister AI App clients");
  }

  return prisma.executionLog.create({
    data: {
      userId: input.userId,
      sessionId: input.sessionId || null,
      eaClientId: client.id,
      eventType: input.eventType,
      symbol: input.symbol || null,
      requestedPrice: typeof input.requestedPrice === "number" ? input.requestedPrice : null,
      executedPrice: typeof input.executedPrice === "number" ? input.executedPrice : null,
      slippagePips: typeof input.slippagePips === "number" ? input.slippagePips : null,
      payload: input.payload || undefined,
    },
  });
}

export async function getReferralOverview(userId: string): Promise<ReferralOverviewView> {
  if (!hasDatabaseConfig) {
    return noDb({
      referralCode: null,
      referralLink: null,
      isReferredUser: false,
      referredUsersCount: 0,
      conversionsCount: 0,
      commissionPendingUsdCents: 0,
      commissionPaidUsdCents: 0,
      commissionTotalUsdCents: 0,
      recentEarnings: [],
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referralCode: true,
        referredById: true,
      },
    });

    if (!user) {
      return {
        referralCode: null,
        referralLink: null,
        isReferredUser: false,
        referredUsersCount: 0,
        conversionsCount: 0,
        commissionPendingUsdCents: 0,
        commissionPaidUsdCents: 0,
        commissionTotalUsdCents: 0,
        recentEarnings: [],
      };
    }

    const [referredUsersCount, conversionsCount, earnings, recentEarnings] = await Promise.all([
      prisma.user.count({ where: { referredById: user.id } }),
      prisma.paymentSubmission.count({
        where: {
          status: PaymentStatus.APPROVED,
          user: {
            referredById: user.id,
          },
        },
      }),
      prisma.referralCommission.findMany({
        where: { referrerId: user.id },
        select: {
          status: true,
          commissionUsdCents: true,
        },
      }),
      prisma.referralCommission.findMany({
        where: { referrerId: user.id },
        orderBy: [{ createdAt: "desc" }],
        take: 8,
        include: {
          referredUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          paymentSubmission: {
            select: {
              id: true,
              planSlug: true,
              status: true,
              submittedAt: true,
            },
          },
        },
      }),
    ]);

    const commissionPendingUsdCents = earnings
      .filter((item) => item.status === ReferralCommissionStatus.PENDING || item.status === ReferralCommissionStatus.APPROVED)
      .reduce((sum, item) => sum + sumCents(item.commissionUsdCents), 0);

    const commissionPaidUsdCents = earnings
      .filter((item) => item.status === ReferralCommissionStatus.PAID)
      .reduce((sum, item) => sum + sumCents(item.commissionUsdCents), 0);

    const commissionTotalUsdCents = earnings
      .filter((item) => item.status !== ReferralCommissionStatus.REVERSED)
      .reduce((sum, item) => sum + sumCents(item.commissionUsdCents), 0);

    const referralCode = user.referralCode || null;

    return {
      referralCode,
      referralLink: referralCode ? `${appBaseUrl()}/signup?ref=${encodeURIComponent(referralCode)}` : null,
      isReferredUser: Boolean(user.referredById),
      referredUsersCount,
      conversionsCount,
      commissionPendingUsdCents,
      commissionPaidUsdCents,
      commissionTotalUsdCents,
      recentEarnings: recentEarnings.map((item) => ({
        id: item.id,
        status: item.status,
        commissionUsdCents: item.commissionUsdCents,
        discountUsdCents: item.discountUsdCents,
        grossAmountUsdCents: item.grossAmountUsdCents,
        commissionPercentBps: item.commissionPercentBps,
        discountPercentBps: item.discountPercentBps,
        createdAt: item.createdAt,
        referredUser: item.referredUser,
        paymentSubmission: item.paymentSubmission,
      })),
    };
  } catch {
    return {
      referralCode: null,
      referralLink: null,
      isReferredUser: false,
      referredUsersCount: 0,
      conversionsCount: 0,
      commissionPendingUsdCents: 0,
      commissionPaidUsdCents: 0,
      commissionTotalUsdCents: 0,
      recentEarnings: [],
    };
  }
}
const getDashboardStateUncached = async (userId: string): Promise<DashboardStateView> => {
  const settings = await getPlatformSettings();
  if (!hasDatabaseConfig) {
    return noDb({
      user: {
        id: userId,
        name: "User",
        email: "user@example.com",
        tradingProfile: defaultTradingProfile(settings),
        subscription: null,
        subscriptionActive: false,
        marketEnrollments: [],
      },
      settings,
      methods: defaultPaymentMethods,
      submissions: [],
      latestSubmission: null,
      hasApprovedSubmission: false,
      brokers: defaultBrokers,
      activeBrokerAccount: null,
      preference: null,
      referral: {
        referralCode: null,
        referralLink: null,
        isReferredUser: false,
        referredUsersCount: 0,
        conversionsCount: 0,
        commissionPendingUsdCents: 0,
        commissionPaidUsdCents: 0,
        commissionTotalUsdCents: 0,
        recentEarnings: [],
      },
      notifications: [],
      licensedEaClients: [],
    });
  }

  const [user, methods, brokers, submissionsRaw, notificationsRaw, referral] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        preference: {
          select: {
            preferredBrokerId: true,
            preferredMarket: true,
            tradingGoal: true,
            experienceLevel: true,
            connectionDetails: true,
            updatedAt: true,
          },
        },
        marketEnrollments: {
          orderBy: [{ joinedAt: "asc" }],
          select: {
            market: true,
            status: true,
            planId: true,
            plan: true,
            annualPrepaySelected: true,
            annualPrepayAmountUsdCents: true,
            annualPrepayPaidAt: true,
            launchEmailSentAt: true,
            unlockedAt: true,
            joinedAt: true,
            updatedAt: true,
          },
        },
        tradingProfile: {
          select: {
            accountState: true,
            fundsState: true,
            tradeState: true,
            availableFundsUsdCents: true,
            allocatedFundsUsdCents: true,
            maxRiskPerTradeBps: true,
            dailyLossLimitBps: true,
            maxConcurrentTrades: true,
            autotradeEnabled: true,
            manualNotes: true,
            updatedAt: true,
          },
        },
        subscription: {
          include: {
            plan: true,
          },
        },
        licensedEaClients: {
          orderBy: [{ updatedAt: "desc" }],
          take: 10,
          select: {
            id: true,
            clientKey: true,
            label: true,
            active: true,
            lastSeenAt: true,
            updatedAt: true,
          },
        },
        brokerAccounts: {
          where: {
            isActive: true,
            status: BrokerAccountStatus.ACTIVE,
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 1,
          select: {
            id: true,
            brokerName: true,
            brokerServer: true,
            accountLogin: true,
            accountMode: true,
          },
        },
      },
    }),
    getActivePaymentMethods(),
    getActiveBrokers(),
    prisma.paymentSubmission.findMany({
      where: { userId },
      orderBy: [{ submittedAt: "desc" }],
      include: {
        paymentMethod: {
          select: {
            displayName: true,
            symbol: true,
            network: true,
          },
        },
      },
      take: 20,
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }],
      take: 30,
    }),
    getReferralOverview(userId),
  ]);

  const submissions = submissionsRaw.map((submission) => mapSubmission(submission));
  const subscription = user?.subscription
    ? {
        id: user.subscription.id,
        status: user.subscription.status,
        startedAt: user.subscription.startedAt,
        expiresAt: user.subscription.expiresAt,
        plan: mapPlan(user.subscription.plan),
      }
    : null;
  const subscriptionActive = isSubscriptionActive(subscription);
  const selectedPlanRecord = resolveSelectedPlanForMarket({
    selectedMarket: AutomationMarket.FOREX,
    preferredMarket: user?.preference?.preferredMarket,
    subscriptionPlan: user?.subscription?.plan,
    enrollmentPlan: user?.marketEnrollments.find((row) => row.market === AutomationMarket.FOREX)?.plan,
    subscriptionIsActive: subscriptionActive,
  });
  const selectedPlan = selectedPlanRecord ? mapPlan(selectedPlanRecord) : null;
  const selectedSubmissions = submissions.filter((row) => row.planSlug === selectedPlan?.slug);
  const activeBrokerAccount = user?.brokerAccounts[0]
    ? {
        id: user.brokerAccounts[0].id,
        brokerName: user.brokerAccounts[0].brokerName,
        brokerServer: user.brokerAccounts[0].brokerServer,
        accountLogin: user.brokerAccounts[0].accountLogin,
        accountMode: user.brokerAccounts[0].accountMode,
      }
    : null;

  return {
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          tradingProfile: user.tradingProfile ? mapTradingProfile(user.tradingProfile) : null,
          subscription,
          subscriptionActive,
          marketEnrollments: user.marketEnrollments,
        }
      : null,
    selectedPlan,
    settings,
    methods,
    submissions,
    latestSubmission: resolveLatestSubmissionForStatus(selectedSubmissions),
    hasApprovedSubmission: selectedSubmissions.some((submission) => submission.status === PaymentStatus.APPROVED),
    brokers,
    activeBrokerAccount,
    preference: user?.preference
        ? {
          preferredBrokerId: user.preference.preferredBrokerId,
          preferredMarket: user.preference.preferredMarket,
          tradingGoal: user.preference.tradingGoal,
          experienceLevel: user.preference.experienceLevel,
          connectionDetails: mapConnectionDetails(user.preference.connectionDetails),
          updatedAt: user.preference.updatedAt,
        }
      : null,
    referral,
    notifications: notificationsRaw.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      href: item.href,
      isRead: item.isRead,
      createdAt: item.createdAt,
    })),
    licensedEaClients: user?.licensedEaClients ?? [],
  };
};

const getDashboardStateCached = cache(getDashboardStateUncached);

export async function getDashboardState(userId: string): Promise<DashboardStateView> {
  return getDashboardStateCached(userId);
}

export async function getAdminPaymentSubmissions(): Promise<AdminPaymentSubmissionView[]> {
  if (!hasDatabaseConfig) {
    return [];
  }
  try {
    const submissions = await prisma.paymentSubmission.findMany({
      orderBy: [{ submittedAt: "desc" }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        paymentMethod: {
          select: {
            displayName: true,
            symbol: true,
            network: true,
          },
        },
      },
      take: 200,
    });

    return submissions.map((submission) => ({
      ...mapSubmission(submission),
      user: submission.user,
      reviewer: submission.reviewer,
    }));
  } catch {
    return [];
  }
}

export async function getAdminUserControls(): Promise<AdminUserControlView[]> {
  if (!hasDatabaseConfig) {
    return [];
  }

  const result = await getAdminUserControlsPage({
    page: 1,
    pageSize: 500,
    accountState: "ALL",
  });
  return result.rows;
}

const ADMIN_USERS_PAGE_SIZE_DEFAULT = 50;
const ADMIN_USERS_PAGE_SIZE_MAX = 500;

function normalizeAdminUsersAccountState(value: string | null | undefined): UserAccountState | "ALL" {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (!normalized || normalized === "ALL") {
    return "ALL";
  }
  if (normalized === UserAccountState.PENDING_REVIEW) {
    return UserAccountState.PENDING_REVIEW;
  }
  if (normalized === UserAccountState.LIMITED) {
    return UserAccountState.LIMITED;
  }
  if (normalized === UserAccountState.SUSPENDED) {
    return UserAccountState.SUSPENDED;
  }
  if (normalized === UserAccountState.ACTIVE) {
    return UserAccountState.ACTIVE;
  }
  if (normalized === UserAccountState.CLOSED) {
    return UserAccountState.CLOSED;
  }
  return "ALL";
}

function normalizeAdminUsersPage(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.trunc(value));
}

function normalizeAdminUsersPageSize(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return ADMIN_USERS_PAGE_SIZE_DEFAULT;
  }
  return Math.max(10, Math.min(ADMIN_USERS_PAGE_SIZE_MAX, Math.trunc(value)));
}

function buildAdminUsersBaseWhere(query: string): Prisma.UserWhereInput {
  if (!query) {
    return {};
  }
  return {
    OR: [
      {
        id: {
          contains: query,
        },
      },
      {
        name: {
          contains: query,
        },
      },
      {
        email: {
          contains: query,
        },
      },
      {
        referralCode: {
          contains: query,
        },
      },
    ],
  };
}

function buildAdminUsersWhere(input: { query: string; accountState: UserAccountState | "ALL" }): Prisma.UserWhereInput {
  const baseWhere = buildAdminUsersBaseWhere(input.query);
  if (input.accountState === "ALL") {
    return baseWhere;
  }
  return {
    AND: [baseWhere, { tradingProfile: { is: { accountState: input.accountState } } }],
  };
}

export async function getAdminUserControlsPage(input: AdminUserControlsQueryView): Promise<AdminUserControlsPageView> {
  if (!hasDatabaseConfig) {
    return {
      rows: [],
      page: 1,
      pageSize: ADMIN_USERS_PAGE_SIZE_DEFAULT,
      totalRows: 0,
      totalPages: 1,
      stateCounts: {
        ALL: 0,
        PENDING_REVIEW: 0,
        LIMITED: 0,
        SUSPENDED: 0,
      },
    };
  }

  const settings = await getPlatformSettings();
  const page = normalizeAdminUsersPage(input.page ?? 1);
  const pageSize = normalizeAdminUsersPageSize(input.pageSize ?? ADMIN_USERS_PAGE_SIZE_DEFAULT);
  const query = String(input.query || "").trim();
  const accountState = normalizeAdminUsersAccountState(input.accountState);
  const where = buildAdminUsersWhere({ query, accountState });
  const baseWhere = buildAdminUsersBaseWhere(query);

  try {
    const [totalRows, allCount, pendingCount, limitedCount, suspendedCount] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count({ where: baseWhere }),
      prisma.user.count({
        where: {
          AND: [baseWhere, { tradingProfile: { is: { accountState: UserAccountState.PENDING_REVIEW } } }],
        },
      }),
      prisma.user.count({
        where: {
          AND: [baseWhere, { tradingProfile: { is: { accountState: UserAccountState.LIMITED } } }],
        },
      }),
      prisma.user.count({
        where: {
          AND: [baseWhere, { tradingProfile: { is: { accountState: UserAccountState.SUSPENDED } } }],
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const boundedPage = Math.min(page, totalPages);
    const skip = (boundedPage - 1) * pageSize;

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: pageSize,
      include: {
        referredBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        subscription: {
          include: {
            plan: true,
          },
        },
        tradingProfile: true,
      },
    });

    if (!users.length) {
      return {
        rows: [],
        page: boundedPage,
        pageSize,
        totalRows,
        totalPages,
        stateCounts: {
          ALL: allCount,
          PENDING_REVIEW: pendingCount,
          LIMITED: limitedCount,
          SUSPENDED: suspendedCount,
        },
      };
    }

    const userIds = users.map((user) => user.id);
    const [paymentCounts, referralCounts, commissionCounts] = await Promise.all([
      prisma.paymentSubmission.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.user.groupBy({
        by: ["referredById"],
        where: {
          referredById: { in: userIds },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.referralCommission.groupBy({
        by: ["referrerId"],
        where: {
          referrerId: { in: userIds },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const paymentCountByUserId = new Map<string, number>();
    for (const row of paymentCounts) {
      paymentCountByUserId.set(row.userId, row._count._all);
    }

    const referralCountByUserId = new Map<string, number>();
    for (const row of referralCounts) {
      if (row.referredById) {
        referralCountByUserId.set(row.referredById, row._count._all);
      }
    }

    const commissionCountByUserId = new Map<string, number>();
    for (const row of commissionCounts) {
      commissionCountByUserId.set(row.referrerId, row._count._all);
    }

    const rows = users.map((user) => {
      const tradingProfile =
        user.tradingProfile && user.tradingProfile.userId === user.id
          ? mapTradingProfile(user.tradingProfile)
          : defaultTradingProfile(settings);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        referralCode: user.referralCode,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
        referredBy: user.referredBy,
        subscription: user.subscription
          ? {
              status: user.subscription.status,
              planName: user.subscription.plan.name,
              planSlug: user.subscription.plan.slug,
              expiresAt: user.subscription.expiresAt,
            }
          : null,
        tradingProfile,
        counts: {
          payments: paymentCountByUserId.get(user.id) || 0,
          referrals: referralCountByUserId.get(user.id) || 0,
          commissionsEarned: commissionCountByUserId.get(user.id) || 0,
        },
      };
    });

    return {
      rows,
      page: boundedPage,
      pageSize,
      totalRows,
      totalPages,
      stateCounts: {
        ALL: allCount,
        PENDING_REVIEW: pendingCount,
        LIMITED: limitedCount,
        SUSPENDED: suspendedCount,
      },
    };
  } catch {
    return {
      rows: [],
      page: 1,
      pageSize,
      totalRows: 0,
      totalPages: 1,
      stateCounts: {
        ALL: 0,
        PENDING_REVIEW: 0,
        LIMITED: 0,
        SUSPENDED: 0,
      },
    };
  }
}

const ADMIN_REFERRAL_COMMISSIONS_PAGE_SIZE_DEFAULT = 50;
const ADMIN_REFERRAL_COMMISSIONS_PAGE_SIZE_MAX = 200;

function normalizeAdminReferralCommissionStatus(
  value: ReferralCommissionStatus | "ALL" | string | null | undefined,
): ReferralCommissionStatus | "ALL" {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (!normalized || normalized === "ALL") {
    return "ALL";
  }
  if (normalized === ReferralCommissionStatus.PENDING) {
    return ReferralCommissionStatus.PENDING;
  }
  if (normalized === ReferralCommissionStatus.APPROVED) {
    return ReferralCommissionStatus.APPROVED;
  }
  if (normalized === ReferralCommissionStatus.PAID) {
    return ReferralCommissionStatus.PAID;
  }
  if (normalized === ReferralCommissionStatus.REVERSED) {
    return ReferralCommissionStatus.REVERSED;
  }
  return "ALL";
}

function normalizeAdminReferralCommissionPageSize(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return ADMIN_REFERRAL_COMMISSIONS_PAGE_SIZE_DEFAULT;
  }
  return Math.max(10, Math.min(ADMIN_REFERRAL_COMMISSIONS_PAGE_SIZE_MAX, Math.trunc(value)));
}

function buildAdminReferralCommissionWhere(input: {
  status: ReferralCommissionStatus | "ALL";
  partnerEmail: string;
  referredEmail: string;
  planSlug: string;
}): Prisma.ReferralCommissionWhereInput {
  const where: Prisma.ReferralCommissionWhereInput = {};

  if (input.status !== "ALL") {
    where.status = input.status;
  }

  if (input.partnerEmail) {
    where.referrer = {
      is: {
        email: {
          contains: input.partnerEmail,
        },
      },
    };
  }

  if (input.referredEmail) {
    where.referredUser = {
      is: {
        email: {
          contains: input.referredEmail,
        },
      },
    };
  }

  const normalizedPlanSlug = input.planSlug.trim().toUpperCase();
  if (normalizedPlanSlug && normalizedPlanSlug !== "ALL") {
    where.paymentSubmission = {
      is: normalizedPlanSlug === "NONE" ? { planSlug: null } : { planSlug: input.planSlug },
    };
  }

  return where;
}

function mapAdminReferralCommissionRow(
  row: Prisma.ReferralCommissionGetPayload<{
    include: {
      paymentSubmission: {
        select: {
          id: true;
          planSlug: true;
          txHash: true;
          status: true;
        };
      };
      referrer: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
      referredUser: {
        select: {
          id: true;
          name: true;
          email: true;
        };
      };
    };
  }>,
): AdminReferralCommissionView {
  return {
    id: row.id,
    status: row.status,
    commissionUsdCents: row.commissionUsdCents,
    discountUsdCents: row.discountUsdCents,
    grossAmountUsdCents: row.grossAmountUsdCents,
    createdAt: row.createdAt,
    paymentSubmission: row.paymentSubmission,
    referrer: row.referrer,
    referredUser: row.referredUser,
  };
}

export async function getAdminReferralCommissionsCursorPage(
  input: AdminReferralCommissionsCursorQueryView,
): Promise<AdminReferralCommissionsCursorPageView> {
  if (!hasDatabaseConfig) {
    return {
      rows: [],
      nextCursor: null,
      pageSize: ADMIN_REFERRAL_COMMISSIONS_PAGE_SIZE_DEFAULT,
      totalRows: 0,
    };
  }

  const pageSize = normalizeAdminReferralCommissionPageSize(input.pageSize);
  const status = normalizeAdminReferralCommissionStatus(input.status);
  const partnerEmail = String(input.partnerEmail || "").trim();
  const referredEmail = String(input.referredEmail || "").trim();
  const planSlug = String(input.planSlug || "").trim();
  const cursor = String(input.cursor || "").trim();
  const where = buildAdminReferralCommissionWhere({
    status,
    partnerEmail,
    referredEmail,
    planSlug,
  });

  try {
    const [totalRows, rowsRaw] = await Promise.all([
      prisma.referralCommission.count({ where }),
      prisma.referralCommission.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(cursor
          ? {
              cursor: { id: cursor },
              skip: 1,
            }
          : {}),
        take: pageSize + 1,
        include: {
          paymentSubmission: {
            select: {
              id: true,
              planSlug: true,
              txHash: true,
              status: true,
            },
          },
          referrer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          referredUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const hasNext = rowsRaw.length > pageSize;
    const rows = (hasNext ? rowsRaw.slice(0, pageSize) : rowsRaw).map(mapAdminReferralCommissionRow);

    return {
      rows,
      nextCursor: hasNext && rows.length ? rows[rows.length - 1].id : null,
      pageSize,
      totalRows,
    };
  } catch {
    return {
      rows: [],
      nextCursor: null,
      pageSize,
      totalRows: 0,
    };
  }
}

export async function getAdminReferralCommissionPlanOptions(): Promise<string[]> {
  if (!hasDatabaseConfig) {
    return [];
  }
  try {
    const rows = await prisma.paymentSubmission.groupBy({
      by: ["planSlug"],
      where: {
        commission: {
          isNot: null,
        },
      },
      orderBy: [{ planSlug: "asc" }],
    });
    return rows.map((row) => row.planSlug || "NONE");
  } catch {
    return [];
  }
}

export async function getAdminReferralCommissions(): Promise<AdminReferralCommissionView[]> {
  const page = await getAdminReferralCommissionsCursorPage({
    pageSize: 200,
  });
  return page.rows;
}

export async function getUserSupportTickets(userId: string): Promise<SupportTicketView[]> {
  if (!hasDatabaseConfig) {
    return [];
  }
  try {
    const rows = await prisma.supportTicket.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return rows;
  } catch {
    return [];
  }
}

export async function getAdminSupportTickets(): Promise<SupportTicketView[]> {
  if (!hasDatabaseConfig) {
    return [];
  }
  try {
    const rows = await prisma.supportTicket.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      take: 300,
    });
    return rows;
  } catch {
    return [];
  }
}
