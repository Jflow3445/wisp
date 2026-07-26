import { createCommerceClient } from "@nister/api-client";
import { z } from "zod";

import { useSessionStore } from "@/lib/session-store";
import { DashboardSchema, FinanceSchema, InventoryItemSchema, VendorOrderSchema, VendorScopeSchema, VendorSessionSchema, type VendorDataSource } from "./types";

const client = createCommerceClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://market-api.nister.org",
  getAccessToken: async () => useSessionStore.getState().session?.accessToken ?? null,
});
const scopeQuery = (scope: { vendorId: string; locationId: string }) => `vendorId=${encodeURIComponent(scope.vendorId)}&locationId=${encodeURIComponent(scope.locationId)}`;

export const apiVendorDataSource: VendorDataSource = {
  signIn: (input) => client.object("/v1/vendor/auth/sign-in", VendorSessionSchema, { method: "POST", body: JSON.stringify(input) }),
  listScopes: () => client.object("/v1/vendor/scopes", z.array(VendorScopeSchema)),
  dashboard: (scope) => client.object(`/v1/vendor/dashboard?${scopeQuery(scope)}`, DashboardSchema),
  listOrders: (scope) => client.object(`/v1/vendor/orders?${scopeQuery(scope)}&limit=30`, z.array(VendorOrderSchema)),
  getOrder: (scope, id) => client.object(`/v1/vendor/orders/${encodeURIComponent(id)}?${scopeQuery(scope)}`, VendorOrderSchema),
  transitionOrder: (scope, input) => client.object(`/v1/vendor/orders/${encodeURIComponent(input.orderId)}/transitions?${scopeQuery(scope)}`, VendorOrderSchema, { method: "POST", body: JSON.stringify(input), idempotencyKey: input.idempotencyKey }),
  listInventory: (scope) => client.object(`/v1/vendor/inventory?${scopeQuery(scope)}&limit=50`, z.array(InventoryItemSchema)),
  updateInventory: (scope, input) => client.object(`/v1/vendor/inventory/${encodeURIComponent(input.itemId)}?${scopeQuery(scope)}`, InventoryItemSchema, { method: "PATCH", body: JSON.stringify(input), idempotencyKey: input.idempotencyKey }),
  finance: (scope) => client.object(`/v1/vendor/finance/summary?${scopeQuery(scope)}`, FinanceSchema),
};
