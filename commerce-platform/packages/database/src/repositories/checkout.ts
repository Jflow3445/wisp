import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, inArray } from "drizzle-orm";

import type { Database } from "../connection.js";
import {
  cartItems,
  carts,
  checkoutSessions,
  checkoutVendorGroups,
  inventoryItems,
  inventoryMovements,
  products,
  productVariants,
  stockLocations,
  stockReservations,
  stores,
  vendorOffers,
  vendors,
} from "../schema.js";
import {
  addQuantities,
  asRecord,
  multiplyMinorByQuantity,
  PersistenceError,
  publicReference,
  quantityFromScaled,
  scaledQuantity,
} from "./shared.js";

export interface CheckoutRecord {
  id: string;
  buyerId: string;
  cartId: string;
  cartVersion: number;
  version: number;
  status: "CREATED" | "VALIDATING" | "READY" | "PAYMENT_PENDING" | "COMPLETED" | "EXPIRED" | "CANCELLED" | "REVIEW_REQUIRED";
  currency: string;
  total: { amountMinor: bigint; currency: string };
  expiresAt: string;
}

export interface CheckoutItemSnapshot extends Record<string, unknown> {
  cartItemId: string;
  offerId: string;
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  quantity: string;
  unitPriceMinor: string;
  lineTotalMinor: string;
  currency: string;
  returnPolicySnapshot: Record<string, unknown>;
}

interface PricingSnapshot extends Record<string, unknown> {
  cartVersion: number;
  itemSubtotalMinor: string;
  discountMinor: string;
  deliveryMinor: string;
  taxMinor: string;
  serviceFeeMinor: string;
  totalMinor: string;
}

const pricingSnapshot = (value: unknown): PricingSnapshot => {
  const snapshot = asRecord(value);
  return {
    cartVersion: Number(snapshot.cartVersion),
    itemSubtotalMinor: String(snapshot.itemSubtotalMinor ?? "0"),
    discountMinor: String(snapshot.discountMinor ?? "0"),
    deliveryMinor: String(snapshot.deliveryMinor ?? "0"),
    taxMinor: String(snapshot.taxMinor ?? "0"),
    serviceFeeMinor: String(snapshot.serviceFeeMinor ?? "0"),
    totalMinor: String(snapshot.totalMinor ?? "0"),
  };
};

const toCheckoutRecord = (row: typeof checkoutSessions.$inferSelect): CheckoutRecord => {
  const pricing = pricingSnapshot(row.pricingSnapshot);
  return {
    id: row.id,
    buyerId: row.userId!,
    cartId: row.cartId,
    cartVersion: pricing.cartVersion,
    version: row.version,
    status: row.status,
    currency: row.currency,
    total: { amountMinor: BigInt(pricing.totalMinor), currency: row.currency },
    expiresAt: row.expiresAt.toISOString(),
  };
};

export class PostgresCheckoutRepository {
  constructor(private readonly db: Database) {}

