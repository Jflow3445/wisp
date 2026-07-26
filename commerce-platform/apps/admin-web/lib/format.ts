export function formatMoney(amountMinor: string, currency = "GHS"): string {
  const negative = amountMinor.startsWith("-");
  const absolute = BigInt(negative ? amountMinor.slice(1) : amountMinor);
  const major = absolute / 100n;
  const minor = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${currency} ${major.toLocaleString("en-US")}.${minor}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Accra" }).format(new Date(value));
}

export function humanizeStatus(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}
