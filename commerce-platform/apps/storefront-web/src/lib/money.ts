const CEDI_FORMATTER = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMoney(amountMinor: string, currency = "GHS") {
  const amount = BigInt(amountMinor);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  const major = absolute / 100n;
  const minor = absolute % 100n;
  const numericDisplay = `${CEDI_FORMATTER.format(Number(major))}.${minor.toString().padStart(2, "0")}`;

  return `${sign}${currency === "GHS" ? "GH₵" : currency} ${numericDisplay}`;
}

export function addMoney(...amounts: string[]) {
  return amounts.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

export function multiplyMoney(amountMinor: string, quantity: string) {
  if (!/^\d+$/.test(quantity)) throw new Error("Only whole-item quantities are supported");
  return (BigInt(amountMinor) * BigInt(quantity)).toString();
}

export function discountPercentage(priceMinor: string, previousPriceMinor: string | null) {
  if (!previousPriceMinor || BigInt(previousPriceMinor) <= BigInt(priceMinor)) return 0;
  return Number(((BigInt(previousPriceMinor) - BigInt(priceMinor)) * 100n) / BigInt(previousPriceMinor));
}
