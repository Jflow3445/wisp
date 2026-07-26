import { apiVendorDataSource } from "./api";
import { demoVendorDataSource } from "./demo";

export const dataMode = process.env.EXPO_PUBLIC_DATA_MODE === "demo" ? "demo" : "api";
export const vendorData = dataMode === "demo" ? demoVendorDataSource : apiVendorDataSource;
export type { InventoryItem, VendorDataSource, VendorOrder, VendorScope } from "./types";
