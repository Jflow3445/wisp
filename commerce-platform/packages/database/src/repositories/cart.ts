import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import type { Database } from "../connection.js";
import {
  cartItems,
  carts,
  idempotencyRecords,
  products,
  productVariants,
  users,
  vendorOffers,
} from "../schema.js";
import {
  addQuantities,
  hashJson,
  multiplyMinorByQuantity,
  PersistenceError,
  scaledQuantity,
} from "./shared.js";

export interface CartOfferRecord {
  id: string;
  productName: string;
  vendorId: string;
  price: { amountMinor: bigint; currency: string };
  availableQuantity: string;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "PREORDER";
}

export interface CartLineRecord {
  id: string;
  offerId: string;
  vendorId: string;
  productName: string;
  quantity: string;
  unitPrice: { amountMinor: bigint; currency: string };
  lineTotal: { amountMinor: bigint; currency: string };
}

export interface CartRecord {
  id: string;
  buyerId: string;
  version: number;
  currency: string;
  items: CartLineRecord[];
  total: { amountMinor: bigint; currency: string };
}

const loadCart = async (db: Database, cart: typeof carts.$inferSelect): Promise<CartRecord> => {
  const rows = await db
    .select({
      id: cartItems.id,
      offerId: vendorOffers.id,
      vendorId: vendorOffers.vendorId,
      productName: products.name,
      quantity: cartItems.quantity,
      unitPriceMinor: cartItems.unitPriceSnapshotMinor,
      currency: cartItems.currency,
    })
    .from(cartItems)
    .innerJoin(vendorOffers, eq(vendorOffers.id, cartItems.vendorOfferId))
    .innerJoin(productVariants, eq(productVariants.id, vendorOffers.productVariantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.savedForLater, false)))
    .orderBy(asc(cartItems.createdAt), asc(cartItems.id));

  const items = rows.map((row) => {
    const lineTotal = multiplyMinorByQuantity(row.unitPriceMinor, row.quantity);
    return {
      id: row.id,
      offerId: row.offerId,
      vendorId: row.vendorId,
      productName: row.productName,
      quantity: row.quantity,
      unitPrice: { amountMinor: row.unitPriceMinor, currency: row.currency },
      lineTotal: { amountMinor: lineTotal, currency: row.currency },
    };
  });
  const amountMinor = items.reduce((total, item) => total + item.lineTotal.amountMinor, 0n);
  return {
    id: cart.id,
    buyerId: cart.userId!,
    version: cart.version,
    currency: cart.currency,
    items,
    total: { amountMinor, currency: cart.currency },
  };
};

const lockBuyer = async (db: Database, buyerId: string): Promise<void> => {
  const [buyer] = await db.select({ id: users.id }).from(users).where(eq(users.id, buyerId)).for("update").limit(1);
  if (!buyer) throw PersistenceError.notFound("Buyer account not found");
};

const findActiveCart = async (db: Database, buyerId: string) => {
  const [cart] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.userId, buyerId), eq(carts.status, "ACTIVE")))
    .orderBy(asc(carts.createdAt), asc(carts.id))
    .for("update")
    .limit(1);
  return cart;
};

const getOrCreateLocked = async (db: Database, buyerId: string) => {
  await lockBuyer(db, buyerId);
  const existing = await findActiveCart(db, buyerId);
  if (existing) return existing;
  const [created] = await db
    .insert(carts)
    .values({ id: randomUUID(), userId: buyerId, currency: "GHS", status: "ACTIVE" })
    .returning();
  return created!;
};

export class PostgresCartRepository {
  constructor(private readonly db: Database) {}

