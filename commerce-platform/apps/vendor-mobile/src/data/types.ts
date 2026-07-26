import { MoneySchema, QuantitySchema, VendorOrderStatusSchema } from "@nister/contracts";
import { z } from "zod";

export const VendorSessionSchema = z.object({ accessToken: z.string().min(1), displayName: z.string().min(1), email: z.email() });
export const VendorScopeSchema = z.object({ vendorId: z.string().min(1), vendorName: z.string().min(1), locationId: z.string().min(1), locationName: z.string().min(1), role: z.string().min(1) });
export const DashboardSchema = z.object({
  newOrders: z.number().int().nonnegative(), dueSoon: z.number().int().nonnegative(), lowStock: z.number().int().nonnegative(), salesToday: MoneySchema,
});
export const VendorOrderLineSchema = z.object({ id: z.string(), name: z.string(), quantity: QuantitySchema, pickedQuantity: QuantitySchema });
export const VendorOrderSchema = z.object({
  id: z.uuid(), reference: z.string(), status: VendorOrderStatusSchema, version: z.number().int().positive(), customerName: z.string(), placedAt: z.iso.datetime(), respondBy: z.iso.datetime().nullable(),
  total: MoneySchema, deliveryMethod: z.enum(["DELIVERY", "PICKUP"]), lines: z.array(VendorOrderLineSchema), availableActions: z.array(z.enum(["ACCEPT", "REJECT", "START_PICKING", "MARK_READY"])),
});
export const InventoryItemSchema = z.object({
  id: z.uuid(), productName: z.string(), sku: z.string(), availableQuantity: QuantitySchema, lowStockAt: QuantitySchema, version: z.number().int().positive(), updatedAt: z.iso.datetime(),
});
export const FinanceSchema = z.object({
  availableBalance: MoneySchema, pendingBalance: MoneySchema, nextPayoutAt: z.iso.datetime().nullable(), lastSevenDays: MoneySchema,
  recentPayouts: z.array(z.object({ id: z.string(), reference: z.string(), amount: MoneySchema, status: z.enum(["PENDING", "PAID", "FAILED"]), createdAt: z.iso.datetime() })),
});

export type VendorScope = z.infer<typeof VendorScopeSchema>;
export type VendorOrder = z.infer<typeof VendorOrderSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export interface VendorDataSource {
  signIn(input: { email: string; password: string }): Promise<z.infer<typeof VendorSessionSchema>>;
  listScopes(): Promise<VendorScope[]>;
  dashboard(scope: VendorScope): Promise<z.infer<typeof DashboardSchema>>;
  listOrders(scope: VendorScope): Promise<VendorOrder[]>;
  getOrder(scope: VendorScope, id: string): Promise<VendorOrder>;
  transitionOrder(scope: VendorScope, input: { orderId: string; action: "ACCEPT" | "REJECT" | "START_PICKING" | "MARK_READY"; expectedVersion: number; reason?: string; idempotencyKey: string }): Promise<VendorOrder>;
  listInventory(scope: VendorScope): Promise<InventoryItem[]>;
  updateInventory(scope: VendorScope, input: { itemId: string; availableQuantity: string; expectedVersion: number; idempotencyKey: string }): Promise<InventoryItem>;
  finance(scope: VendorScope): Promise<z.infer<typeof FinanceSchema>>;
}
