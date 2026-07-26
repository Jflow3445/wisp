import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, gt, inArray, max, sql } from "drizzle-orm";

import type { Database } from "../connection.js";
import {
  auditLogs,
  inventoryItems,
  inventoryMovements,
  orderItems,
  orders,
  orderStatusHistory,
  outboxEvents,
  payments,
  products,
  productVariants,
  stockLocations,
  users,
  vendorApplications,
  vendorOffers,
  vendorOrders,
  vendors,
} from "../schema.js";
import {
  addQuantities,
  decodeCursor,
  encodeCursor,
  PersistenceError,
  scaledQuantity,
} from "./shared.js";

export interface OperationsPageResult<T> {
  items: T[];
  pagination: { nextCursor: string | null; hasMore: boolean; limit: number };
}

export interface VendorOrderSummaryRecord {
  id: string;
  publicReference: string;
  status: typeof vendorOrders.$inferSelect.status;
  version: number;
  itemCount: number;
  totalAmountMinor: string;
  currency: string;
}

export interface InventorySummaryRecord {
  offerId: string;
  productName: string;
  availableQuantity: string;
  reservedQuantity: string;
  version: number;
}

const orderSummarySelection = {
  id: vendorOrders.id,
  publicReference: vendorOrders.publicReference,
  status: vendorOrders.status,
  version: vendorOrders.version,
  itemCount: sql<number>`count(${orderItems.id})::integer`,
  totalAmountMinor: sql<string>`(${vendorOrders.subtotalMinor} - ${vendorOrders.discountMinor} + ${vendorOrders.taxMinor} + ${vendorOrders.deliveryMinor})::text`,
  currency: orders.currency,
};

const toOrderSummary = (row: {
  id: string;
  publicReference: string;
  status: typeof vendorOrders.$inferSelect.status;
  version: number;
  itemCount: number;
  totalAmountMinor: string;
  currency: string;
}): VendorOrderSummaryRecord => row;

const findOrderSummary = async (
  db: Database,
  vendorId: string,
  orderId: string,
): Promise<VendorOrderSummaryRecord | null> => {
  const [row] = await db
    .select(orderSummarySelection)
    .from(vendorOrders)
    .innerJoin(orders, eq(orders.id, vendorOrders.orderId))
    .leftJoin(orderItems, eq(orderItems.vendorOrderId, vendorOrders.id))
    .where(and(eq(vendorOrders.vendorId, vendorId), eq(vendorOrders.id, orderId)))
    .groupBy(vendorOrders.id, orders.currency)
    .limit(1);
  return row ? toOrderSummary(row) : null;
};

const availableInventoryQuantity = sql<string>`greatest(sum(${inventoryItems.physicalQuantity} - ${inventoryItems.reservedQuantity} - ${inventoryItems.damagedQuantity} - ${inventoryItems.safetyQuantity}), 0)::numeric(18, 6)::text`;
const reservedInventoryQuantity = sql<string>`sum(${inventoryItems.reservedQuantity})::numeric(18, 6)::text`;

