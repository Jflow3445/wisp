import type { Money } from "@nister/money";
import { format, money } from "@nister/money";
import type { MoneyDto } from "@nister/contracts";

const QUANTITY_SCALE = 1_000_000n;

export function moneyDto(value: Money): MoneyDto {
  return {
    amountMinor: value.amountMinor.toString(),
    currency: value.currency,
    formatted: format(value),
  };
}

export function multiplyByQuantity(unitPrice: Money, quantity: string): Money {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(quantity);
  if (!match?.[2]) throw new Error("Quantity is not a fixed-precision decimal");
  const fraction = (match[3] ?? "").padEnd(6, "0");
  const sign = match[1] === "-" ? -1n : 1n;
  const scaledQuantity = sign * (BigInt(match[2]) * QUANTITY_SCALE + BigInt(fraction));
  const unrounded = unitPrice.amountMinor * scaledQuantity;
  const adjustment = unrounded >= 0n ? QUANTITY_SCALE / 2n : -(QUANTITY_SCALE / 2n);
  return money((unrounded + adjustment) / QUANTITY_SCALE, unitPrice.currency);
}
