import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export interface VendorScope { vendorId: string; vendorName: string; locationId: string; locationName: string; role: string; }
export interface VendorLocalState {
  scope: VendorScope | null;
  inventoryDrafts: Record<string, string>;
  setScope: (scope: VendorScope) => void;
  clearScope: () => void;
  setInventoryDraft: (itemId: string, quantity: string) => void;
  clearInventoryDraft: (itemId: string) => void;
}

export function createVendorStore(storage: StateStorage = AsyncStorage) {
  return createStore<VendorLocalState>()(persist((set) => ({
    scope: null,
    inventoryDrafts: {},
    setScope: (scope) => set({ scope }),
    clearScope: () => set({ scope: null, inventoryDrafts: {} }),
    setInventoryDraft: (itemId, quantity) => set((state) => ({ inventoryDrafts: { ...state.inventoryDrafts, [itemId]: quantity } })),
    clearInventoryDraft: (itemId) => set((state) => { const inventoryDrafts = { ...state.inventoryDrafts }; delete inventoryDrafts[itemId]; return { inventoryDrafts }; }),
  }), { name: "nister-vendor-local-v1", storage: createJSONStorage(() => storage) }));
}

export const vendorStore = createVendorStore();
export const useVendorStore = <T>(selector: (state: VendorLocalState) => T): T => useStore(vendorStore, selector);