const listInventorySummary = async (db: Database, vendorId: string): Promise<InventorySummaryRecord[]> => {
  const rows = await db
    .select({
      offerId: vendorOffers.id,
      productName: products.name,
      availableQuantity: availableInventoryQuantity,
      reservedQuantity: reservedInventoryQuantity,
      version: max(inventoryItems.version),
    })
    .from(inventoryItems)
    .innerJoin(vendorOffers, eq(vendorOffers.id, inventoryItems.vendorOfferId))
    .innerJoin(productVariants, eq(productVariants.id, vendorOffers.productVariantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(stockLocations, eq(stockLocations.id, inventoryItems.stockLocationId))
    .where(and(eq(vendorOffers.vendorId, vendorId), eq(stockLocations.status, "ACTIVE")))
    .groupBy(vendorOffers.id, products.name)
    .orderBy(asc(products.name), asc(vendorOffers.id));
  return rows.map((row) => ({ ...row, version: row.version ?? 1 }));
};

export class PostgresVendorOperationsRepository {
  constructor(private readonly db: Database) {}

  async listOrders(
    vendorId: string,
    query: { cursor?: string; limit: number },
  ): Promise<OperationsPageResult<VendorOrderSummaryRecord>> {
    const cursor = decodeCursor(query.cursor);
    const rows = await this.db
      .select(orderSummarySelection)
      .from(vendorOrders)
      .innerJoin(orders, eq(orders.id, vendorOrders.orderId))
      .leftJoin(orderItems, eq(orderItems.vendorOrderId, vendorOrders.id))
      .where(and(eq(vendorOrders.vendorId, vendorId), cursor ? gt(vendorOrders.id, cursor) : undefined))
      .groupBy(vendorOrders.id, orders.currency)
      .orderBy(asc(vendorOrders.id))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    const selected = rows.slice(0, query.limit).map(toOrderSummary);
    return {
      items: selected,
      pagination: {
        nextCursor: hasMore && selected.length ? encodeCursor(selected[selected.length - 1]!.id) : null,
        hasMore,
        limit: query.limit,
      },
    };
  }

  async findOrder(vendorId: string, orderId: string): Promise<VendorOrderSummaryRecord | null> {
    return findOrderSummary(this.db, vendorId, orderId);
  }

  transitionOrder(input: {
    vendorId: string;
    orderId: string;
    expectedVersion: number;
    expectedState: typeof vendorOrders.$inferSelect.status;
    newState: typeof vendorOrders.$inferSelect.status;
    actorUserId: string;
    reason?: string | null;
    evidence?: Record<string, unknown> | null;
    idempotencyKey: string;
  }): Promise<VendorOrderSummaryRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const [order] = await db
        .select()
        .from(vendorOrders)
        .where(and(eq(vendorOrders.id, input.orderId), eq(vendorOrders.vendorId, input.vendorId)))
        .for("update")
        .limit(1);
      if (!order) throw PersistenceError.notFound("Vendor order not found");
      if (order.version !== input.expectedVersion || order.status !== input.expectedState) {
        throw new PersistenceError("VERSION_CONFLICT", "Vendor order changed before transition", 409);
      }
      const now = new Date();
      const timestamps: Partial<typeof vendorOrders.$inferInsert> = {};
      if (input.newState === "ACCEPTED") timestamps.acceptedAt = now;
      if (input.newState === "REJECTED") timestamps.rejectedAt = now;
      if (input.newState === "READY_FOR_PICKUP") timestamps.readyAt = now;
      if (input.newState === "DELIVERED") timestamps.deliveredAt = now;
      const [updated] = await db
        .update(vendorOrders)
        .set({ ...timestamps, status: input.newState, version: order.version + 1, updatedAt: now })
        .where(eq(vendorOrders.id, order.id))
        .returning();
      const requestId = randomUUID();
      await db.insert(orderStatusHistory).values({
        id: randomUUID(),
        vendorOrderId: order.id,
        previousStatus: order.status,
        newStatus: input.newState,
        action: "VENDOR_TRANSITION",
        actorType: "USER",
        actorUserId: input.actorUserId,
        reasonText: input.reason,
        requestId,
        idempotencyKey: input.idempotencyKey,
        metadata: { evidence: input.evidence ?? null },
      });
      await db.insert(auditLogs).values({
        id: randomUUID(),
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: "vendor_order.transitioned",
        entityType: "VENDOR_ORDER",
        entityId: order.id,
        reason: input.reason,
        beforeData: { status: order.status, version: order.version },
        afterData: { status: input.newState, version: updated!.version },
        metadata: { evidence: input.evidence ?? null, requestId },
      });
      await db.insert(outboxEvents).values({
        id: randomUUID(),
        aggregateType: "VENDOR_ORDER",
        aggregateId: order.id,
        eventType: "VendorOrderTransitioned",
        eventVersion: updated!.version,
        payload: { vendorOrderId: order.id, previousStatus: order.status, status: input.newState },
      });
      return (await findOrderSummary(db, input.vendorId, input.orderId))!;
    });
  }

  async listInventory(vendorId: string): Promise<InventorySummaryRecord[]> {
    return listInventorySummary(this.db, vendorId);
  }

  adjustInventory(input: {
    vendorId: string;
    offerId: string;
    expectedVersion: number;
    delta: string;
    reason: string;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<InventorySummaryRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const [row] = await db
        .select({ inventory: inventoryItems })
        .from(inventoryItems)
        .innerJoin(vendorOffers, eq(vendorOffers.id, inventoryItems.vendorOfferId))
        .innerJoin(stockLocations, eq(stockLocations.id, inventoryItems.stockLocationId))
        .where(and(
          eq(vendorOffers.id, input.offerId),
          eq(vendorOffers.vendorId, input.vendorId),
          eq(stockLocations.status, "ACTIVE"),
        ))
        .orderBy(asc(inventoryItems.id))
        .for("update")
        .limit(1);
      if (!row) throw PersistenceError.notFound("Inventory offer not found");
      const item = row.inventory;
      if (item.version !== input.expectedVersion) {
        throw new PersistenceError("VERSION_CONFLICT", "Inventory changed before adjustment", 409);
      }
      const physicalAfter = addQuantities(item.physicalQuantity, input.delta);
      if (
        scaledQuantity(physicalAfter) < 0n ||
        scaledQuantity(physicalAfter) <
          scaledQuantity(item.reservedQuantity) + scaledQuantity(item.damagedQuantity) + scaledQuantity(item.safetyQuantity)
      ) {
        throw new PersistenceError("INSUFFICIENT_STOCK", "Adjustment would over-allocate stock", 409);
      }
      const [updated] = await db
        .update(inventoryItems)
        .set({ physicalQuantity: physicalAfter, version: item.version + 1, updatedAt: new Date() })
        .where(eq(inventoryItems.id, item.id))
        .returning();
      await db.insert(inventoryMovements).values({
        id: randomUUID(),
        inventoryItemId: item.id,
        movementType: "ADJUSTMENT",
        quantityChange: input.delta,
        physicalBefore: item.physicalQuantity,
        physicalAfter,
        reservedBefore: item.reservedQuantity,
        reservedAfter: item.reservedQuantity,
        reasonCode: "VENDOR_ADJUSTMENT",
        notes: input.reason,
        performedByUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      });
      await db.insert(auditLogs).values({
        id: randomUUID(),
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: "inventory.adjusted",
        entityType: "INVENTORY_ITEM",
        entityId: item.id,
        reason: input.reason,
        beforeData: { physicalQuantity: item.physicalQuantity, version: item.version },
        afterData: { physicalQuantity: physicalAfter, version: updated!.version },
        metadata: { offerId: input.offerId },
      });
      await db.insert(outboxEvents).values({
        id: randomUUID(),
        aggregateType: "INVENTORY_ITEM",
        aggregateId: item.id,
        eventType: "InventoryAdjusted",
        eventVersion: updated!.version,
        payload: { inventoryItemId: item.id, offerId: input.offerId, delta: input.delta },
      });
      const inventory = await listInventorySummary(db, input.vendorId);
      return inventory.find((candidate) => candidate.offerId === input.offerId)!;
    });
  }
}

