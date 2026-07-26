import { describe, expect, it } from "vitest";
import { addMoney, discountPercentage, formatMoney, multiplyMoney } from "./money";

describe("minor-unit money helpers", () => {
  it("formats Ghana cedis without floating point arithmetic", () => {
    expect(formatMoney("18900")).toBe("GH₵ 189.00");
    expect(formatMoney("5")).toBe("GH₵ 0.05");
    expect(formatMoney("-250")).toBe("-GH₵ 2.50");
  });

  it("adds and multiplies integer minor units exactly", () => {
    expect(addMoney("999999999999999999", "1")).toBe("1000000000000000000");
    expect(multiplyMoney("18900", "3")).toBe("56700");
    expect(() => multiplyMoney("100", "1.5")).toThrow("whole-item quantities");
  });

  it("calculates whole discount percentages", () => {
    expect(discountPercentage("18900", "22000")).toBe(14);
    expect(discountPercentage("22000", null)).toBe(0);
  });
});
