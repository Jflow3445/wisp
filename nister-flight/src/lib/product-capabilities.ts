export type ProductReleaseStatus =
  | "live"
  | "staged-rollout"
  | "waitlist"
  | "manual-operations"
  | "internal-service"
  | "not-offered";

export type ProductClaimClassification =
  | "Accurate"
  | "Accurate but incomplete"
  | "Ambiguous"
  | "Outdated"
  | "Exaggerated"
  | "Available only to some users"
  | "Available only in some environments"
  | "Partially implemented"
  | "Planned but not implemented"
  | "Technically present but unusable"
  | "Incorrect"
  | "Potentially deceptive"
  | "Unsupported by evidence";

export type ProductClaimSeverity = "Critical" | "High" | "Medium" | "Low";

export type ProductCapability = {
  id: string;
  publicName: string;
  description: string;
  availabilityStatus: string;
  eligiblePlans: string[];
  eligibleRoles: string[];
  supportedPlatforms: string[];
  supportedRegions: string[];
  usageLimits: string[];
  featureFlagState: string;
  documentationLink: string;
  releaseStatus: ProductReleaseStatus;
  frontendEvidence: string[];
  backendEvidence: string[];
  limitations: string[];
};

export type ProductPlanRegistryItem = {
  tier: "BASIC" | "PRO_MANAGED";
  slug: string;
  productKind: ProductPlanKind;
  publicName: string;
  subtitle: string;
  monthlyPriceCents: number;
  automationMarket: "FOREX";
  executionMode: "LOCAL" | "MANAGED";
  runtimeResponsibility: "customer" | "nister-managed";
  badge: string | null;
  ctaLabel: string;
  ctaHref: string;
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
  includedCapabilities: string[];
  requiredRole: "MEMBER";
  publicLimitations: string[];
  frontendEvidence: string[];
  backendEvidence: string[];
};

export type ProductPlanKind = "LOCAL_RUNTIME" | "MANAGED_FUNDS";

export function productKindForPlan(input: {
  tier?: string | null;
  slug?: string | null;
  name?: string | null;
}): ProductPlanKind {
  const tier = String(input.tier || "").trim().toUpperCase();
  if (tier === "BASIC") return "LOCAL_RUNTIME";
  if (tier === "PRO_MANAGED") return "MANAGED_FUNDS";
  const slug = String(input.slug || "").trim().toLowerCase();
  const name = String(input.name || "").trim().toLowerCase();
  if (
    tier === "PRO_MANAGED" ||
    slug === "managed-funds" ||
    slug === "pro-managed" ||
    /\bmanaged\s+funds\b/.test(name)
  ) {
    return "MANAGED_FUNDS";
  }
  return "LOCAL_RUNTIME";
}

export function planRequiresBrokerRuntimeSetup(input: {
  tier?: string | null;
  slug?: string | null;
  name?: string | null;
}) {
  return productKindForPlan(input) === "LOCAL_RUNTIME";
}

export type ProductClaim = {
  claimId: string;
  exactPublicClaim: string;
  sourcePageOrMessage: string;
  intendedUser: string;
  advertisedCapability: string;
  actualCapability: string;
  capabilityIds: string[];
  requiredSubscription: string;
  requiredRole: string;
  requiredGeography: string;
  frontendEvidence: string[];
  backendEvidence: string[];
  testResult: string;
  classification: ProductClaimClassification;
  severity: ProductClaimSeverity;
  correctiveAction: string;
  responsibleComponent: string;
  deploymentStatus: "ready-for-deploy" | "corrected-in-branch" | "documented-limitation" | "not-public";
};

export const PRODUCT_CLAIM_SOURCE_GLOBS = [
  "src/app/**/page.tsx",
  "src/app/**/route.ts",
  "src/components/site/**/*.tsx",
  "src/components/dashboard/**/*.tsx",
  "src/components/admin/**/*.tsx",
  "src/lib/seo.ts",
  "src/lib/email-template.ts",
  "prisma/seed.ts",
  "docs/**/*.md",
] as const;

