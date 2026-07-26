export interface Money {
  amountMinor: bigint;
  currency: string;
}

export function money(amountMinor: bigint | number | string, currency = "GHS"): Money {
  return { amountMinor: BigInt(amountMinor), currency: currency.toUpperCase() };
}

function assertCurrency(left: Money, right: Money) {
  if (left.currency !== right.currency) {
    throw new Error(`Currency mismatch: ${left.currency} and ${right.currency}`);
  }
}

export function add(left: Money, right: Money): Money {
  assertCurrency(left, right);
  return money(left.amountMinor + right.amountMinor, left.currency);
}

export function subtract(left: Money, right: Money): Money {
  assertCurrency(left, right);
  return money(left.amountMinor - right.amountMinor, left.currency);
}

export function multiplyBasisPoints(value: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new Error("Basis points must be a non-negative integer");
  }
  return money((value.amountMinor * BigInt(basisPoints)) / 10_000n, value.currency);
}

export function allocate(value: Money, weights: readonly bigint[]): Money[] {
  if (weights.length === 0 || weights.some((weight) => weight < 0n)) {
    throw new Error("Allocation requires non-negative weights");
  }
  const totalWeight = weights.reduce((total, weight) => total + weight, 0n);
  if (totalWeight === 0n) {
    throw new Error("Allocation weight must be greater than zero");
  }

  let allocated = 0n;
  return weights.map((weight, index) => {
    const amount = index === weights.length - 1 ? value.amountMinor - allocated : (value.amountMinor * weight) / totalWeight;
    allocated += amount;
    return money(amount, value.currency);
  });
}

export function format(value: Money, locale = "en-GH"): string {
  const major = Number(value.amountMinor) / 100;
  if (!Number.isSafeInteger(Number(value.amountMinor))) {
    throw new Error("Amount is too large to format safely");
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency: value.currency }).format(major);
}
