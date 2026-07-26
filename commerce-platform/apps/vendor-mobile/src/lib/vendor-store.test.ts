import type { StateStorage } from "zustand/middleware";
import { describe, expect, it } from "vitest";

import { createVendorStore } from "./vendor-store";

function memoryStorage(): StateStorage {
  const values = new Map<string, string>();
  return { getItem: async (name) => values.get(name) ?? null, setItem: async (name, value) => void values.set(name, value), removeItem: async (name) => void values.delete(name) };
}

describe("vendor local persistence", () => {
  it("restores the selected location and unsent inventory drafts", async () => {
    const storage = memoryStorage();
    const first = createVendorStore(storage);
    first.getState().setScope({ vendorId: "vendor-1", vendorName: "Makola Foods", locationId: "location-1", locationName: "Accra Central", role: "Manager" });
    first.getState().setInventoryDraft("stock-1", "18");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const restored = createVendorStore(storage);
    await restored.persist.rehydrate();

    expect(restored.getState().scope?.locationName).toBe("Accra Central");
    expect(restored.getState().inventoryDrafts["stock-1"]).toBe("18");
  });
});