export const PRODUCT_CAPABILITY_REGISTRY: ProductCapability[] = [
  {
    id: "forex-signal-gated-automation",
    publicName: "Signal-gated Forex automation",
    description:
      "Forex execution is eligible only after account setup, subscription, broker connection, saved risk policy, runtime connection, and a strategy signal are valid.",
    availabilityStatus: "Forex is the live/default market when platform settings keep marketForexEnabled true.",
    eligiblePlans: ["BASIC", "PRO_MANAGED"],
    eligibleRoles: ["MEMBER"],
    supportedPlatforms: ["Web dashboard", "Nister AI App runtime", "MetaTrader environment"],
    supportedRegions: ["Subject to broker, payment, legal, and sanctions restrictions"],
    usageLimits: ["One broker account and one terminal per default plan"],
    featureFlagState: "platformSetting.marketForexEnabled",
    documentationLink: "/forex-ai-trading-automation",
    releaseStatus: "live",
    frontendEvidence: [
      "src/app/forex-ai-trading-automation/page.tsx",
      "src/components/site/nister-ai-home.tsx",
      "src/app/app/onboarding/review/page.tsx",
    ],
    backendEvidence: [
      "src/app/api/internal/v1/ai/actions/route.ts",
      "src/app/api/v1/runtime/commands/route.ts",
      "src/lib/execution-access.ts",
      "src/app/actions/control-plane.ts",
    ],
    limitations: [
      "Not a promise of trade frequency or outcomes",
      "Depends on broker behavior, runtime connection, and risk settings",
      "Users cannot manually edit strategy selection per trade",
    ],
  },
  {
    id: "stocks-automation-rollout",
    publicName: "Stocks automation (not offered)",
    description: "Retired public offering. Only Forex is available; historical records are retained.",
    availabilityStatus: "Not offered",
    eligiblePlans: [], eligibleRoles: [], supportedPlatforms: [], supportedRegions: [],
    usageLimits: ["No new subscriptions, enrollment, or prepayment"],
    featureFlagState: "Disabled in code regardless of stored settings",
    documentationLink: "/forex-ai-trading-automation",
    releaseStatus: "not-offered",
    frontendEvidence: ["src/app/signup/page.tsx", "next.config.ts"],
    backendEvidence: ["src/lib/market-access.ts", "src/app/actions/auth.ts"],
    limitations: ["Legacy records do not grant current market access"],
  },
  {
    id: "options-automation-rollout",
    publicName: "Options automation (not offered)",
    description: "Retired public offering. Only Forex is available; historical records are retained.",
    availabilityStatus: "Not offered",
    eligiblePlans: [], eligibleRoles: [], supportedPlatforms: [], supportedRegions: [],
    usageLimits: ["No new subscriptions, enrollment, or prepayment"],
    featureFlagState: "Disabled in code regardless of stored settings",
    documentationLink: "/forex-ai-trading-automation",
    releaseStatus: "not-offered",
    frontendEvidence: ["src/app/signup/page.tsx", "next.config.ts"],
    backendEvidence: ["src/lib/market-access.ts", "src/app/actions/auth.ts"],
    limitations: ["Legacy records do not grant current market access"],
  },
  {
    id: "local-runtime",
    publicName: "Local runtime",
    description:
      "The customer runs the runtime on their own device and connection while Nister AI gates eligible commands through account, risk, and subscription checks.",
    availabilityStatus: "Live for eligible Forex members",
    eligiblePlans: ["BASIC"],
    eligibleRoles: ["MEMBER"],
    supportedPlatforms: ["Windows desktop runtime", "MetaTrader environment", "Web dashboard"],
    supportedRegions: ["Subject to broker, payment, legal, and sanctions restrictions"],
    usageLimits: ["One account and one terminal by default"],
    featureFlagState: "pricingPlan.executionMode=LOCAL",
    documentationLink: "/starter-vs-managed-funds",
    releaseStatus: "live",
    frontendEvidence: ["src/app/pricing/page.tsx", "src/app/guide/page.tsx"],
    backendEvidence: ["prisma/schema.prisma PricingPlan.executionMode", "src/lib/site.ts defaultPlans"],
    limitations: ["Customer is responsible for device, power, updates, and internet continuity"],
  },
  {
    id: "managed-funds-service",
    publicName: "Managed Funds service",
    description:
      "Managed Funds is a managed-capital service path where customer capital is pooled or allocated for Nister AI trading operations, and monthly profit distributions are handled through managed-fund operations when profits are available.",
    availabilityStatus: "Manual operations for eligible Managed Funds members",
    eligiblePlans: ["PRO_MANAGED"],
    eligibleRoles: ["MEMBER", "ADMIN"],
    supportedPlatforms: ["Web dashboard", "Admin payment review", "Support operations"],
    supportedRegions: ["Subject to payment, legal, broker, custody, and sanctions restrictions"],
    usageLimits: ["Managed Funds users do not connect a personal broker runtime for this plan"],
    featureFlagState: "pricingPlan.tier=PRO_MANAGED",
    documentationLink: "/pricing",
    releaseStatus: "manual-operations",
    frontendEvidence: ["src/app/pricing/page.tsx", "src/app/app/onboarding/choose-plan/page.tsx", "src/app/admin/plans/page.tsx"],
    backendEvidence: ["prisma/schema.prisma PricingPlan", "src/app/actions/onboarding.ts", "src/lib/onboarding.ts"],
    limitations: [
      "Monthly profits are not guaranteed and trading losses can reduce managed capital",
      "Managed Funds requires operational review, payment verification, and applicable legal eligibility",
      "This plan is not a personal broker-runtime setup and should not collect broker terminal credentials",
    ],
  },
  {
    id: "risk-controls",
    publicName: "Risk controls",
    description:
      "Members can set risk per trade, daily loss limit, and concurrent trade limits; backend execution gates reject commands that exceed active policy.",
    availabilityStatus: "Live for eligible Forex members",
    eligiblePlans: ["BASIC", "PRO_MANAGED"],
    eligibleRoles: ["MEMBER", "ADMIN"],
    supportedPlatforms: ["Web dashboard", "Onboarding", "Runtime API"],
    supportedRegions: ["Subject to broker, payment, legal, and sanctions restrictions"],
    usageLimits: ["Default settings: 2% risk per trade, 6% daily loss cap, 3 concurrent trades"],
    featureFlagState: "Always available to eligible active subscriptions",
    documentationLink: "/trading-automation-risk-controls",
    releaseStatus: "live",
    frontendEvidence: ["src/app/dashboard/risk-controls/page.tsx", "src/app/app/onboarding/risk-settings/page.tsx"],
    backendEvidence: ["src/lib/execution-access.ts", "src/app/actions/control-plane.ts", "prisma/schema.prisma UserPolicy"],
    limitations: ["Risk controls reduce exposure but cannot prevent all losses or broker-side execution differences"],
  },
  {
    id: "broker-funds-self-custody",
    publicName: "Broker-account fund custody",
    description:
      "Trading capital remains in the user's broker account; Nister AI subscription billing is separate from broker deposits and trading capital.",
    availabilityStatus: "Current service model for the Starter local-runtime plan",
    eligiblePlans: ["BASIC"],
    eligibleRoles: ["MEMBER"],
    supportedPlatforms: ["Public pages", "Dashboard", "Terms", "Risk disclosure"],
    supportedRegions: ["Subject to broker, payment, legal, and sanctions restrictions"],
    usageLimits: ["Nister AI records broker account metadata but does not hold broker trading balances"],
    featureFlagState: "Service policy",
    documentationLink: "/risk-disclosure",
    releaseStatus: "live",
    frontendEvidence: ["src/app/pricing/page.tsx", "src/app/terms/page.tsx", "src/app/risk-disclosure/page.tsx"],
    backendEvidence: ["prisma/schema.prisma BrokerAccount", "prisma/schema.prisma PaymentSubmission"],
    limitations: ["Users remain responsible for broker account funding, monitoring, and broker terms"],
  },
  {
    id: "subscription-billing",
    publicName: "Subscription billing",
    description:
      "Subscription access is represented by pricing plans, payment submissions, wallet credit, and subscription lifecycle enforcement.",
    availabilityStatus: "Live",
    eligiblePlans: ["BASIC", "PRO_MANAGED"],
    eligibleRoles: ["MEMBER", "ADMIN"],
    supportedPlatforms: ["Pricing page", "Onboarding checkout", "Dashboard billing", "Admin payments"],
    supportedRegions: ["Subject to payment, legal, and sanctions restrictions"],
    usageLimits: ["Default payment submission cooldowns and daily submission limits apply"],
    featureFlagState: "platformSetting.requireActiveSubscription",
    documentationLink: "/pricing",
    releaseStatus: "live",
    frontendEvidence: ["src/app/pricing/page.tsx", "src/app/dashboard/billing/page.tsx"],
    backendEvidence: ["src/lib/subscription-lifecycle.ts", "src/app/actions/onboarding.ts", "src/app/actions/dashboard.ts"],
    limitations: ["Billing approval can be delayed by manual review, payment network errors, or incorrect transfer details"],
  },
  {
    id: "usdt-trc20-billing",
    publicName: "USDT-TRC20 billing",
    description:
      "Checkout can generate USDT-TRC20 invoices and requires exact amount, network, sender wallet, and transaction hash submission for review.",
    availabilityStatus: "Live when payment method and Tron configuration are active",
    eligiblePlans: ["BASIC", "PRO_MANAGED"],
    eligibleRoles: ["MEMBER", "ADMIN"],
    supportedPlatforms: ["Onboarding checkout", "Dashboard billing", "Admin payments"],
    supportedRegions: ["Subject to payment, legal, and sanctions restrictions"],
    usageLimits: ["Invoice TTL, grace period, offset slots, cooldown, and review controls apply"],
    featureFlagState: "active PaymentMethod and TRON_* configuration",
    documentationLink: "/pricing",
    releaseStatus: "live",
    frontendEvidence: ["src/app/dashboard/billing/page.tsx", "src/app/app/onboarding/checkout/page.tsx"],
    backendEvidence: ["src/lib/tron-payments.ts", "src/app/api/payments/create-invoice/route.ts", "src/app/api/payments/submit-tx/route.ts"],
    limitations: ["Only USDT-TRC20 is supported in the current payment flow"],
  },
  {
    id: "support-ticketing",
    publicName: "Authenticated support tickets",
    description:
      "Authenticated members can create and review support tickets from the dashboard; public contact pages route sales/setup questions without creating guest support tickets.",
    availabilityStatus: "Live",
    eligiblePlans: ["BASIC", "PRO_MANAGED", "No paid plan required for authenticated account support"],
    eligibleRoles: ["MEMBER", "ADMIN"],
    supportedPlatforms: ["Dashboard support", "Admin support", "Email notifications"],
    supportedRegions: ["English support; response time not guaranteed"],
    usageLimits: ["Support is operationally reviewed and not instant"],
    featureFlagState: "Always available to authenticated users",
    documentationLink: "/contact",
    releaseStatus: "live",
    frontendEvidence: ["src/app/dashboard/support/page.tsx", "src/app/admin/support/page.tsx", "src/app/contact/page.tsx"],
    backendEvidence: ["src/app/actions/support.ts", "prisma/schema.prisma SupportTicket", "src/lib/email-template.ts"],
    limitations: ["No guaranteed response time is advertised"],
  },
  {
    id: "nister-ai-app-runtime",
    publicName: "Nister AI App runtime",
    description:
      "The runtime authenticates, registers, sends heartbeats, receives commands, and reports execution/position state through protected API routes.",
    availabilityStatus: "Live for eligible Forex runtime setup",
    eligiblePlans: ["BASIC", "PRO_MANAGED"],
    eligibleRoles: ["MEMBER", "RUNTIME"],
    supportedPlatforms: ["Windows desktop runtime", "MetaTrader environment", "Web dashboard"],
    supportedRegions: ["Subject to broker, runtime, payment, legal, and sanctions restrictions"],
    usageLimits: ["Runtime tokens, heartbeats, and broker account assignment are required"],
    featureFlagState: "Forex onboarding requires runtime connection",
    documentationLink: "/companion-app-automation",
    releaseStatus: "live",
    frontendEvidence: ["src/app/companion-app-automation/page.tsx", "src/app/dashboard/connect-app/page.tsx"],
    backendEvidence: [
      "src/app/api/v1/companion/auth/login/route.ts",
      "src/app/api/v1/runtime/register/route.ts",
      "src/app/api/v1/runtime/heartbeat/route.ts",
      "src/app/api/v1/runtime/commands/route.ts",
    ],
    limitations: ["Starting the runtime does not force a trade", "Download availability depends on an active release record"],
  },
  {
    id: "dashboard-monitoring",
    publicName: "Dashboard monitoring",
    description:
      "Members can review status, positions, connection state, commands, activity, alerts, billing, support, and risk controls from protected dashboard pages.",
    availabilityStatus: "Live for authenticated members",
    eligiblePlans: ["BASIC", "PRO_MANAGED", "Some onboarding pages available before paid activation"],
    eligibleRoles: ["MEMBER"],
    supportedPlatforms: ["Web dashboard"],
    supportedRegions: ["Subject to account eligibility and legal restrictions"],
    usageLimits: ["Dashboard telemetry can be delayed or incomplete; broker records remain source of truth"],
    featureFlagState: "Protected member routes",
    documentationLink: "/dashboard",
    releaseStatus: "live",
    frontendEvidence: ["src/app/dashboard/page.tsx", "src/components/dashboard/sidebar-nav.tsx"],
    backendEvidence: ["src/lib/dashboard-view.ts", "src/lib/site.ts getDashboardState", "src/proxy.ts protected routes"],
    limitations: ["Dashboard visibility is monitoring, not a guarantee of execution accuracy or outcome"],
  },
  {
    id: "admin-payment-review",
    publicName: "Admin payment review",
    description:
      "Admins can review payment submissions and approval state; activation depends on confirmed billing state and subscription lifecycle rules.",
    availabilityStatus: "Live for admins",
    eligiblePlans: ["BASIC", "PRO_MANAGED"],
    eligibleRoles: ["ADMIN"],
    supportedPlatforms: ["Admin payments", "Admin plans", "Internal payment watcher"],
    supportedRegions: ["Subject to payment, legal, and sanctions restrictions"],
    usageLimits: ["Manual review can delay activation"],
    featureFlagState: "Protected admin routes",
    documentationLink: "/admin/payments",
    releaseStatus: "live",
    frontendEvidence: ["src/app/admin/payments/page.tsx", "src/app/admin/plans/page.tsx"],
    backendEvidence: ["src/lib/admin-payment-review.ts", "src/app/api/internal/v1/payments/watch/route.ts"],
    limitations: ["Review is not instant and may reject incorrect token, network, amount, or hash submissions"],
  },
  {
    id: "agent-api",
    publicName: "Internal AI/agent command API",
    description:
      "AI actions are accepted through internal service endpoints with HMAC signatures, model allowlist checks, audit logs, and command authorization gates.",
    availabilityStatus: "Internal service only",
    eligiblePlans: ["BASIC", "PRO_MANAGED"],
    eligibleRoles: ["SERVICE", "ADMIN"],
    supportedPlatforms: ["Internal service API", "Runtime API", "Admin audit"],
    supportedRegions: ["Not a public customer API"],
    usageLimits: ["Requires internal credentials, model allowlist, broker assignment, active subscription, and execution policy"],
    featureFlagState: "INTERNAL_CONTROL_PLANE_SECRET and AI service credentials",
    documentationLink: "docs/control-plane-phase1.md",
    releaseStatus: "internal-service",
    frontendEvidence: ["src/app/admin/ai-actions/page.tsx", "src/app/admin/audit/page.tsx"],
    backendEvidence: ["src/app/api/internal/v1/ai/actions/route.ts", "src/lib/internal-control-plane-auth.ts"],
    limitations: ["Not a public API product and not available to ordinary users"],
  },
  {
    id: "native-mobile-app",
    publicName: "Native mobile app",
    description:
      "No native Android or iOS application is advertised as currently available; current product surfaces are web dashboard and runtime tooling.",
    availabilityStatus: "Not offered",
    eligiblePlans: [],
    eligibleRoles: [],
    supportedPlatforms: ["Not applicable"],
    supportedRegions: ["Not applicable"],
    usageLimits: ["Not applicable"],
    featureFlagState: "No native mobile release configured",
    documentationLink: "/guide",
    releaseStatus: "not-offered",
    frontendEvidence: ["src/lib/seo.ts", "src/app/guide/page.tsx"],
    backendEvidence: ["No mobile-store integration routes in route inventory"],
    limitations: ["Do not describe the Nister AI App as Android or iOS unless a store release exists"],
  },
];

