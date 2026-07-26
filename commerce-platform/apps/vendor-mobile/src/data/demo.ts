import { DashboardSchema, FinanceSchema, InventoryItemSchema, VendorOrderSchema, VendorScopeSchema, VendorSessionSchema, type InventoryItem, type VendorDataSource, type VendorOrder } from "./types";

const scopes = [
  VendorScopeSchema.parse({ vendorId: "vendor-demo", vendorName: "Makola Foods", locationId: "accra-central", locationName: "Accra Central", role: "Manager" }),
  VendorScopeSchema.parse({ vendorId: "vendor-demo", vendorName: "Makola Foods", locationId: "east-legon", locationName: "East Legon", role: "Manager" }),
];
const now = Date.now();
const orders: VendorOrder[] = [
  VendorOrderSchema.parse({
    id: "e9451724-cb29-42be-8310-84b2069183f7", reference: "NVO-4821", status: "AWAITING_VENDOR_RESPONSE", version: 1, customerName: "A. Mensah", placedAt: new Date(now - 8 * 60_000).toISOString(), respondBy: new Date(now + 7 * 60_000).toISOString(), total: { amountMinor: "12800", currency: "GHS", formatted: "GH\u20b5 128.00" }, deliveryMethod: "DELIVERY",
    lines: [{ id: "line-rice", name: "Ghana rice, 5 kg", quantity: "1", pickedQuantity: "0" }, { id: "line-soap", name: "Shea bathing soap, 4 pack", quantity: "1", pickedQuantity: "0" }], availableActions: ["ACCEPT", "REJECT"],
  }),
  VendorOrderSchema.parse({
    id: "754f477d-b959-43d0-b43e-3716ea97fa90", reference: "NVO-4818", status: "PREPARING", version: 3, customerName: "K. Owusu", placedAt: new Date(now - 48 * 60_000).toISOString(), respondBy: null, total: { amountMinor: "16400", currency: "GHS", formatted: "GH\u20b5 164.00" }, deliveryMethod: "DELIVERY",
    lines: [{ id: "line-rice-2", name: "Ghana rice, 5 kg", quantity: "2", pickedQuantity: "1" }], availableActions: ["MARK_READY"],
  }),
  VendorOrderSchema.parse({
    id: "1a195d51-9dd7-4587-b8c9-ac82a0b5668a", reference: "NVO-4814", status: "ACCEPTED", version: 2, customerName: "E. Addo", placedAt: new Date(now - 75 * 60_000).toISOString(), respondBy: null, total: { amountMinor: "8200", currency: "GHS", formatted: "GH\u20b5 82.00" }, deliveryMethod: "PICKUP",
    lines: [{ id: "line-rice-3", name: "Ghana rice, 5 kg", quantity: "1", pickedQuantity: "0" }], availableActions: ["START_PICKING"],
  }),
];
const inventory: InventoryItem[] = [
  InventoryItemSchema.parse({ id: "381a5a9d-bceb-4e7e-ac47-9f907336a540", productName: "Ghana rice, 5 kg", sku: "RICE-GH-5", availableQuantity: "24", lowStockAt: "8", version: 4, updatedAt: new Date(now - 20 * 60_000).toISOString() }),
  InventoryItemSchema.parse({ id: "bc8f95da-1968-4515-a634-1edcf0902359", productName: "Brown rice, 2 kg", sku: "RICE-BR-2", availableQuantity: "3", lowStockAt: "5", version: 7, updatedAt: new Date(now - 55 * 60_000).toISOString() }),
  InventoryItemSchema.parse({ id: "6bcf2fe2-f757-492e-862e-6b965a5c06d0", productName: "Groundnut paste, 500 g", sku: "GNUT-500", availableQuantity: "0", lowStockAt: "4", version: 3, updatedAt: new Date(now - 2 * 60 * 60_000).toISOString() }),
];
const pause = () => new Promise((resolve) => setTimeout(resolve, 160));

export const demoVendorDataSource: VendorDataSource = {
  async signIn() { await pause(); return VendorSessionSchema.parse({ accessToken: "demo-vendor-token", displayName: "Kojo Asare", email: "manager@example.com" }); },
  async listScopes() { await pause(); return scopes; },
  async dashboard() { await pause(); return DashboardSchema.parse({ newOrders: orders.filter((order) => order.status === "AWAITING_VENDOR_RESPONSE").length, dueSoon: 1, lowStock: inventory.filter((item) => Number(item.availableQuantity) <= Number(item.lowStockAt)).length, salesToday: { amountMinor: "148250", currency: "GHS", formatted: "GH\u20b5 1,482.50" } }); },
  async listOrders() { await pause(); return orders; },
  async getOrder(_scope, id) { await pause(); const order = orders.find((item) => item.id === id); if (!order) throw new Error("Order not found"); return order; },
  async transitionOrder(_scope, input) {
    await pause();
    const index = orders.findIndex((item) => item.id === input.orderId);
    const current = orders[index];
    if (!current) throw new Error("Order not found");
    if (current.version !== input.expectedVersion) throw new Error("VERSION_CONFLICT");
    const nextByAction = { ACCEPT: "ACCEPTED", REJECT: "REJECTED", START_PICKING: "PREPARING", MARK_READY: "READY_FOR_PICKUP" } as const;
    const actionsByStatus = { ACCEPTED: ["START_PICKING"], REJECTED: [], PREPARING: ["MARK_READY"], READY_FOR_PICKUP: [] } as const;
    const status = nextByAction[input.action];
    const updated = VendorOrderSchema.parse({ ...current, status, version: current.version + 1, respondBy: null, availableActions: [...actionsByStatus[status]] });
    orders[index] = updated;
    return updated;
  },
  async listInventory() { await pause(); return inventory; },
  async updateInventory(_scope, input) {
    await pause();
    const index = inventory.findIndex((item) => item.id === input.itemId);
    const current = inventory[index];
    if (!current) throw new Error("Inventory item not found");
    if (current.version !== input.expectedVersion) throw new Error("VERSION_CONFLICT");
    const updated = InventoryItemSchema.parse({ ...current, availableQuantity: input.availableQuantity, version: current.version + 1, updatedAt: new Date().toISOString() });
    inventory[index] = updated;
    return updated;
  },
  async finance() { await pause(); return FinanceSchema.parse({ availableBalance: { amountMinor: "284600", currency: "GHS", formatted: "GH\u20b5 2,846.00" }, pendingBalance: { amountMinor: "61500", currency: "GHS", formatted: "GH\u20b5 615.00" }, nextPayoutAt: new Date(now + 24 * 60 * 60_000).toISOString(), lastSevenDays: { amountMinor: "894320", currency: "GHS", formatted: "GH\u20b5 8,943.20" }, recentPayouts: [{ id: "payout-1", reference: "PAY-10082", amount: { amountMinor: "241000", currency: "GHS", formatted: "GH\u20b5 2,410.00" }, status: "PAID", createdAt: new Date(now - 3 * 24 * 60 * 60_000).toISOString() }] }); },
};
