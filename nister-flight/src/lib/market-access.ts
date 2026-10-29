import { AutomationMarket, MarketEnrollmentStatus } from "@prisma/client";

export const WAITLIST_ANNUAL_DISCOUNT_BPS = 3000;
const BPS_BASE = 10_000;

export const AUTOMATION_MARKETS = [
  AutomationMarket.FOREX,
] as const;

// Keep historical enum values readable without offering unavailable models.
export function isOfferedAutomationMarket(market: AutomationMarket | null | undefined): market is typeof AutomationMarket.FOREX {
  return market === AutomationMarket.FOREX;
}

export function automationMarketLabel(market: AutomationMarket) {
  if (market === AutomationMarket.FOREX) return "Forex";
  if (market === AutomationMarket.STOCKS) return "Stocks";
  return "Options";
}

export function automationMarketShortKey(market: AutomationMarket) {
  if (market === AutomationMarket.FOREX) return "forex";
  if (market === AutomationMarket.STOCKS) return "stocks";
  return "options";
}

export function parseAutomationMarket(input: string | null | undefined): AutomationMarket | null {
  const value = String(input || "")
    .trim()
    .toUpperCase();
  if (value === "FOREX") return AutomationMarket.FOREX;
  if (value === "STOCKS") return AutomationMarket.STOCKS;
  if (value === "OPTIONS") return AutomationMarket.OPTIONS;
  return null;
}

export function parseAutomationMarketFromQuery(input: string | null | undefined): AutomationMarket | null {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (value === "forex") return AutomationMarket.FOREX;
  if (value === "stocks" || value === "stock") return AutomationMarket.STOCKS;
  if (value === "options" || value === "option") return AutomationMarket.OPTIONS;
  return null;
}

export function resolveUserFocusMarket(input: {
  preferredMarket?: AutomationMarket | null;
  subscriptionMarket?: AutomationMarket | null;
  subscriptionActive?: boolean;
  fallbackMarket?: AutomationMarket;
}) {
  const fallback = AutomationMarket.FOREX;
  if (input.subscriptionActive && isOfferedAutomationMarket(input.subscriptionMarket)) {
    return input.subscriptionMarket;
  }
  return isOfferedAutomationMarket(input.preferredMarket) ? input.preferredMarket : fallback;
}

export function isMarketEnabled(
  settings: {
    marketForexEnabled: boolean;
    marketStocksEnabled: boolean;
    marketOptionsEnabled: boolean;
  },
  market: AutomationMarket,
) {
  if (market === AutomationMarket.FOREX) return settings.marketForexEnabled;
  return false;
}

export function isWaitlistEnrollmentStatus(status: MarketEnrollmentStatus) {
  return (
    status === MarketEnrollmentStatus.WAITLIST_PENDING ||
    status === MarketEnrollmentStatus.WAITLIST ||
    status === MarketEnrollmentStatus.WAITLIST_PREPAID
  );
}

export function computeAnnualPrepayAmountCents(monthlyPriceCents: number, discountBps = WAITLIST_ANNUAL_DISCOUNT_BPS) {
  const monthly = Math.max(0, Math.round(monthlyPriceCents));
  const annualBase = monthly * 12;
  const discount = Math.floor((annualBase * Math.max(0, Math.min(BPS_BASE, discountBps))) / BPS_BASE);
  return Math.max(0, annualBase - discount);
}