  createReady(input: {
    buyerId: string;
    cartId: string;
    expectedCartVersion: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<CheckoutRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const actor = `buyer:${input.buyerId}`;
      const [previous] = await db
        .select()
        .from(checkoutSessions)
        .where(and(
          eq(checkoutSessions.idempotencyActor, actor),
          eq(checkoutSessions.idempotencyKey, input.idempotencyKey),
        ))
        .for("update")
        .limit(1);
      if (previous) {
        const previousPricing = pricingSnapshot(previous.pricingSnapshot);
        if (previous.cartId !== input.cartId || previousPricing.cartVersion !== input.expectedCartVersion) {
          throw new PersistenceError(
            "IDEMPOTENCY_PAYLOAD_MISMATCH",
            "Checkout key was used for another cart version",
            409,
          );
        }
        return toCheckoutRecord(previous);
      }

      const [cart] = await db
        .select()
        .from(carts)
        .where(and(eq(carts.id, input.cartId), eq(carts.userId, input.buyerId), eq(carts.status, "ACTIVE")))
        .for("update")
        .limit(1);
      if (!cart) throw PersistenceError.notFound("Cart not found");
      if (cart.version !== input.expectedCartVersion) {
        throw new PersistenceError("CART_CHANGED", "The cart changed after checkout was requested", 409, {
          expectedVersion: input.expectedCartVersion,
          actualVersion: cart.version,
        });
      }
      if (cart.currency !== input.currency) {
        throw new PersistenceError("PRICE_CHANGED", "Cart currency does not match checkout", 409);
      }

      const lines = await db
        .select({
          cartItemId: cartItems.id,
          offerId: vendorOffers.id,
          vendorId: vendorOffers.vendorId,
          storeId: vendorOffers.storeId,
          offerStatus: vendorOffers.status,
          offerPriceMinor: vendorOffers.priceMinor,
          currency: vendorOffers.currency,
          productId: products.id,
          productName: products.name,
          productStatus: products.status,
          productVariantId: productVariants.id,
          variantName: productVariants.name,
          variantStatus: productVariants.status,
          vendorStatus: vendors.status,
          storeStatus: stores.status,
          quantity: cartItems.quantity,
          unitPriceSnapshotMinor: cartItems.unitPriceSnapshotMinor,
          returnPolicySnapshot: vendorOffers.returnPolicySnapshot,
        })
        .from(cartItems)
        .innerJoin(vendorOffers, eq(vendorOffers.id, cartItems.vendorOfferId))
        .innerJoin(productVariants, eq(productVariants.id, vendorOffers.productVariantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(vendors, eq(vendors.id, vendorOffers.vendorId))
        .innerJoin(stores, eq(stores.id, vendorOffers.storeId))
        .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.savedForLater, false)))
        .orderBy(asc(cartItems.createdAt), asc(cartItems.id))
        .for("update");
      if (!lines.length) throw new PersistenceError("CART_CHANGED", "An empty cart cannot be checked out", 409);

      const checkoutId = randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      let itemSubtotalMinor = 0n;
      const groups = new Map<string, {
        vendorId: string;
        storeId: string;
        subtotalMinor: bigint;
        items: CheckoutItemSnapshot[];
      }>();

      for (const line of lines) {
        if (
          line.offerStatus !== "ACTIVE" ||
          line.productStatus !== "APPROVED" ||
          line.variantStatus !== "ACTIVE" ||
          line.vendorStatus !== "APPROVED" ||
          line.storeStatus !== "ACTIVE"
        ) {
          throw new PersistenceError("PRODUCT_UNAVAILABLE", `${line.productName} is no longer available`, 409);
        }
        if (line.offerPriceMinor !== line.unitPriceSnapshotMinor || line.currency !== cart.currency) {
          throw new PersistenceError("PRICE_CHANGED", `${line.productName} changed price`, 409);
        }
        const lineTotalMinor = multiplyMinorByQuantity(line.offerPriceMinor, line.quantity);
        itemSubtotalMinor += lineTotalMinor;
        const key = `${line.vendorId}:${line.storeId}`;
        const group = groups.get(key) ?? {
          vendorId: line.vendorId,
          storeId: line.storeId,
          subtotalMinor: 0n,
          items: [],
        };
        group.subtotalMinor += lineTotalMinor;
        group.items.push({
          cartItemId: line.cartItemId,
          offerId: line.offerId,
          productId: line.productId,
          productVariantId: line.productVariantId,
          productName: line.productName,
          variantName: line.variantName,
          quantity: line.quantity,
          unitPriceMinor: line.offerPriceMinor.toString(),
          lineTotalMinor: lineTotalMinor.toString(),
          currency: line.currency,
          returnPolicySnapshot: asRecord(line.returnPolicySnapshot),
        });
        groups.set(key, group);
      }

      const pricing: PricingSnapshot = {
        cartVersion: cart.version,
        itemSubtotalMinor: itemSubtotalMinor.toString(),
        discountMinor: "0",
        deliveryMinor: "0",
        taxMinor: "0",
        serviceFeeMinor: "0",
        totalMinor: itemSubtotalMinor.toString(),
      };
      await db.insert(checkoutSessions).values({
        id: checkoutId,
        publicReference: publicReference("CHK"),
        userId: input.buyerId,
        cartId: cart.id,
        status: "READY",
        currency: cart.currency,
        contactData: {},
        addressData: {},
        pricingSnapshot: pricing,
        idempotencyActor: actor,
        idempotencyKey: input.idempotencyKey,
        expiresAt,
        version: 3,
      });

      for (const group of groups.values()) {
        await db.insert(checkoutVendorGroups).values({
          id: randomUUID(),
          checkoutSessionId: checkoutId,
          vendorId: group.vendorId,
          storeId: group.storeId,
          itemsSnapshot: group.items,
          subtotalMinor: group.subtotalMinor,
          totalMinor: group.subtotalMinor,
        });
      }

      for (const line of lines) {
        let remaining = scaledQuantity(line.quantity);
        const stock = await db
          .select({ inventory: inventoryItems })
          .from(inventoryItems)
          .innerJoin(stockLocations, eq(stockLocations.id, inventoryItems.stockLocationId))
          .where(and(
            eq(inventoryItems.vendorOfferId, line.offerId),
            eq(stockLocations.status, "ACTIVE"),
            gt(inventoryItems.physicalQuantity, "0"),
          ))
          .orderBy(asc(inventoryItems.id))
          .for("update");

        for (const { inventory } of stock) {
          if (remaining === 0n) break;
          const available = scaledQuantity(inventory.physicalQuantity)
            - scaledQuantity(inventory.reservedQuantity)
            - scaledQuantity(inventory.damagedQuantity)
            - scaledQuantity(inventory.safetyQuantity);
          if (available <= 0n) continue;
          const allocated = available < remaining ? available : remaining;
          const quantity = quantityFromScaled(allocated);
          const reservedAfter = addQuantities(inventory.reservedQuantity, quantity);
          const reservationId = randomUUID();
          await db
            .update(inventoryItems)
            .set({ reservedQuantity: reservedAfter, version: inventory.version + 1, updatedAt: new Date() })
            .where(and(eq(inventoryItems.id, inventory.id), eq(inventoryItems.version, inventory.version)));
          await db.insert(stockReservations).values({
            id: reservationId,
            checkoutSessionId: checkoutId,
            inventoryItemId: inventory.id,
            quantity,
            status: "ACTIVE",
            expiresAt,
          });
          await db.insert(inventoryMovements).values({
            id: randomUUID(),
            inventoryItemId: inventory.id,
            movementType: "RESERVATION",
            quantityChange: quantity,
            physicalBefore: inventory.physicalQuantity,
            physicalAfter: inventory.physicalQuantity,
            reservedBefore: inventory.reservedQuantity,
            reservedAfter,
            reasonCode: "CHECKOUT_RESERVATION",
            relatedReservationId: reservationId,
            idempotencyKey: `checkout:${checkoutId}:reserve:${inventory.id}`,
          });
          remaining -= allocated;
        }
        if (remaining > 0n) {
          throw new PersistenceError("INSUFFICIENT_STOCK", `${line.productName} does not have enough stock`, 409);
        }
      }

      const [created] = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, checkoutId)).limit(1);
      return toCheckoutRecord(created!);
    });
  }

  async findPayableByBuyer(checkoutId: string, buyerId: string): Promise<CheckoutRecord | null> {
    const [checkout] = await this.db
      .select()
      .from(checkoutSessions)
      .where(and(
        eq(checkoutSessions.id, checkoutId),
        eq(checkoutSessions.userId, buyerId),
        eq(checkoutSessions.status, "READY"),
        gt(checkoutSessions.expiresAt, new Date()),
      ))
      .limit(1);
    return checkout ? toCheckoutRecord(checkout) : null;
  }

  beginPayment(checkoutId: string, buyerId: string): Promise<CheckoutRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const [checkout] = await db
        .select()
        .from(checkoutSessions)
        .where(and(eq(checkoutSessions.id, checkoutId), eq(checkoutSessions.userId, buyerId)))
        .for("update")
        .limit(1);
      if (!checkout || checkout.status !== "READY" || checkout.expiresAt <= new Date()) {
        throw new PersistenceError("PAYMENT_ALREADY_COMPLETED", "Checkout is not ready for payment", 409);
      }
      const [updated] = await db
        .update(checkoutSessions)
        .set({ status: "PAYMENT_PENDING", version: checkout.version + 1, updatedAt: new Date() })
        .where(eq(checkoutSessions.id, checkout.id))
        .returning();
      return toCheckoutRecord(updated!);
    });
  }

  applyPaymentOutcome(checkoutId: string, outcome: "success" | "failure"): Promise<CheckoutRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const [checkout] = await db
        .select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, checkoutId))
        .for("update")
        .limit(1);
      if (!checkout) throw PersistenceError.notFound("Checkout not found");
      if (checkout.status !== "PAYMENT_PENDING") {
        throw new PersistenceError("VERSION_CONFLICT", "Checkout is not awaiting payment", 409);
      }
      const [updated] = await db
        .update(checkoutSessions)
        .set({
          status: outcome === "success" ? "COMPLETED" : "READY",
          completedAt: outcome === "success" ? new Date() : null,
          version: checkout.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(checkoutSessions.id, checkout.id))
        .returning();
      return toCheckoutRecord(updated!);
    });
  }
}