export const PRODUCT_PLAN_REGISTRY: ProductPlanRegistryItem[] = [
  {
    tier: "BASIC",
    slug: "starter",
    productKind: "LOCAL_RUNTIME",
    publicName: "Starter",
    subtitle: "Local Forex execution for users running Nister AI through their own broker account and environment",
    monthlyPriceCents: 99999,
    automationMarket: "FOREX",
    executionMode: "LOCAL",
    runtimeResponsibility: "customer",
    badge: null,
    ctaLabel: "Select Starter",
    ctaHref: "/signup",
    maxAccounts: 1,
    maxTerminals: 1,
    mt5SetupIncluded: false,
    companionDeploymentIncluded: false,
    advancedMonitoring: false,
    autoRecovery: false,
    prioritySupport: false,
    uptimeFocusedOperation: false,
    highlight: false,
    features: [
      "Full Autonomous Forex Ai",
      "Execution through your own broker account",
      "Runs on your own computer, internet, and terminal",
      "One broker account",
      "One runtime terminal",
      "Risk controls",
      "Dashboard monitoring",
      "Support",
    ],
    sortOrder: 1,
    active: true,
    includedCapabilities: [
      "forex-signal-gated-automation",
      "local-runtime",
      "risk-controls",
      "broker-funds-self-custody",
      "subscription-billing",
      "usdt-trc20-billing",
      "support-ticketing",
      "nister-ai-app-runtime",
      "dashboard-monitoring",
    ],
    requiredRole: "MEMBER",
    publicLimitations: [
      "Customer must keep their own device, power, internet, and MetaTrader environment stable",
      "No uptime, trade frequency, or profit guarantee",
    ],
    frontendEvidence: ["src/app/pricing/page.tsx", "src/lib/site.ts defaultPlans"],
    backendEvidence: ["prisma/schema.prisma PricingPlan", "src/lib/execution-access.ts"],
  },
  {
    tier: "PRO_MANAGED",
    slug: "managed-funds",
    productKind: "MANAGED_FUNDS",
    publicName: "Managed Funds",
    subtitle: "Managed Forex fund service where Nister AI trades pooled managed capital and monthly profits are paid out when available",
    monthlyPriceCents: 5999,
    automationMarket: "FOREX",
    executionMode: "MANAGED",
    runtimeResponsibility: "nister-managed",
    badge: "Managed Funds",
    ctaLabel: "Select Managed Funds",
    ctaHref: "/signup",
    maxAccounts: 1,
    maxTerminals: 1,
    mt5SetupIncluded: false,
    companionDeploymentIncluded: false,
    advancedMonitoring: true,
    autoRecovery: false,
    prioritySupport: true,
    uptimeFocusedOperation: false,
    highlight: true,
    features: [
      "Managed Forex fund service",
      "Nister AI trades pooled managed capital",
      "Monthly profit payout process when profits are available",
      "No personal broker runtime setup",
      "No Nister AI App installation required for this plan",
      "Dashboard billing and support access",
      "Admin-reviewed operations",
      "Trading losses remain possible",
    ],
    sortOrder: 2,
    active: true,
    includedCapabilities: [
      "managed-funds-service",
      "subscription-billing",
      "usdt-trc20-billing",
      "support-ticketing",
      "dashboard-monitoring",
    ],
    requiredRole: "MEMBER",
    publicLimitations: [
      "Managed Funds is a managed-capital service and is not executed through the user's own broker account",
      "Monthly profit payouts are possible only when the managed fund produces distributable profit",
      "Trading losses can reduce managed capital and no profit or payout is guaranteed",
    ],
    frontendEvidence: ["src/app/pricing/page.tsx", "src/lib/site.ts defaultPlans"],
    backendEvidence: ["prisma/schema.prisma PricingPlan", "src/app/actions/onboarding.ts"],
  },
];

