import type { Metadata } from "next";
import type { MetadataRoute } from "next";

export const NISTER_AI_SITE_URL = "https://nisterai.com";
export const NISTER_AI_SITE_NAME = "Nister AI";
export const NISTER_AI_SUPPORT_EMAIL = "support@nisterai.com";
export const NISTER_AI_SOCIAL_IMAGE_PATH = "/brand/nister-logo-mark.png";
export const NISTER_AI_SOCIAL_IMAGE_ALT = "Nister AI logo mark";

const CORE_TRADING_AUTOMATION_KEYWORDS = [
  "trading automation",
  "trading automation software",
  "automated trading",
  "algorithmic trading",
  "autonomous execution",
  "broker account automation",
  "mt5 automation",
  "metatrader automation",
  "companion app automation",
  "companion app runtime",
  "forex trading automation",
  "automated forex trading",
  "forex companion app",
  "forex companion app automation",
  "forex trading automation",
  "trading software for retail users",
  "non custodial trading automation",
  "trade on your own broker account",
  "user owned brokerage accounts",
  "broker account ownership",
  "local runtime trading automation",
  "managed funds trading setup",
  "forex trading software",
  "rules based trading execution",
  "signal gated trading execution",
  "metatrader automation setup",
  "starter own broker trading automation",
  "copy trading alternative",
  "signal room alternative",
] as const;

const LONG_FORM_INTENT_KEYWORDS = [
  "forex trading automation on your own broker account",
  "automated forex trading software without copy trading",
  "companion app automation for forex traders",
  "managed funds forex service",
  "starter trading system that keeps funds in the broker account",
  "how to automate forex trading",
  "companion app setup for metatrader",
  "trade automation software for forex",
  "automated execution for valid trading signals",
  "trading assistant with risk gates",
] as const;

export const DEFAULT_SEO_KEYWORDS = Array.from(
  new Set([...CORE_TRADING_AUTOMATION_KEYWORDS, ...LONG_FORM_INTENT_KEYWORDS]),
);

type BuildMarketingMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: readonly string[];
  noIndex?: boolean;
};

type PublicMarketingRouteSchemaIntent = "organization" | "website" | "software" | "faq" | "breadcrumb";

export type PublicMarketingRoute = {
  path: string;
  canonicalUrl: string;
  title: string;
  description: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
  lastModified: `${number}-${number}-${number}`;
  schemaIntent?: readonly PublicMarketingRouteSchemaIntent[];
};

function normalizePath(path: string) {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }
  return path;
}

export function absoluteSiteUrl(path: string) {
  return `${NISTER_AI_SITE_URL}${normalizePath(path)}`;
}

