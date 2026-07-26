import { describe, expect, it } from "vitest";
import { can, type Principal } from "./index.js";

const vendorUser: Principal = {
  userId: "user-1",
  status: "ACTIVE",
  grants: [{ permission: "vendor.order.read", scope: "VENDOR", scopeId: "vendor-1" }],
  vendorIds: ["vendor-1"],
  storeIds: [],
};

describe("scoped permissions", () => {
  it("allows the matching vendor only", () => {
    expect(can(vendorUser, "vendor.order.read", { vendorId: "vendor-1" })).toBe(true);
    expect(can(vendorUser, "vendor.order.read", { vendorId: "vendor-2" })).toBe(false);
  });

  it("rejects every action for suspended principals", () => {
    expect(can({ ...vendorUser, status: "SUSPENDED" }, "vendor.order.read", { vendorId: "vendor-1" })).toBe(false);
  });
});