const capabilityById = new Map(PRODUCT_CAPABILITY_REGISTRY.map((capability) => [capability.id, capability]));

function evidenceFor(capabilityIds: string[], type: "frontendEvidence" | "backendEvidence") {
  return Array.from(
    new Set(
      capabilityIds.flatMap((id) => {
        const capability = capabilityById.get(id);
        return capability ? capability[type] : [];
      }),
    ),
  );
}

function claim(input: Omit<ProductClaim, "frontendEvidence" | "backendEvidence"> & Partial<Pick<ProductClaim, "frontendEvidence" | "backendEvidence">>): ProductClaim {
  return {
    ...input,
    frontendEvidence: input.frontendEvidence ?? evidenceFor(input.capabilityIds, "frontendEvidence"),
    backendEvidence: input.backendEvidence ?? evidenceFor(input.capabilityIds, "backendEvidence"),
  };
}

export const PRODUCT_CLAIMS: ProductClaim[] = [
  claim({
    claimId: "PC-001",
    exactPublicClaim: "Signal-gated Forex automation through a user-owned broker account.",
    sourcePageOrMessage: "/",
    intendedUser: "Prospective trader",
    advertisedCapability: "Starter AI Forex automation through the user's own broker account.",
    actualCapability:
      "Fixed strategy, signal-gated execution through runtime and internal AI action APIs when setup, risk, subscription, broker, and activation gates pass.",
    capabilityIds: ["forex-signal-gated-automation", "broker-funds-self-custody", "risk-controls"],
    requiredSubscription: "Starter active subscription",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Covered by route crawl, live page audit, execution-access tests, and control-plane API tests.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Keep public wording tied to signal-gated Forex and broker self-custody.",
    responsibleComponent: "Marketing pages and execution access",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-002",
    exactPublicClaim: "Users and admins cannot manually choose trades or alter the fixed strategy per trade.",
    sourcePageOrMessage: "/faq",
    intendedUser: "Prospective trader",
    advertisedCapability: "Fixed AI strategy logic with user-configurable risk boundaries only.",
    actualCapability:
      "The public UI exposes risk settings, not strategy selection; backend command flow uses model/action authorization and risk gates.",
    capabilityIds: ["forex-signal-gated-automation", "risk-controls", "agent-api"],
    requiredSubscription: "Starter active subscription for own-broker live execution",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Covered by route crawl, live page audit, and execution-access unit tests.",
    classification: "Accurate",
    severity: "Medium",
    correctiveAction: "Retain limitation in FAQ, guide, and homepage copy.",
    responsibleComponent: "Marketing pages and control plane",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-003",
    exactPublicClaim: "Starter trading funds stay in your broker account; Nister AI subscription billing is separate.",
    sourcePageOrMessage: "/pricing",
    intendedUser: "Prospective trader",
    advertisedCapability: "Non-custodial broker-account trading structure.",
    actualCapability:
      "The schema stores broker metadata and payment records separately; there is no trading-capital custody ledger in Nister AI.",
    capabilityIds: ["broker-funds-self-custody", "subscription-billing"],
    requiredSubscription: "Starter plan",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Covered by pricing page test, risk disclosure, terms, and schema review.",
    classification: "Accurate",
    severity: "Critical",
    correctiveAction: "Keep custody limitation visible on pricing, terms, and risk disclosure.",
    responsibleComponent: "Billing, broker account, legal pages",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-004",
    exactPublicClaim: "Choose Starter or Managed Funds based on whether you want local own-broker execution or managed-capital service.",
    sourcePageOrMessage: "/pricing",
    intendedUser: "Prospective trader",
    advertisedCapability: "Two Forex service paths with the same AI core and different fund/runtime responsibilities.",
    actualCapability:
      "Starter maps to local own-broker runtime setup. Managed Funds maps to managed-capital operations and does not require broker runtime setup from the user.",
    capabilityIds: ["local-runtime", "managed-funds-service"],
    requiredSubscription: "Starter for local own-broker execution; Managed Funds for managed-capital service",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, custody, and sanctions restrictions",
    testResult: "Covered by product-claims registry tests, pricing source scan, and onboarding route tests.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Keep Starter and Managed Funds copy separated across pricing, onboarding, and dashboard surfaces.",
    responsibleComponent: "Pricing and dashboard connection flows",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-005",
    exactPublicClaim: "Starter is $999.99/month and Managed Funds is $59.99/month.",
    sourcePageOrMessage: "/pricing",
    intendedUser: "Prospective buyer",
    advertisedCapability: "Displayed subscription prices.",
    actualCapability:
      "Default pricing and product plan registry define Starter at 99999 cents and Managed Funds at 5999 cents monthly.",
    capabilityIds: ["subscription-billing"],
    requiredSubscription: "Selected plan",
    requiredRole: "MEMBER",
    requiredGeography: "Payment availability and legal restrictions apply",
    testResult: "Covered by product-claims seed pricing test and pricing page rendering defaults.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Keep seed, fallback pricing, pricing page, and checkout plan configuration aligned.",
    responsibleComponent: "Pricing and seed data",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-006",
    exactPublicClaim: "Retired Pro Managed pricing was superseded by Managed Funds.",
    sourcePageOrMessage: "prisma/seed.ts",
    intendedUser: "Prospective buyer and admin configuring pricing",
    advertisedCapability: "Seeded managed plan price.",
    actualCapability: "The authoritative Managed Funds price for this release is $59.99/month.",
    capabilityIds: ["subscription-billing"],
    requiredSubscription: "Managed Funds",
    requiredRole: "MEMBER",
    requiredGeography: "Payment availability and legal restrictions apply",
    testResult: "Product-claims test asserts seed price matches the product plan registry.",
    classification: "Outdated",
    severity: "High",
    correctiveAction: "Corrected the managed plan to Managed Funds at 5999 cents.",
    responsibleComponent: "Pricing seed data",
    deploymentStatus: "corrected-in-branch",
  }),
  claim({
    claimId: "PC-007",
    exactPublicClaim: "Retired hosted runtime service was superseded by Managed Funds.",
    sourcePageOrMessage: "prisma/seed.ts and homepage runtime copy",
    intendedUser: "Prospective buyer",
    advertisedCapability: "Uninterrupted managed hosting availability.",
    actualCapability:
      "Managed Funds is the current managed-capital service path; hosted runtime marketing has been retired.",
    capabilityIds: ["managed-funds-service"],
    requiredSubscription: "Managed Funds",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, cloud, and sanctions restrictions",
    testResult: "Product-claims source scan rejects unsupported 24/7 public claims.",
    classification: "Exaggerated",
    severity: "High",
    correctiveAction: "Removed hosted runtime wording and replaced it with Managed Funds service language.",
    responsibleComponent: "Pricing seed data and homepage copy",
    deploymentStatus: "corrected-in-branch",
  }),
  claim({
    claimId: "PC-008",
    exactPublicClaim: "Setup follows account, email verification, plan, broker, risk, billing, app connection, and review gates.",
    sourcePageOrMessage: "/guide",
    intendedUser: "Prospective trader and new member",
    advertisedCapability: "Guided onboarding sequence.",
    actualCapability: "Onboarding route resolution and server actions enforce the sequence before activation.",
    capabilityIds: ["forex-signal-gated-automation", "risk-controls", "subscription-billing", "nister-ai-app-runtime"],
    requiredSubscription: "Plan selection and confirmed billing before runtime activation",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Covered by onboarding route resolution tests and live member page audit.",
    classification: "Accurate",
    severity: "Medium",
    correctiveAction: "Keep guide aligned to onboardingRoutes order.",
    responsibleComponent: "Onboarding",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-009",
    exactPublicClaim: "Forex is live/default; Stocks and Options are staged rollout or waitlist unless enabled.",
    sourcePageOrMessage: "/faq",
    intendedUser: "Prospective trader",
    advertisedCapability: "Market availability by platform setting.",
    actualCapability: "Only signal-gated Forex is offered. Backend authorization rejects non-Forex enrollment and payment; retired pages redirect and stored flags cannot enable them.",
    capabilityIds: ["forex-signal-gated-automation", "stocks-automation-rollout", "options-automation-rollout"],
    requiredSubscription: "Market-specific plan or waitlist enrollment",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Verified by Forex-only public route and subscription invoice regression tests.",
    classification: "Outdated",
    severity: "High",
    correctiveAction: "Removed this offering and its signup links; retain this entry as historical audit evidence.",
    responsibleComponent: "Market access and public pages",
    deploymentStatus: "corrected-in-branch",
  }),
  claim({
    claimId: "PC-010",
    exactPublicClaim: "Contact support before subscribing for setup, pricing, runtime, and billing questions.",
    sourcePageOrMessage: "/contact",
    intendedUser: "Prospective trader",
    advertisedCapability: "Pre-subscription contact and authenticated support.",
    actualCapability:
      "Public contact routes users to sales/support links; authenticated dashboard support creates server-side tickets linked to the user account.",
    capabilityIds: ["support-ticketing"],
    requiredSubscription: "No paid plan required for public contact; account required for support tickets",
    requiredRole: "none for public contact; MEMBER for support tickets",
    requiredGeography: "English support; legal restrictions apply",
    testResult: "Covered by support access-control tests and public contact page tests.",
    classification: "Accurate but incomplete",
    severity: "Medium",
    correctiveAction: "Avoid promising instant response or public guest ticket creation.",
    responsibleComponent: "Contact and support",
    deploymentStatus: "documented-limitation",
  }),
  claim({
    claimId: "PC-011",
    exactPublicClaim: "Run signal-gated Forex Trading through your own broker account.",
    sourcePageOrMessage: "/forex-ai-trading-automation",
    intendedUser: "Forex trader",
    advertisedCapability: "Forex execution workflow.",
    actualCapability: "Forex path is the live/default market and uses runtime/API gates before commands are eligible.",
    capabilityIds: ["forex-signal-gated-automation"],
    requiredSubscription: "Starter or Managed Funds active subscription",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Covered by route crawl and live public page audit.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Keep no-profit and broker-custody disclosures adjacent.",
    responsibleComponent: "Forex marketing page and execution API",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-012",
    exactPublicClaim: "Join the Nister AI stock automation rollout.",
    sourcePageOrMessage: "/stocks-ai-trading-automation",
    intendedUser: "Stocks trader",
    advertisedCapability: "Stock automation market access.",
    actualCapability: "Only signal-gated Forex is offered. Backend authorization rejects non-Forex enrollment and payment; retired pages redirect and stored flags cannot enable them.",
    capabilityIds: ["stocks-automation-rollout"],
    requiredSubscription: "Waitlist/prepay until market enabled; then eligible active plan",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, market, payment, legal, and sanctions restrictions",
    testResult: "Verified by Forex-only public route and subscription invoice regression tests.",
    classification: "Outdated",
    severity: "High",
    correctiveAction: "Removed this offering and its signup links; retain this entry as historical audit evidence.",
    responsibleComponent: "Market access and stock page",
    deploymentStatus: "corrected-in-branch",
  }),
  claim({
    claimId: "PC-013",
    exactPublicClaim: "Join the Nister AI options automation rollout.",
    sourcePageOrMessage: "/options-ai-trading-automation",
    intendedUser: "Options trader",
    advertisedCapability: "Options automation market access.",
    actualCapability: "Only signal-gated Forex is offered. Backend authorization rejects non-Forex enrollment and payment; retired pages redirect and stored flags cannot enable them.",
    capabilityIds: ["options-automation-rollout"],
    requiredSubscription: "Waitlist/prepay until market enabled; then eligible active plan",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, options permissions, payment, legal, and sanctions restrictions",
    testResult: "Verified by Forex-only public route and subscription invoice regression tests.",
    classification: "Outdated",
    severity: "High",
    correctiveAction: "Removed this offering and its signup links; retain this entry as historical audit evidence.",
    responsibleComponent: "Market access and options page",
    deploymentStatus: "corrected-in-branch",
  }),
  claim({
    claimId: "PC-014",
    exactPublicClaim: "The Nister AI App checks approved broker account, terminal, connection health, and command eligibility.",
    sourcePageOrMessage: "/companion-app-automation",
    intendedUser: "Member setting up runtime",
    advertisedCapability: "Runtime readiness and command eligibility checks.",
    actualCapability: "Runtime authentication, registration, heartbeat, command, report, and release download APIs are implemented.",
    capabilityIds: ["nister-ai-app-runtime", "dashboard-monitoring"],
    requiredSubscription: "Starter active subscription for live runtime commands",
    requiredRole: "MEMBER and RUNTIME token",
    requiredGeography: "Subject to broker, runtime, payment, legal, and sanctions restrictions",
    testResult: "Covered by companion bootstrap/download tests, live member page audit, and route inventory.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Do not describe this as a native Android or iOS app.",
    responsibleComponent: "Runtime API and dashboard connect-app",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-015",
    exactPublicClaim: "Expert Advisor workflows belong to the Starter own-broker runtime path.",
    sourcePageOrMessage: "/expert-advisor-automation",
    intendedUser: "MetaTrader trader",
    advertisedCapability: "MetaTrader/EA-style runtime support.",
    actualCapability: "The repository includes runtime/EA release APIs and MetaTrader-side EA source; public flow still routes through Nister AI App setup.",
    capabilityIds: ["nister-ai-app-runtime", "local-runtime"],
    requiredSubscription: "Starter active subscription",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, runtime, payment, legal, and sanctions restrictions",
    testResult: "Covered by companion release tests and public page audit.",
    classification: "Accurate but incomplete",
    severity: "Medium",
    correctiveAction: "Keep page positioned as a related MetaTrader workflow, not a separate public product.",
    responsibleComponent: "EA/runtime documentation",
    deploymentStatus: "documented-limitation",
  }),
  claim({
    claimId: "PC-016",
    exactPublicClaim: "Broker listings are compatibility notes, not personalized broker advice or guaranteed approval.",
    sourcePageOrMessage: "/recommended-brokers",
    intendedUser: "Prospective trader",
    advertisedCapability: "Broker setup compatibility guidance.",
    actualCapability: "Broker options are configurable records with signup URLs, setup steps, region notes, and no suitability guarantee.",
    capabilityIds: ["broker-funds-self-custody", "nister-ai-app-runtime"],
    requiredSubscription: "No paid plan required to read; active plan required for live execution",
    requiredRole: "none",
    requiredGeography: "Broker availability depends on region and broker policy",
    testResult: "Covered by public page audit and broker page source review.",
    classification: "Accurate",
    severity: "Medium",
    correctiveAction: "Retain compatibility and no-advice wording.",
    responsibleComponent: "Broker page and broker admin",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-017",
    exactPublicClaim: "Starter Forex automation can execute through your own broker account without copy trading or profit guarantees.",
    sourcePageOrMessage: "/ai-forex-trading-bot-own-broker-account",
    intendedUser: "Search visitor",
    advertisedCapability: "Own-broker AI forex bot positioning.",
    actualCapability: "The product uses user-owned broker accounts, not pooled funds or social/copy-trading mirroring.",
    capabilityIds: ["forex-signal-gated-automation", "broker-funds-self-custody"],
    requiredSubscription: "Starter for live own-broker execution",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Covered by topic-cluster source tests.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Keep page linked to risk disclosure and pricing.",
    responsibleComponent: "Topic cluster SEO pages",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-018",
    exactPublicClaim: "MetaTrader automation setup requires broker-account ownership, Nister AI App runtime choices, and risk controls.",
    sourcePageOrMessage: "/metatrader-automation-setup",
    intendedUser: "MetaTrader trader",
    advertisedCapability: "MetaTrader setup planning.",
    actualCapability: "Onboarding collects broker details, risk settings, plan selection, billing, and runtime readiness before activation.",
    capabilityIds: ["nister-ai-app-runtime", "risk-controls", "broker-funds-self-custody"],
    requiredSubscription: "Starter for live own-broker execution",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Covered by onboarding route tests and topic-cluster source tests.",
    classification: "Accurate",
    severity: "Medium",
    correctiveAction: "Keep local/managed limitations visible.",
    responsibleComponent: "Topic cluster SEO pages and onboarding",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-019",
    exactPublicClaim: "Starter vs Managed Funds changes who handles funds and runtime responsibility.",
    sourcePageOrMessage: "/starter-vs-managed-funds",
    intendedUser: "Prospective buyer",
    advertisedCapability: "Service-path comparison.",
    actualCapability: "Starter uses user-owned broker runtime setup. Managed Funds is a managed-capital service with monthly profit distribution only when profits are available.",
    capabilityIds: ["local-runtime", "managed-funds-service"],
    requiredSubscription: "Starter or Managed Funds according to selected service path",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, cloud, and sanctions restrictions",
    testResult: "Covered by topic-cluster source tests and product-claim source scan.",
    classification: "Accurate",
    severity: "Medium",
    correctiveAction: "Avoid uninterrupted availability or outcome claims.",
    responsibleComponent: "Runtime comparison page",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-020",
    exactPublicClaim: "Nister AI is a copy-trading alternative, not a signal-room mirror.",
    sourcePageOrMessage: "/copy-trading-alternative",
    intendedUser: "Search visitor",
    advertisedCapability: "Differentiation from copy trading.",
    actualCapability: "Public FAQ states strategy is fixed model logic; command flow uses internal actions rather than copying influencer or third-party accounts.",
    capabilityIds: ["forex-signal-gated-automation", "agent-api"],
    requiredSubscription: "Starter for live own-broker execution",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Covered by topic-cluster source tests.",
    classification: "Accurate",
    severity: "Medium",
    correctiveAction: "Keep no-profit and no-social-copy wording.",
    responsibleComponent: "Topic cluster SEO pages",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-021",
    exactPublicClaim: "Risk controls include risk per trade, daily loss caps, open-trade limits, and stop boundaries.",
    sourcePageOrMessage: "/trading-automation-risk-controls",
    intendedUser: "Prospective trader and member",
    advertisedCapability: "Configurable risk controls.",
    actualCapability: "Risk settings are stored and backend execution gates reject commands outside active limits.",
    capabilityIds: ["risk-controls"],
    requiredSubscription: "Starter active subscription for own-broker live execution",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Covered by execution-access tests and topic-cluster source tests.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Keep disclosure that risk controls cannot prevent all losses.",
    responsibleComponent: "Risk controls and execution access",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-022",
    exactPublicClaim: "Nister AI can place broker orders only after setup, billing, broker connection, activation, risk-policy, and signal conditions are satisfied.",
    sourcePageOrMessage: "/terms",
    intendedUser: "Customer and legal reviewer",
    advertisedCapability: "Conditional automated order placement.",
    actualCapability: "Control-plane and runtime endpoints apply authentication, subscription, broker, risk, and command eligibility gates.",
    capabilityIds: ["forex-signal-gated-automation", "risk-controls", "agent-api"],
    requiredSubscription: "Starter or Managed Funds active subscription",
    requiredRole: "MEMBER and internal service/runtime credentials",
    requiredGeography: "Restricted or sanctioned jurisdictions excluded",
    testResult: "Covered by legal page crawl, execution-access tests, and internal API auth tests.",
    classification: "Accurate",
    severity: "Critical",
    correctiveAction: "Retain legal limitation.",
    responsibleComponent: "Terms and execution access",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-023",
    exactPublicClaim: "Managed Funds users do not submit broker runtime credentials as part of onboarding.",
    sourcePageOrMessage: "/privacy",
    intendedUser: "Customer and privacy reviewer",
    advertisedCapability: "Managed Funds data minimization.",
    actualCapability: "Managed Funds onboarding skips the broker runtime credential path; public contact and support pages warn against sending broker passwords through public channels.",
    capabilityIds: ["managed-funds-service", "support-ticketing"],
    requiredSubscription: "Managed Funds",
    requiredRole: "MEMBER and ADMIN operations",
    requiredGeography: "Subject to broker, cloud, legal, and sanctions restrictions",
    testResult: "Covered by privacy page crawl and dashboard action tests.",
    classification: "Accurate but incomplete",
    severity: "High",
    correctiveAction: "Keep broker runtime credential collection out of the Managed Funds path.",
    responsibleComponent: "Privacy page and dashboard connection flow",
    deploymentStatus: "documented-limitation",
  }),
  claim({
    claimId: "PC-024",
    exactPublicClaim: "Automation does not remove market risk, execution risk, broker risk, technology risk, or the possibility of losing capital.",
    sourcePageOrMessage: "/risk-disclosure",
    intendedUser: "Customer and legal reviewer",
    advertisedCapability: "Risk disclosure.",
    actualCapability: "All trading remains subject to external broker/market/runtime factors beyond Nister AI control.",
    capabilityIds: ["forex-signal-gated-automation", "risk-controls", "managed-funds-service"],
    requiredSubscription: "Any plan",
    requiredRole: "MEMBER",
    requiredGeography: "All supported geographies",
    testResult: "Covered by legal page crawl and topic-cluster risk tests.",
    classification: "Accurate",
    severity: "Critical",
    correctiveAction: "Keep risk disclosure accessible from pricing and guide pages.",
    responsibleComponent: "Risk disclosure and marketing pages",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-025",
    exactPublicClaim: "Signup can join a waitlist when the selected market is not live.",
    sourcePageOrMessage: "/signup",
    intendedUser: "Prospective trader",
    advertisedCapability: "Market waitlist onboarding.",
    actualCapability: "Only signal-gated Forex is offered. Backend authorization rejects non-Forex enrollment and payment; retired pages redirect and stored flags cannot enable them.",
    capabilityIds: ["stocks-automation-rollout", "options-automation-rollout"],
    requiredSubscription: "No paid subscription required to join waitlist; prepay may apply to rollout offers",
    requiredRole: "none before account creation; MEMBER after signup",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Verified by Forex-only public route and subscription invoice regression tests.",
    classification: "Outdated",
    severity: "Medium",
    correctiveAction: "Removed this offering and its signup links; retain this entry as historical audit evidence.",
    responsibleComponent: "Signup and market enrollment",
    deploymentStatus: "corrected-in-branch",
  }),
  claim({
    claimId: "PC-026",
    exactPublicClaim: "Generate an invoice to show the exact USDT amount, destination wallet, and transfer window.",
    sourcePageOrMessage: "/dashboard/billing",
    intendedUser: "Member",
    advertisedCapability: "USDT-TRC20 invoice billing.",
    actualCapability: "Payment APIs create invoices, track references, require exact USDT-TRC20 transfer data, and route submissions to review.",
    capabilityIds: ["usdt-trc20-billing", "subscription-billing"],
    requiredSubscription: "Selected plan or top-up intent",
    requiredRole: "MEMBER",
    requiredGeography: "Payment availability and legal restrictions apply",
    testResult: "Covered by Tron payment unit tests, dashboard payment action tests, and live member page audit.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Keep payment limitations visible and avoid claiming instant activation.",
    responsibleComponent: "Billing and payment APIs",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-027",
    exactPublicClaim: "Download and install the Nister AI App.",
    sourcePageOrMessage: "/dashboard/connect-app",
    intendedUser: "Member",
    advertisedCapability: "Runtime release download for eligible members.",
    actualCapability: "Companion release download route enforces companion user validation and release availability.",
    capabilityIds: ["nister-ai-app-runtime"],
    requiredSubscription: "Eligible Forex onboarding or active subscription context",
    requiredRole: "MEMBER",
    requiredGeography: "Subject to runtime platform and account eligibility",
    testResult: "Covered by companion download policy tests and live member page audit.",
    classification: "Accurate but incomplete",
    severity: "Medium",
    correctiveAction: "Keep download wording tied to dashboard eligibility; do not imply mobile app-store availability.",
    responsibleComponent: "Connect-app dashboard and release API",
    deploymentStatus: "documented-limitation",
  }),
  claim({
    claimId: "PC-028",
    exactPublicClaim: "Admins can configure plans, pricing, broker options, content, payments, support, risk, and audit views.",
    sourcePageOrMessage: "/admin",
    intendedUser: "Admin",
    advertisedCapability: "Administrative control plane.",
    actualCapability: "Protected admin pages and actions exist for users, plans, brokers, content, payments, support, security, audit, and control-plane operations.",
    capabilityIds: ["admin-payment-review", "agent-api", "support-ticketing"],
    requiredSubscription: "Not applicable",
    requiredRole: "ADMIN",
    requiredGeography: "Internal operational access only",
    testResult: "Covered by admin route live audit and authorization tests.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Keep admin surfaces noindexed and protected.",
    responsibleComponent: "Admin pages and authorization",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-029",
    exactPublicClaim: "AI actions are submitted to an internal service endpoint, not a public customer API.",
    sourcePageOrMessage: "docs/control-plane-phase1.md",
    intendedUser: "Operator and developer",
    advertisedCapability: "Internal AI/agent command API.",
    actualCapability: "Internal endpoint uses service authentication, HMAC signature verification, model allowlist checks, audit logs, and command gates.",
    capabilityIds: ["agent-api"],
    requiredSubscription: "Active member subscription for affected broker account plus internal service credentials",
    requiredRole: "SERVICE",
    requiredGeography: "Internal infrastructure only",
    testResult: "Covered by internal-control-plane-auth and control-plane-security tests.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Do not market internal AI endpoint as a public API.",
    responsibleComponent: "Internal API documentation and control plane",
    deploymentStatus: "not-public",
  }),
  claim({
    claimId: "PC-030",
    exactPublicClaim: "Nister AI account email verification links expire in 24 hours; password reset links expire in 1 hour.",
    sourcePageOrMessage: "src/lib/email-template.ts",
    intendedUser: "Account holder",
    advertisedCapability: "Security email expiry messaging.",
    actualCapability: "Email templates present explicit expiry copy; auth actions generate verification and password reset flows.",
    capabilityIds: ["support-ticketing"],
    requiredSubscription: "No paid subscription required",
    requiredRole: "MEMBER",
    requiredGeography: "Email delivery availability applies",
    testResult: "Covered by email-template unit tests.",
    classification: "Accurate",
    severity: "Medium",
    correctiveAction: "Keep email copy aligned to auth token expiry implementation.",
    responsibleComponent: "Email templates and auth actions",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-031",
    exactPublicClaim: "Structured data lists LimitedAvailability and no concrete stale price.",
    sourcePageOrMessage: "Search-result metadata and JSON-LD",
    intendedUser: "Search crawler and prospective buyer",
    advertisedCapability: "SEO metadata and structured data truthfulness.",
    actualCapability: "Only signal-gated Forex is offered. Backend authorization rejects non-Forex enrollment and payment; retired pages redirect and stored flags cannot enable them.",
    capabilityIds: ["subscription-billing", "stocks-automation-rollout", "options-automation-rollout"],
    requiredSubscription: "Not applicable",
    requiredRole: "none",
    requiredGeography: "Search-indexed public pages",
    testResult: "Verified by Forex-only public route and subscription invoice regression tests.",
    classification: "Outdated",
    severity: "Medium",
    correctiveAction: "Removed this offering and its signup links; retain this entry as historical audit evidence.",
    responsibleComponent: "SEO metadata",
    deploymentStatus: "corrected-in-branch",
  }),
  claim({
    claimId: "PC-032",
    exactPublicClaim: "No native Android or iOS application is described as currently available.",
    sourcePageOrMessage: "Mobile application descriptions and public source scan",
    intendedUser: "Prospective trader",
    advertisedCapability: "Platform availability boundaries.",
    actualCapability: "Current product exposes web dashboard and runtime tooling; no mobile app-store route or metadata is configured.",
    capabilityIds: ["native-mobile-app"],
    requiredSubscription: "Not applicable",
    requiredRole: "none",
    requiredGeography: "Not applicable",
    testResult: "Product-claims source scan rejects native mobile app availability claims.",
    classification: "Accurate",
    severity: "High",
    correctiveAction: "Keep Nister AI App wording distinct from native mobile app claims.",
    responsibleComponent: "Public copy and release documentation",
    deploymentStatus: "ready-for-deploy",
  }),
  claim({
    claimId: "PC-033",
    exactPublicClaim: "Nister AI appears in llms.txt as signal-gated trading execution with staged Stocks and Options.",
    sourcePageOrMessage: "/llms.txt and /llms-full.txt",
    intendedUser: "AI crawler and search assistant",
    advertisedCapability: "AI-agent documentation for public product summary.",
    actualCapability: "Only signal-gated Forex is offered. Backend authorization rejects non-Forex enrollment and payment; retired pages redirect and stored flags cannot enable them.",
    capabilityIds: ["forex-signal-gated-automation", "stocks-automation-rollout", "options-automation-rollout"],
    requiredSubscription: "Starter for live own-broker Forex execution",
    requiredRole: "none to read; MEMBER for execution",
    requiredGeography: "Subject to broker, payment, legal, and sanctions restrictions",
    testResult: "Verified by Forex-only public route and subscription invoice regression tests.",
    classification: "Outdated",
    severity: "Medium",
    correctiveAction: "Removed this offering and its signup links; retain this entry as historical audit evidence.",
    responsibleComponent: "AI-agent documentation routes",
    deploymentStatus: "corrected-in-branch",
  }),
  claim({
    claimId: "PC-034",
    exactPublicClaim: "Account deletion, correction, access, objection, consent withdrawal, and portability are handled through privacy rights requests.",
    sourcePageOrMessage: "/privacy",
    intendedUser: "Customer and privacy reviewer",
    advertisedCapability: "Data-rights request pathway.",
    actualCapability: "Privacy page provides support email for rights requests; no self-service deletion workflow is advertised.",
    capabilityIds: ["support-ticketing"],
    requiredSubscription: "No paid plan required",
    requiredRole: "MEMBER or data subject",
    requiredGeography: "Rights depend on applicable law",
    testResult: "Covered by privacy page crawl and support ticket access-control tests.",
    classification: "Accurate but incomplete",
    severity: "Medium",
    correctiveAction: "Do not imply self-service account deletion unless implemented.",
    responsibleComponent: "Privacy page and support operations",
    deploymentStatus: "documented-limitation",
  }),
];