export const PUBLIC_MARKETING_ROUTES: readonly PublicMarketingRoute[] = [
  {
    path: "/",
    canonicalUrl: absoluteSiteUrl("/"),
    title: "Nister AI | Forex Trading Automation on Your Own Broker Account",
    description:
      "Run Starter Forex automation through your own broker account or choose Managed Funds service access for pooled managed-capital Forex operations.",
    changeFrequency: "daily",
    priority: 1,
    lastModified: "2026-05-13",
    schemaIntent: ["organization", "website", "software", "breadcrumb"],
  },
  {
    path: "/pricing",
    canonicalUrl: absoluteSiteUrl("/pricing"),
    title: "Nister AI Pricing | AI Trading Automation Plans",
    description:
      "Compare Starter own-broker Forex automation and Managed Funds pooled managed-capital service access.",
    changeFrequency: "weekly",
    priority: 0.9,
    lastModified: "2026-05-13",
    schemaIntent: ["software", "breadcrumb"],
  },
  {
    path: "/guide",
    canonicalUrl: absoluteSiteUrl("/guide"),
    title: "Nister AI Setup Guide | Forex Automation and Market Rollout",
    description:
      "Set up Nister AI Forex automation and compare Starter own-broker execution with Managed Funds service access.",
    changeFrequency: "weekly",
    priority: 0.8,
    lastModified: "2026-05-13",
    schemaIntent: ["breadcrumb"],
  },
  {
    path: "/faq",
    canonicalUrl: absoluteSiteUrl("/faq"),
    title: "Nister AI FAQ | Autonomous Execution, Account Ownership, Runtime, and Risk",
    description:
      "Answers about Nister AI Forex automation, the Nister AI App, billing, broker-account ownership, and risk.",
    changeFrequency: "weekly",
    priority: 0.8,
    lastModified: "2026-05-13",
    schemaIntent: ["faq", "breadcrumb"],
  },
  {
    path: "/contact",
    canonicalUrl: absoluteSiteUrl("/contact"),
    title: "Contact Nister AI | Setup, Billing, Broker Connection, and Runtime Support",
    description:
      "Contact Nister AI for Forex setup, subscription billing, broker connection, Managed Funds, and platform-operation questions.",
    changeFrequency: "monthly",
    priority: 0.7,
    lastModified: "2026-05-13",
    schemaIntent: ["breadcrumb"],
  },
  {
    path: "/forex-ai-trading-automation",
    canonicalUrl: absoluteSiteUrl("/forex-ai-trading-automation"),
    title: "AI Forex Trading Automation on Your Own Broker Account | Nister AI",
    description:
      "Run Starter Forex Trading through your own broker account with configurable risk controls, or compare Managed Funds service access before subscribing.",
    changeFrequency: "weekly",
    priority: 0.85,
    lastModified: "2026-05-13",
    schemaIntent: ["software", "faq", "breadcrumb"],
  },
  {
    path: "/companion-app-automation",
    canonicalUrl: absoluteSiteUrl("/companion-app-automation"),
    title: "Nister AI App Runtime for MetaTrader Automation | Nister AI",
    description:
      "Understand the Nister AI App runtime used for Starter own-broker MetaTrader execution, connection checks, and dashboard monitoring.",
    changeFrequency: "weekly",
    priority: 0.85,
    lastModified: "2026-05-13",
    schemaIntent: ["software", "faq", "breadcrumb"],
  },
  {
    path: "/expert-advisor-automation",
    canonicalUrl: absoluteSiteUrl("/expert-advisor-automation"),
    title: "Expert Advisor Automation | Nister AI",
    description:
      "Review Nister AI Expert Advisor automation options for disciplined execution through your own broker account and Nister AI App runtime setup.",
    changeFrequency: "weekly",
    priority: 0.85,
    lastModified: "2026-05-13",
    schemaIntent: ["software", "breadcrumb"],
  },
  {
    path: "/recommended-brokers",
    canonicalUrl: absoluteSiteUrl("/recommended-brokers"),
    title: "Broker Setup Options Compatible with Nister AI",
    description:
      "Review broker setup options compatible with Nister AI automation. Broker listings are for setup compatibility, not profit expectations or personalized broker advice.",
    changeFrequency: "weekly",
    priority: 0.75,
    lastModified: "2026-05-13",
    schemaIntent: ["breadcrumb"],
  },
  {
    path: "/ai-forex-trading-bot-own-broker-account",
    canonicalUrl: absoluteSiteUrl("/ai-forex-trading-bot-own-broker-account"),
    title: "Starter AI Forex Trading Bot for Your Own Broker Account | Nister AI",
    description:
      "Learn how Starter forex automation can execute through your own broker account without copy trading or profit promises.",
    changeFrequency: "weekly",
    priority: 0.78,
    lastModified: "2026-05-13",
    schemaIntent: ["faq", "breadcrumb"],
  },
  {
    path: "/metatrader-automation-setup",
    canonicalUrl: absoluteSiteUrl("/metatrader-automation-setup"),
    title: "MetaTrader Automation Setup | Nister AI",
    description:
      "Plan a MetaTrader automation setup with broker-account ownership, Nister AI App runtime choices, and clear risk controls.",
    changeFrequency: "weekly",
    priority: 0.78,
    lastModified: "2026-05-13",
    schemaIntent: ["faq", "breadcrumb"],
  },
  {
    path: "/starter-vs-managed-funds",
    canonicalUrl: absoluteSiteUrl("/starter-vs-managed-funds"),
    title: "Starter vs Managed Funds | Nister AI",
    description:
      "Compare Starter own-broker Forex automation with Managed Funds pooled managed-capital service access.",
    changeFrequency: "weekly",
    priority: 0.78,
    lastModified: "2026-05-13",
    schemaIntent: ["faq", "breadcrumb"],
  },
  {
    path: "/copy-trading-alternative",
    canonicalUrl: absoluteSiteUrl("/copy-trading-alternative"),
    title: "Copy Trading Alternative for Automation | Nister AI",
    description:
      "Compare copy trading with broker-account automation that keeps funds in your own account and avoids profit promises.",
    changeFrequency: "weekly",
    priority: 0.78,
    lastModified: "2026-05-13",
    schemaIntent: ["faq", "breadcrumb"],
  },
  {
    path: "/trading-automation-risk-controls",
    canonicalUrl: absoluteSiteUrl("/trading-automation-risk-controls"),
    title: "Trading Automation Risk Controls | Nister AI",
    description:
      "Understand practical risk controls for automated trading, including sizing, stop conditions, account ownership, and realistic risk expectations.",
    changeFrequency: "weekly",
    priority: 0.78,
    lastModified: "2026-05-13",
    schemaIntent: ["faq", "breadcrumb"],
  },
  {
    path: "/terms",
    canonicalUrl: absoluteSiteUrl("/terms"),
    title: "Terms of Use | Nister AI Trading Automation",
    description:
      "Read the Nister AI Terms of Use for automated trading, eligibility, subscriptions, liabilities, and governing law.",
    changeFrequency: "monthly",
    priority: 0.55,
    lastModified: "2026-05-13",
    schemaIntent: ["breadcrumb"],
  },
  {
    path: "/privacy",
    canonicalUrl: absoluteSiteUrl("/privacy"),
    title: "Privacy Policy | Nister AI Trading Platform",
    description:
      "Read how Nister AI collects, uses, stores, shares, and protects personal data across onboarding, billing, support, dashboards, and operations.",
    changeFrequency: "monthly",
    priority: 0.55,
    lastModified: "2026-05-13",
    schemaIntent: ["breadcrumb"],
  },
  {
    path: "/risk-disclosure",
    canonicalUrl: absoluteSiteUrl("/risk-disclosure"),
    title: "Risk Disclosure | Nister AI Forex Automation and Market Rollout",
    description:
      "Understand market, execution, leverage, automation, technology, and broker risks before using automated trading.",
    changeFrequency: "monthly",
    priority: 0.55,
    lastModified: "2026-05-13",
    schemaIntent: ["breadcrumb"],
  },
];

