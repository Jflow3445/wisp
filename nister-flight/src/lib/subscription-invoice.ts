import { calculateDiscountedPriceCents, type PlatformSettingsView } from "@/lib/site";

export function quoteSubscriptionInvoice(input: {
  plan: { slug: string; monthlyPriceCents: number };
  months?: unknown;
  isReferredUser: boolean;
  settings: PlatformSettingsView;
}) {
  const months = input.months === undefined ? 1 : Number(input.months);
  if (!Number.isInteger(months) || months < 1 || months > 36) throw new Error("Choose between 1 and 36 subscription months.");
  const price = calculateDiscountedPriceCents(input.plan.monthlyPriceCents, input.isReferredUser, input.settings);
  const total = price.finalPriceCents * months;
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("This plan cannot be paid through a subscription invoice. Contact support.");
  return {
    amountUsdCents: total,
    amountUsdt: (total / 100).toFixed(2),
    metadata: {
      source: "subscription_invoice_api",
      planSlug: input.plan.slug,
      market: "FOREX",
      amountUsdCents: input.plan.monthlyPriceCents * months,
      planPriceUsdCents: input.plan.monthlyPriceCents,
      discountUsdCents: price.discountCents * months,
      finalAmountUsdCents: total,
      topUpMonths: months,
      waitlistPrepayAnnual: false,
    },
  };
}

export function matchesInvoiceQuote(amount: string, quotedUsdCents: number) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount)) return false;
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0")) === BigInt(quotedUsdCents) * BigInt(10_000);
}