const unresolvedStatuses = new Set<ProductClaim["deploymentStatus"]>([]);
const discrepancyClassifications = new Set<ProductClaimClassification>([
  "Ambiguous",
  "Outdated",
  "Exaggerated",
  "Incorrect",
  "Potentially deceptive",
  "Unsupported by evidence",
  "Planned but not implemented",
  "Technically present but unusable",
]);

export function isOpenProductClaimDiscrepancy(claim: ProductClaim) {
  return discrepancyClassifications.has(claim.classification) && claim.deploymentStatus !== "corrected-in-branch";
}

export function productClaimGateFailures(input?: {
  claims?: ProductClaim[];
  uncoveredPublicRoutes?: string[];
}) {
  const claims = input?.claims ?? PRODUCT_CLAIMS;
  const uncoveredPublicRoutes = input?.uncoveredPublicRoutes ?? [];
  const failures: string[] = [];
  const openCriticalOrHigh = claims.filter(
    (claim) => (claim.severity === "Critical" || claim.severity === "High") && isOpenProductClaimDiscrepancy(claim),
  );
  const unsupportedOpen = claims.filter(
    (claim) => claim.classification === "Unsupported by evidence" && claim.deploymentStatus !== "corrected-in-branch",
  );

  for (const claim of openCriticalOrHigh) {
    failures.push(`${claim.claimId} is an unresolved high-risk product claim discrepancy`);
  }
  for (const claim of unsupportedOpen) {
    failures.push(`${claim.claimId} is an unsupported open product claim`);
  }
  if (uncoveredPublicRoutes.length) {
    failures.push(`Uncovered public product-claim routes: ${uncoveredPublicRoutes.join(", ")}`);
  }

  return failures;
}