export function buildMarketingMetadata({
  title,
  description,
  path,
  keywords = [],
  noIndex = false,
}: BuildMarketingMetadataInput): Metadata {
  const mergedKeywords = Array.from(new Set([...DEFAULT_SEO_KEYWORDS, ...keywords]));
  const socialImage = {
    url: absoluteSiteUrl(NISTER_AI_SOCIAL_IMAGE_PATH),
    width: 1024,
    height: 1024,
    alt: NISTER_AI_SOCIAL_IMAGE_ALT,
  };

  return {
    title,
    description,
    keywords: mergedKeywords,
    alternates: {
      canonical: normalizePath(path),
    },
    openGraph: {
      title,
      description,
      url: absoluteSiteUrl(path),
      siteName: NISTER_AI_SITE_NAME,
      type: "website",
      locale: "en_US",
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage.url],
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          nocache: true,
        }
      : {
          index: true,
          follow: true,
          nocache: false,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}

type FaqJsonLdInput = {
  path: string;
  items: Array<{ question: string; answer: string }>;
};

export function buildOrganizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: NISTER_AI_SITE_NAME,
    url: NISTER_AI_SITE_URL,
    email: NISTER_AI_SUPPORT_EMAIL,
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: NISTER_AI_SUPPORT_EMAIL,
        url: absoluteSiteUrl("/contact"),
        availableLanguage: ["English"],
      },
    ],
    sameAs: ["https://nisterai.com"],
  };
}

export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: NISTER_AI_SITE_NAME,
    url: NISTER_AI_SITE_URL,
    description:
      "Software for signal-gated Forex trading through Starter own-broker execution or Managed Funds service access.",
  };
}

type SoftwareJsonLdInput = {
  path: string;
  headline: string;
  summary: string;
};

export function buildSoftwareApplicationJsonLd({ path, headline, summary }: SoftwareJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Nister AI Trading Automation",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web, Windows",
    url: absoluteSiteUrl(path),
    description:
      "Nister AI offers Starter own-broker Forex automation and Managed Funds pooled managed-capital service access.",
    disambiguatingDescription: summary,
    isAccessibleForFree: false,
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/LimitedAvailability",
      priceCurrency: "USD",
    },
    featureList: [
      "Automated Forex Trading",
      "Nister AI App runtime workflows",
      "Trade execution on user-owned brokerage accounts",
      "Configurable risk limits before commands are eligible",
      "Starter and Managed Funds service paths",
    ],
    headline,
  };
}

type BreadcrumbJsonLdInput = {
  items: Array<{ name: string; path: string }>;
};

export function buildBreadcrumbJsonLd({ items }: BreadcrumbJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteSiteUrl(item.path),
    })),
  };
}

export function buildFaqJsonLd({ path, items }: FaqJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: absoluteSiteUrl(path),
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
