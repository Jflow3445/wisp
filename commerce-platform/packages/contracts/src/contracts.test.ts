import { describe, expect, it } from "vitest";
import { AddressSchema, CriticalHeadersSchema, MoneySchema } from "./index.js";

describe("canonical contracts", () => {
  it("keeps API money values exact by accepting integer strings", () => {
    expect(MoneySchema.parse({ amountMinor: "10550", currency: "ghs", formatted: "GHS 105.50" })).toEqual({
      amountMinor: "10550",
      currency: "GHS",
      formatted: "GHS 105.50",
    });
  });

  it("requires idempotency on critical commands", () => {
    expect(() => CriticalHeadersSchema.parse({})).toThrow();
  });

  it("requires a usable Ghana delivery landmark", () => {
    expect(() =>
      AddressSchema.parse({
        recipientName: "Ama Mensah",
        phone: "+233201234567",
        countryCode: "GH",
        region: "Greater Accra",
        city: "Accra",
        latitude: 5.6037,
        longitude: -0.187,
        landmark: "x",
        addressType: "HOME",
      }),
    ).toThrow();
  });
});
