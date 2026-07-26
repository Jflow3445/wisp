import { createCommerceClient } from "@nister/api-client";
import { z } from "zod";

import { useSessionStore } from "@/lib/session-store";
import { BuyerOrderSchema, BuyerSessionSchema, ProductSchema, type BuyerDataSource, type CheckoutPayload } from "./types";

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "https://market-api.nister.org";
const client = createCommerceClient({
  baseUrl,
  getAccessToken: async () => useSessionStore.getState().session?.accessToken ?? null,
});

function encodeSearch(search?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", "20");
  return params.toString();
}

export const apiBuyerDataSource: BuyerDataSource = {
  signIn: (input) =>
    client.object("/v1/buyer/auth/sign-in", BuyerSessionSchema, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listProducts: (search) => client.object(`/v1/catalog/products?${encodeSearch(search)}`, z.array(ProductSchema)),
  getProduct: (id) => client.object(`/v1/catalog/products/${encodeURIComponent(id)}`, ProductSchema),
  listOrders: () => client.object("/v1/buyer/orders", z.array(BuyerOrderSchema)),
  getOrder: (id) => client.object(`/v1/buyer/orders/${encodeURIComponent(id)}`, BuyerOrderSchema),
  placeOrder: (payload: CheckoutPayload) =>
    client.object("/v1/buyer/orders", BuyerOrderSchema, {
      method: "POST",
      body: JSON.stringify(payload),
      idempotencyKey: payload.idempotencyKey,
    }),
};
