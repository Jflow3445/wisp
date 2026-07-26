import { describe, expect, it } from "vitest";
import { add, allocate, money, multiplyBasisPoints } from "./index.js";

describe("money", () => {
  it("never loses a minor unit during weighted allocation", () => {
    const parts = allocate(money(100n), [1n, 1n, 1n]);
    expect(parts.map((part) => part.amountMinor)).toEqual([33n, 33n, 34n]);
    expect(parts.reduce((total, part) => total + part.amountMinor, 0n)).toBe(100n);
  });

  it("calculates commissions using integer basis points", () => {
    expect(multiplyBasisPoints(money(10_550n), 1_250).amountMinor).toBe(1_318n);
  });

  it("rejects mixed currencies", () => {
    expect(() => add(money(1n, "GHS"), money(1n, "USD"))).toThrow(/Currency mismatch/);
  });
});
