import { money } from "@nister/money";
import { describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "../../common/auth.js";
import { IdempotencyService, InMemoryIdempotencyRepository } from "../../common/idempotency.js";
import type { CartRepository } from "../cart/cart.module.js";
import { CheckoutService, InMemoryCheckoutRepository } from "./checkout.module.js";

const buyerId = "11111111-1111-4111-8111-111111111111";
const cartId = "55555555-5555-4555-8555-555555555555";
const principal: AuthenticatedPrincipal = {
  subject: `development|${buyerId}`,
  userId: buyerId,
  permissions: [],
  roles: [],
  vendorIds: [],
  authenticationMode: "development",
};

describe("checkout flow", () => {
  it("creates READY exactly once for an idempotent cart version", async () => {
    const carts: CartRepository = {
      getOrCreateForBuyer: async () => { throw new Error("not used"); },
      addItem: async () => { throw new Error("not used"); },
      findByIdForBuyer: async () => ({
        id: cartId,
        buyerId,
        version: 2,
        currency: "GHS",
        items: [{
          id: "66666666-6666-4666-8666-666666666666",
          offerId: "77777777-7777-4777-8777-777777777777",
          vendorId: "22222222-2222-4222-8222-222222222222",
          productName: "Test product",
          quantity: "1",
          unitPrice: money(2_500n),
          lineTotal: money(2_500n),
        }],
        total: money(2_500n),
      }),
    };
    const service = new CheckoutService(
      new InMemoryCheckoutRepository(carts),
      new IdempotencyService(new InMemoryIdempotencyRepository()),
    );
    const input = { cartId, cartVersion: 2, currency: "GHS" as const };
    const first = await service.create(principal, input, "checkout-key");
    const replay = await service.create(principal, input, "checkout-key");
    expect(first).toMatchObject({ status: "READY", cartVersion: 2, total: { amountMinor: "2500" } });
    expect(replay.id).toBe(first.id);
  });

  it("rejects a stale cart version", async () => {
    const carts = {
      findByIdForBuyer: async () => ({ id: cartId, buyerId, version: 3, currency: "GHS", items: [{}], total: money(0n) }),
    } as unknown as CartRepository;
    const service = new CheckoutService(
      new InMemoryCheckoutRepository(carts),
      new IdempotencyService(new InMemoryIdempotencyRepository()),
    );
    await expect(service.create(principal, { cartId, cartVersion: 2, currency: "GHS" }, "stale-cart-key")).rejects.toMatchObject({
      code: "CART_CHANGED",
    });
  });
});
