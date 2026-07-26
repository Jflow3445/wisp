import { describe, expect, it } from "vitest";
import { assertBalancedJournal, paymentCaptured, reverseJournal, vendorOrderAccepted } from "./index.js";

describe("financial ledger", () => {
  it("creates a balanced payment capture", () => {
    const journal = paymentCaptured({ sourceEventId: "evt-1", entityId: "pay-1", paymentId: "pay-1", amountMinor: 11_000n, currency: "GHS" });
    expect(() => assertBalancedJournal(journal)).not.toThrow();
  });

  it("allocates vendor net and commission without losing money", () => {
    const journal = vendorOrderAccepted({ sourceEventId: "evt-2", entityId: "vo-1", vendorOrderId: "vo-1", vendorId: "v-1", vendorNetMinor: 9_000n, commissionMinor: 1_000n, currency: "GHS" });
    expect(() => assertBalancedJournal(journal)).not.toThrow();
  });

  it("reverses every entry instead of partially editing a posting", () => {
    const original = paymentCaptured({ sourceEventId: "evt-1", entityId: "pay-1", paymentId: "pay-1", amountMinor: 11_000n, currency: "GHS" });
    const reversal = reverseJournal(original, "txn-1", "evt-reverse-1");
    expect(reversal.reversesTransactionId).toBe("txn-1");
    expect(reversal.entries.map((item) => item.direction)).toEqual(["CREDIT", "DEBIT"]);
    expect(() => assertBalancedJournal(reversal)).not.toThrow();
  });
});
