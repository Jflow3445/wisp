import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStore } from "zustand";
import { createVendorStore, type VendorLocalState } from "./vendor-store-core";

export const vendorStore = createVendorStore(AsyncStorage);
export const useVendorStore = <T>(selector: (state: VendorLocalState) => T): T => useStore(vendorStore, selector);
export { createVendorStore } from "./vendor-store-core";
export type { VendorLocalState, VendorScope } from "./vendor-store-core";