export interface AdminOverviewRecord {
  generatedAt: string;
  users: { active: number; restricted: number };
  vendors: { pendingReview: number; active: number; suspended: number };
  orders: { awaitingVendor: number; processing: number; attentionRequired: number };
  payments: { pending: number; underReview: number };
}

export class PostgresAdminOverviewRepository {
  constructor(private readonly db: Database) {}

  async readOverview(): Promise<AdminOverviewRecord> {
    const [userCounts] = await this.db.select({
      active: sql<number>`count(*) filter (where ${users.status} = 'ACTIVE')::integer`,
      restricted: sql<number>`count(*) filter (where ${users.status} in ('RESTRICTED', 'SUSPENDED'))::integer`,
    }).from(users);
    const [vendorCounts] = await this.db.select({
      active: sql<number>`count(*) filter (where ${vendors.status} = 'APPROVED')::integer`,
      suspended: sql<number>`count(*) filter (where ${vendors.status} = 'SUSPENDED')::integer`,
    }).from(vendors);
    const [applicationCounts] = await this.db.select({
      pendingReview: sql<number>`count(*) filter (where ${vendorApplications.status} in ('SUBMITTED', 'UNDER_REVIEW'))::integer`,
    }).from(vendorApplications);
    const [orderCounts] = await this.db.select({
      awaitingVendor: sql<number>`count(*) filter (where ${vendorOrders.status} = 'AWAITING_VENDOR_RESPONSE')::integer`,
      processing: sql<number>`count(*) filter (where ${vendorOrders.status} in ('ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'HANDED_TO_DRIVER', 'OUT_FOR_DELIVERY'))::integer`,
      attentionRequired: sql<number>`count(*) filter (where ${vendorOrders.status} in ('REJECTED', 'CANCELLED', 'RETURN_REQUESTED'))::integer`,
    }).from(vendorOrders);
    const [paymentCounts] = await this.db.select({
      pending: sql<number>`count(*) filter (where ${payments.status} in ('CREATED', 'INITIALISED', 'PENDING', 'ACTION_REQUIRED'))::integer`,
      underReview: sql<number>`count(*) filter (where ${payments.status} = 'UNDER_REVIEW')::integer`,
    }).from(payments);
    return {
      generatedAt: new Date().toISOString(),
      users: userCounts ?? { active: 0, restricted: 0 },
      vendors: {
        pendingReview: applicationCounts?.pendingReview ?? 0,
        active: vendorCounts?.active ?? 0,
        suspended: vendorCounts?.suspended ?? 0,
      },
      orders: orderCounts ?? { awaitingVendor: 0, processing: 0, attentionRequired: 0 },
      payments: paymentCounts ?? { pending: 0, underReview: 0 },
    };
  }
}

export class PostgresReadinessRepository {
  constructor(private readonly db: Database) {}

  async check(): Promise<Record<string, "up" | "down">> {
    try {
      await this.db.execute(sql`select 1`);
      return { persistence: "up" };
    } catch {
      return { persistence: "down" };
    }
  }
}
