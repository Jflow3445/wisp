import {
  AutomationMarket,
  SubscriptionStatus,
  UserAccountState,
  UserTradeState,
} from "@prisma/client";

export type ExecutionGateResult = {
  eligible: boolean;
  reason?: "SUBSCRIPTION_INACTIVE" | "MARKET_NOT_SUBSCRIBED" | "TRADING_NOT_ACTIVE" | "ACCOUNT_RESTRICTED" | "PERSONAL_RUNTIME_NOT_REQUIRED";
};

export type PolicyCommandGateResult = {
  eligible: boolean;
  reason?: "SYMBOL_BLOCKED" | "SYMBOL_NOT_ALLOWED" | "WEEKEND_TRADING_DISABLED" | "DAILY_LOSS_LIMIT_REACHED";
};

function isWeekendUtc(now: Date) {
  const day = now.getUTCDay();
  return day === 0 || day === 6;
}

function normalizeSymbol(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isOpenCommand(commandType: string) {
  return String(commandType || "")
    .trim()
    .toUpperCase() === "OPEN";
}

export function evaluatePolicyCommandEligibility(input: {
  commandType: string;
  symbol: string;
  symbols: Array<{ symbol: string; isAllowed: boolean }> | null | undefined;
  weekendTradingAllowed: boolean;
  maxDailyLossPct: number | null | undefined;
  dailyLossPct: number | null | undefined;
  now?: Date;
}): PolicyCommandGateResult {
  if (!isOpenCommand(input.commandType)) {
    return { eligible: true };
  }

  const now = input.now || new Date();
  if (!input.weekendTradingAllowed && isWeekendUtc(now)) {
    return { eligible: false, reason: "WEEKEND_TRADING_DISABLED" };
  }

  const symbol = normalizeSymbol(input.symbol);
  const symbols = input.symbols || [];
  const allowedSymbols = new Set<string>();
  const blockedSymbols = new Set<string>();
  for (const row of symbols) {
    const normalized = normalizeSymbol(row.symbol);
    if (!normalized) {
      continue;
    }
    if (row.isAllowed) {
      allowedSymbols.add(normalized);
    } else {
      blockedSymbols.add(normalized);
    }
  }

  if (blockedSymbols.has(symbol)) {
    return { eligible: false, reason: "SYMBOL_BLOCKED" };
  }
  if (allowedSymbols.size > 0 && !allowedSymbols.has(symbol)) {
    return { eligible: false, reason: "SYMBOL_NOT_ALLOWED" };
  }

  const maxDailyLossPct = typeof input.maxDailyLossPct === "number" ? input.maxDailyLossPct : null;
  const dailyLossPct = typeof input.dailyLossPct === "number" ? input.dailyLossPct : null;
  if (
    maxDailyLossPct !== null &&
    maxDailyLossPct > 0 &&
    dailyLossPct !== null &&
    Number.isFinite(dailyLossPct) &&
    dailyLossPct >= maxDailyLossPct
  ) {
    return { eligible: false, reason: "DAILY_LOSS_LIMIT_REACHED" };
  }

  return { eligible: true };
}

export function isSubscriptionCurrentlyActive(input: {
  status: SubscriptionStatus | null | undefined;
  expiresAt: Date | null | undefined;
  nowMs?: number;
}) {
  if (input.status !== SubscriptionStatus.ACTIVE) {
    return false;
  }
  if (input.expiresAt && input.expiresAt.getTime() <= (input.nowMs ?? Date.now())) {
    return false;
  }
  return true;
}

export function marketFromAssetClass(assetClassRaw: string): AutomationMarket {
  const normalized = String(assetClassRaw || "")
    .trim()
    .toUpperCase();
  if (!normalized) {
    return AutomationMarket.FOREX;
  }
  if (normalized.includes("OPTION")) {
    return AutomationMarket.OPTIONS;
  }
  if (
    normalized.includes("STOCK") ||
    normalized.includes("EQUITY") ||
    normalized.includes("SHARE")
  ) {
    return AutomationMarket.STOCKS;
  }
  return AutomationMarket.FOREX;
}

function runtimeEnabled(input: {
  accountState: UserAccountState | null | undefined;
  tradeState: UserTradeState | null | undefined;
  autotradeEnabled: boolean | null | undefined;
}) {
  if (input.accountState === UserAccountState.SUSPENDED || input.accountState === UserAccountState.CLOSED) {
    return { ok: false as const, reason: "ACCOUNT_RESTRICTED" as const };
  }
  if (input.tradeState !== UserTradeState.LIVE || !input.autotradeEnabled) {
    return { ok: false as const, reason: "TRADING_NOT_ACTIVE" as const };
  }
  return { ok: true as const };
}

export function evaluatePublishEligibility(input: {
  actionMarket: AutomationMarket;
  subscriptionStatus: SubscriptionStatus | null | undefined;
  subscriptionExpiresAt: Date | null | undefined;
  subscriptionMarket: AutomationMarket | null | undefined;
  accountState: UserAccountState | null | undefined;
  tradeState: UserTradeState | null | undefined;
  autotradeEnabled: boolean | null | undefined;
  personalRuntimeRequired?: boolean;
}): ExecutionGateResult {
  if (input.personalRuntimeRequired === false) return { eligible: false, reason: "PERSONAL_RUNTIME_NOT_REQUIRED" };
  if (
    !isSubscriptionCurrentlyActive({
      status: input.subscriptionStatus,
      expiresAt: input.subscriptionExpiresAt,
    })
  ) {
    return { eligible: false, reason: "SUBSCRIPTION_INACTIVE" };
  }
  if (input.subscriptionMarket && input.subscriptionMarket !== input.actionMarket) {
    return { eligible: false, reason: "MARKET_NOT_SUBSCRIBED" };
  }
  const runtime = runtimeEnabled({
    accountState: input.accountState,
    tradeState: input.tradeState,
    autotradeEnabled: input.autotradeEnabled,
  });
  if (!runtime.ok) {
    return { eligible: false, reason: runtime.reason };
  }
  return { eligible: true };
}

export function evaluateAgentPollEligibility(input: {
  subscriptionStatus: SubscriptionStatus | null | undefined;
  subscriptionExpiresAt: Date | null | undefined;
  accountState: UserAccountState | null | undefined;
  tradeState: UserTradeState | null | undefined;
  autotradeEnabled: boolean | null | undefined;
  personalRuntimeRequired?: boolean;
}): ExecutionGateResult {
  if (input.personalRuntimeRequired === false) return { eligible: false, reason: "PERSONAL_RUNTIME_NOT_REQUIRED" };
  if (
    !isSubscriptionCurrentlyActive({
      status: input.subscriptionStatus,
      expiresAt: input.subscriptionExpiresAt,
    })
  ) {
    return { eligible: false, reason: "SUBSCRIPTION_INACTIVE" };
  }
  const runtime = runtimeEnabled({
    accountState: input.accountState,
    tradeState: input.tradeState,
    autotradeEnabled: input.autotradeEnabled,
  });
  if (!runtime.ok) {
    return { eligible: false, reason: runtime.reason };
  }
  return { eligible: true };
}
