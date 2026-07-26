import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal } from "../../common/auth.js";
import { IdempotencyService, InMemoryIdempotencyRepository } from "../../common/idempotency.js";
import {
  VendorOperationsService,
  type VendorOperationsRepository,
  type VendorOrderSummary,
} from "./vendor.module.js";

const userId = "11111111-1111-4111-8111-111111111111";
const vendorId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const principal: AuthenticatedPrincipal = {
  subject: `development|${userId}`,
  userId,
  permissions: [],
  roles: [],
  vendorIds: [vendorId],
  authenticationMode: "development",
};

function repositoryFor(order: VendorOrderSummary): VendorOperationsRepository {
  return {
    listOrders: async (_vendorId, query) => ({ items: [order], pagination: { nextCursor: null, hasMore: false, limit: query.limit } }),
    findOrder: async () => ({ ...order }),
    transitionOrder: vi.fn(async (input) => ({ ...order, status: input.newState, version: order.version + 1 })),
    listInventory: async () => [],
    adjustInventory: async () => { throw new Error("not used"); },
  };
}

describe("vendor order flow", () => {
  it("applies and replays a named vendor-order transition", async () => {
    const repository = repositoryFor({
      id: orderId,
      publicReference: "VO-1001",
      status: "AWAITING_VENDOR_RESPONSE",
      version: 1,
      itemCount: 2,
      totalAmountMinor: "5000",
      currency: "GHS",
    });
    const service = new VendorOperationsService(repository, new IdempotencyService(new InMemoryIdempotencyRepository()));
    const command = { action: "ACCEPT" as const, expectedVersion: 1 };
    const first = await service.transitionOrder(principal, vendorId, orderId, command, "vendor-order-key");
    const replay = await service.transitionOrder(principal, vendorId, orderId, command, "vendor-order-key");
    expect(first.status).toBe("ACCEPTED");
    expect(replay).toEqual(first);
    expect(repository.transitionOrder).toHaveBeenCalledTimes(1);
  });

  it("requires a reason for rejection", async () => {
    const repository = repositoryFor({
      id: orderId,
      publicReference: "VO-1001",
      status: "AWAITING_VENDOR_RESPONSE",
      version: 1,
      itemCount: 2,
      totalAmountMinor: "5000",
      currency: "GHS",
    });
    const service = new VendorOperationsService(repository, new IdempotencyService(new InMemoryIdempotencyRepository()));
    await expect(service.transitionOrder(
      principal,
      vendorId,
      orderId,
      { action: "REJECT", expectedVersion: 1 },
      "vendor-reject-key",
    )).rejects.toThrow(/requires a reason/);
  });
});
