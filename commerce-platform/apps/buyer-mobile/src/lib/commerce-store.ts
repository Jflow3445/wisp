import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStore } from "zustand";
import { createCommerceStore, type CommerceState } from "./commerce-store-core";

export const commerceStore = createCommerceStore(AsyncStorage);
export const useCommerceStore = <T>(selector: (state: CommerceState) => T): T => useStore(commerceStore, selector);
export { cartTotal, createCommerceStore } from "./commerce-store-core";
export type { CartLine, CheckoutDraft, CommerceState } from "./commerce-store-core";
