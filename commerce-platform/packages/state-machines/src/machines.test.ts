import { describe, expect, it } from "vitest";
import { checkoutMachine, deliveryMachine, paymentMachine, productMachine, vendorOrderMachine } from "./machines.js";

describe("controlled state machines", () => {
  it("forbids skipping checkout validation", () => {
    expect(() => checkoutMachine.transition({ currentState: "CREATED", action: "START_PAYMENT" })).toThrow(
      /Cannot START_PAYMENT/,
    );
  });

  it("requires rejection reasons", () => {
    expect(() => productMachine.transition({ currentState: "UNDER_REVIEW", action: "REJECT" })).toThrow(
      /requires a reason/,
    );
  });

  it("accepts verified payment from a pending provider state", () => {
    expect(
      paymentMachine.transition({
        currentState: "PENDING",
        action: "CONFIRM_SUCCESS",
        evidence: { providerEventId: "evt_123" },
      }),
    ).toBe("SUCCESSFUL");
  });

  it("requires proof for vendor handover and delivery completion", () => {
    expect(() => vendorOrderMachine.transition({ currentState: "READY_FOR_PICKUP", action: "HAND_OVER" })).toThrow(
      /requires evidence/,
    );
    expect(() => deliveryMachine.transition({ currentState: "ARRIVED_AT_CUSTOMER", action: "COMPLETE" })).toThrow(
      /requires evidence/,
    );
  });

  it("advertises only actions permitted from the current state", () => {
    expect(paymentMachine.availableActions("SUCCESSFUL").sort()).toEqual(
      ["FULL_REFUND", "PARTIAL_REFUND", "REVERSE"].sort(),
    );
  });
});
