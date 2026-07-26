const SCALE_DIGITS = 6;
const SCALE = 1_000_000n;

function scaledDecimal(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match?.[2]) throw new Error("Value is not a fixed-precision decimal");
  const fraction = (match[3] ?? "").padEnd(SCALE_DIGITS, "0");
  const magnitude = BigInt(match[2]) * SCALE + BigInt(fraction);
  return match[1] === "-" ? -magnitude : magnitude;
}

function decimalString(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  const whole = magnitude / SCALE;
  const fraction = (magnitude % SCALE).toString().padStart(SCALE_DIGITS, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function addDecimals(left: string, right: string): string {
  return decimalString(scaledDecimal(left) + scaledDecimal(right));
}
