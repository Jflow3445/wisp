import { apiBuyerDataSource } from "./api";
import { demoBuyerDataSource } from "./demo";

export const dataMode = process.env.EXPO_PUBLIC_DATA_MODE === "demo" ? "demo" : "api";
export const buyerData = dataMode === "demo" ? demoBuyerDataSource : apiBuyerDataSource;
export type { BuyerDataSource, BuyerOrder, CheckoutPayload, Product } from "./types";
