import { apiDriverDataSource } from "./api";
import { demoDriverDataSource } from "./demo";

export const dataMode = process.env.EXPO_PUBLIC_DATA_MODE === "demo" ? "demo" : "api";
export const driverData = dataMode === "demo" ? demoDriverDataSource : apiDriverDataSource;
export type { DeliveryAction, DeliveryOffer, DriverDataSource, DriverDelivery, DriverHome, DriverSession, OfflineEvent } from "./types";
