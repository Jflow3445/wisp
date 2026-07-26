import { describe, expect, it } from "vitest";
import { cashObligationMachine, payoutMachine, refundMachine, userAccountMachine } from "./extended-machines.js";

describe("extended controlled workflows", () => {
  it("makes anonymisation terminal and evidence-gated", () => {
    expect(() => userAccountMachine.transition({ currentState: "DELETION_PENDING", action: "ANONYMISE" })).toThrow(/evidence/);
    expect(userAccountMachine.availableActions("ANONYMISED")).toEqual([]);
  });

  it("does not mark a payout paid without provider evidence", () => {
    expect(() => payoutMachine.transition({ currentState: "PROCESSING", action: "MARK_PAID" })).toThrow(/evidence/);
  });

  it("sends an ambiguous refund to manual review instead of retrying automatically", () => {
    expect(refundMachine.transition({ currentState: "PROCESSING", action: "REQUIRE_MANUAL_REVIEW", reason: "Provider timeout" })).toBe("MANUAL_REVIEW");
  });

  it("requires approval evidence to write off driver cash", () => {
    expect(() => cashObligationMachine.transition({ currentState: "OVERDUE", action: "WRITE_OFF", reason: "Approved loss" })).toThrow(/evidence/);
  });
});
