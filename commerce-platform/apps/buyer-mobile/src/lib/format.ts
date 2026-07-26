import type { MoneyDto } from "@nister/contracts";

export function formatMoney(money: MoneyDto): string {
  if (money.formatted) return money.formatted;
  const amount = Number.parseInt(money.amountMinor, 10) / 100;
  return `${money.currency} ${amount.toFixed(2)}`;
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