export function isAiOrAutomationCapabilityClaim(text: string) {
  const normalized = text.replace(/\bNister AI\b/g, "Nister").toLowerCase();
  return /\b(artificial intelligence|ai-powered|autonomous|automated|automation|agent-ready|predictive|smart matching|self-learning)\b/.test(
    normalized,
  );
}

export function validateProductClaims() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenClaimIds = new Set<string>();
  const seenCapabilityIds = new Set<string>();

  for (const capability of PRODUCT_CAPABILITY_REGISTRY) {
    if (seenCapabilityIds.has(capability.id)) {
      errors.push(`Duplicate capability id: ${capability.id}`);
    }
    seenCapabilityIds.add(capability.id);
  }

  for (const claim of PRODUCT_CLAIMS) {
    if (seenClaimIds.has(claim.claimId)) {
      errors.push(`Duplicate claim id: ${claim.claimId}`);
    }
    seenClaimIds.add(claim.claimId);

    for (const capabilityId of claim.capabilityIds) {
      if (!capabilityById.has(capabilityId)) {
        errors.push(`${claim.claimId} references unknown capability ${capabilityId}`);
      }
    }

    if (!claim.frontendEvidence.length) {
      errors.push(`${claim.claimId} is missing frontend evidence`);
    }
    if (!claim.backendEvidence.length) {
      errors.push(`${claim.claimId} is missing backend evidence`);
    }

    const aiClaim = `${claim.exactPublicClaim} ${claim.advertisedCapability}`;
    if (isAiOrAutomationCapabilityClaim(aiClaim)) {
      const mechanism = `${claim.actualCapability} ${claim.backendEvidence.join(" ")}`.toLowerCase();
      if (!/(fixed strategy|signal-gated|rules|risk gate|hmac|runtime|model allowlist|backend authorization|manual review|waitlist)/.test(mechanism)) {
        errors.push(`${claim.claimId} lacks a concrete AI/automation mechanism`);
      }
    }

    if ((claim.severity === "Critical" || claim.severity === "High") && isOpenProductClaimDiscrepancy(claim)) {
      errors.push(`${claim.claimId} is a high-risk unresolved discrepancy`);
    }
  }

  const claimedCapabilities = new Set(PRODUCT_CLAIMS.flatMap((claim) => claim.capabilityIds));
  for (const capability of PRODUCT_CAPABILITY_REGISTRY) {
    if (!claimedCapabilities.has(capability.id) && capability.releaseStatus !== "not-offered") {
      warnings.push(`${capability.id} is in the registry but has no claim matrix row`);
    }
  }

  return { errors, warnings };
}

export const __test = {
  discrepancyClassifications,
  unresolvedStatuses,
};
