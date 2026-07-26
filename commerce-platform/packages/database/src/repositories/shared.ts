import { createHash, randomUUID } from "node:crypto";

import type { Database } from "../connection.js";

export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DatabaseExecutor = Database | DatabaseTransaction;

export class PersistenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PersistenceError";
  }

  static notFound(message: string): PersistenceError {
    return new PersistenceError("RESOURCE_NOT_FOUND", message, 404);
  }
}

const QUANTITY_SCALE = 1_000_000n;

export const scaledQuantity = (value: string): bigint => {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match?.[2]) throw new Error("Quantity is not a fixed-precision decimal");
  const magnitude = BigInt(match[2]) * QUANTITY_SCALE + BigInt((match[3] ?? "").padEnd(6, "0"));
  return match[1] === "-" ? -magnitude : magnitude;
};

export const quantityFromScaled = (value: bigint): string => {
  const sign = value < 0n ? "-" : "";
  const magnitude = value < 0n ? -value : value;
  const whole = magnitude / QUANTITY_SCALE;
  const fraction = (magnitude % QUANTITY_SCALE).toString().padStart(6, "0");
  return `${sign}${whole}.${fraction}`;
};

export const addQuantities = (left: string, right: string): string =>
  quantityFromScaled(scaledQuantity(left) + scaledQuantity(right));

export const subtractQuantities = (left: string, right: string): string =>
  quantityFromScaled(scaledQuantity(left) - scaledQuantity(right));

export const multiplyMinorByQuantity = (amountMinor: bigint, quantity: string): bigint => {
  const unrounded = amountMinor * scaledQuantity(quantity);
  const adjustment = unrounded >= 0n ? QUANTITY_SCALE / 2n : -(QUANTITY_SCALE / 2n);
  return (unrounded + adjustment) / QUANTITY_SCALE;
};

export const formatMinor = (amountMinor: bigint, currency: string): string => {
  const numeric = Number(amountMinor);
  if (!Number.isSafeInteger(numeric)) throw new Error("Amount is too large to format safely");
  return new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(numeric / 100);
};

export const encodeCursor = (value: string): string => Buffer.from(value).toString("base64url");

export const decodeCursor = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
};

export const publicReference = (prefix: string): string =>
  `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Value cannot be hashed as JSON");
};

export const hashJson = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(asRecord) : [];

export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "23505";