  getOrCreateForBuyer(buyerId: string): Promise<CartRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      return loadCart(db, await getOrCreateLocked(db, buyerId));
    });
  }

  async findByIdForBuyer(cartId: string, buyerId: string): Promise<CartRecord | null> {
    const [cart] = await this.db
      .select()
      .from(carts)
      .where(and(eq(carts.id, cartId), eq(carts.userId, buyerId), eq(carts.status, "ACTIVE")))
      .limit(1);
    return cart ? loadCart(this.db, cart) : null;
  }

  addItem(
    buyerId: string,
    offer: CartOfferRecord,
    quantity: string,
    idempotencyKey: string,
  ): Promise<CartRecord> {
    if (scaledQuantity(quantity) <= 0n) {
      throw new PersistenceError("VALIDATION_FAILED", "Cart quantity must be greater than zero", 400);
    }

    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const cart = await getOrCreateLocked(db, buyerId);
      const requestHash = hashJson({ offerId: offer.id, quantity });
      const operationId = randomUUID();
      const [insertedOperation] = await db
        .insert(idempotencyRecords)
        .values({
          id: operationId,
          userId: buyerId,
          actorKey: `buyer:${buyerId}`,
          scope: "cart.add-item.repository",
          idempotencyKey,
          requestHash,
          state: "PROCESSING",
          expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        })
        .onConflictDoNothing()
        .returning({ id: idempotencyRecords.id });

      if (!insertedOperation) {
        const [operation] = await db
          .select()
          .from(idempotencyRecords)
          .where(and(
            eq(idempotencyRecords.actorKey, `buyer:${buyerId}`),
            eq(idempotencyRecords.scope, "cart.add-item.repository"),
            eq(idempotencyRecords.idempotencyKey, idempotencyKey),
          ))
          .for("update")
          .limit(1);
        if (!operation) throw new Error("Cart idempotency record disappeared");
        if (operation.requestHash !== requestHash) {
          throw new PersistenceError(
            "IDEMPOTENCY_PAYLOAD_MISMATCH",
            "Cart key was used with a different item payload",
            409,
          );
        }
        if (operation.state === "COMPLETED") return loadCart(db, cart);
        throw new PersistenceError("VERSION_CONFLICT", "Cart mutation is already in progress", 409);
      }

      const [currentOffer] = await db
        .select({
          id: vendorOffers.id,
          status: vendorOffers.status,
          priceMinor: vendorOffers.priceMinor,
          currency: vendorOffers.currency,
          maximumQuantity: vendorOffers.maximumQuantity,
        })
        .from(vendorOffers)
        .where(eq(vendorOffers.id, offer.id))
        .for("update")
        .limit(1);
      if (!currentOffer || currentOffer.status !== "ACTIVE") {
        throw new PersistenceError("PRODUCT_UNAVAILABLE", "Offer is unavailable", 409);
      }
      if (currentOffer.priceMinor !== offer.price.amountMinor || currentOffer.currency !== offer.price.currency) {
        throw new PersistenceError("PRICE_CHANGED", "Offer price changed before it was added", 409);
      }

      const [existingItem] = await db
        .select()
        .from(cartItems)
        .where(and(
          eq(cartItems.cartId, cart.id),
          eq(cartItems.vendorOfferId, offer.id),
          eq(cartItems.savedForLater, false),
        ))
        .for("update")
        .limit(1);
      const nextQuantity = existingItem ? addQuantities(existingItem.quantity, quantity) : quantity;
      if (currentOffer.maximumQuantity && scaledQuantity(nextQuantity) > scaledQuantity(currentOffer.maximumQuantity)) {
        throw new PersistenceError("VALIDATION_FAILED", "Cart quantity exceeds the offer maximum", 400);
      }

      if (existingItem) {
        await db
          .update(cartItems)
          .set({ quantity: nextQuantity, unitPriceSnapshotMinor: currentOffer.priceMinor, updatedAt: new Date() })
          .where(eq(cartItems.id, existingItem.id));
      } else {
        await db.insert(cartItems).values({
          id: randomUUID(),
          cartId: cart.id,
          vendorOfferId: offer.id,
          quantity,
          unitPriceSnapshotMinor: currentOffer.priceMinor,
          currency: currentOffer.currency,
        });
      }

      const [updatedCart] = await db
        .update(carts)
        .set({ version: cart.version + 1, updatedAt: new Date() })
        .where(and(eq(carts.id, cart.id), eq(carts.version, cart.version)))
        .returning();
      if (!updatedCart) throw new PersistenceError("VERSION_CONFLICT", "Cart changed during mutation", 409);

      await db
        .update(idempotencyRecords)
        .set({
          state: "COMPLETED",
          responseStatus: 200,
          responseBody: { cartId: cart.id, version: updatedCart.version },
          resourceType: "CART",
          resourceId: cart.id,
          updatedAt: new Date(),
        })
        .where(eq(idempotencyRecords.id, operationId));
      return loadCart(db, updatedCart);
    });
  }
}
