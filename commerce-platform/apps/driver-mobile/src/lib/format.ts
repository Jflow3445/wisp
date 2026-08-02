import type { MoneyDto } from "@nister/contracts";

export const formatMoney = (money: MoneyDto) => money.formatted || `${money.currency} ${(Number(money.amountMinor) / 100).toFixed(2)}`;
export const formatTime = (value: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export const newIdempotencyKey = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
