import type { StateStorage } from "zustand/middleware";
import { beforeEach, describe, expect, it } from "vitest";

import { createCommerceStore } from "./commerce-store";

function memoryStorage(): StateStorage {
  const values = new Map<string, string>();
  return {
    getItem: async (name) => values.get(name) ?? null,
    setItem: async (name, value) => void values.set(name, value),
    removeItem: async (name) => void values.delete(name),
  };
}

describe("buyer commerce persistence", () => {
  let storage: StateStorage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("restores cart lines and an in-progress checkout step", async () => {
    const first = createCommerceStore(storage);
    first.getState().addLine({
      offerId: "offer-1",
      productId: "product-1",
      name: "Local rice",
      vendorName: "Makola Foods",
      unitPrice: { amountMinor: "3200", currency: "GHS", formatted: "GH\u20b5 32.00" },
    });
    first.getState().patchCheckout({ recipientName: "Ama Mensah", landmark: "Near the pharmacy", step: "review" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const restored = createCommerceStore(storage);
    await restored.persist.rehydrate();

    expect(restored.getState().lines).toHaveLength(1);
    expect(restored.getState().checkout).toMatchObject({ recipientName: "Ama Mensah", landmark: "Near the pharmacy", step: "review" });
  });

  it("clears cart and checkout only after order completion", () => {
    const store = createCommerceStore(storage);
    store.getState().patchCheckout({ phone: "+233201234567", step: "review" });
    store.getState().clearAfterOrder();

    expect(store.getState().lines).toEqual([]);
    expect(store.getState().checkout.step).toBe("delivery");
    expect(store.getState().checkout.phone).toBe("");
  });
});
