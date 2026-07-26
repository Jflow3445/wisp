import { randomUUID } from "node:crypto";

import type { PaymentStatus } from "@nister/contracts";
import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "../connection.js";
import {
  auditLogs,
  carts,
  checkoutSessions,
  checkoutVendorGroups,
  inventoryItems,
  inventoryMovements,
  ledgerAccounts,
  ledgerEntries,
  ledgerTransactions,
  orderItems,
  orders,
  orderStatusHistory,
  paymentAttempts,
  payments,
  paymentWebhookEvents,
  stockReservations,
  vendorOrders,
  outboxEvents,
} from "../schema.js";
import {
  asRecord,
  asRecordArray,
  hashJson,
  PersistenceError,
  publicReference,
  quantityFromScaled,
  scaledQuantity,
  subtractQuantities,
} from "./shared.js";

export interface PaymentAttemptRecord {
  id: string;
  checkoutId: string;
  buyerId: string;
  reference: string;
  status: PaymentStatus;
  version: number;
  amount: { amountMinor: bigint; currency: string };
  currency: string;
}

export interface PaymentInitializationRecord {
  provider: "paystack";
  reference: string;
  accessCode: string;
  authorizationUrl: string;
  status: "pending";
}

export interface VerifiedPaymentEventRecord {
  eventId: string;
  eventType: string;
  reference: string;
  action:
    | "INITIALISE"
    | "MARK_PENDING"
    | "REQUIRE_ACTION"
    | "CONFIRM_SUCCESS"
    | "FAIL"
    | "EXPIRE"
    | "CANCEL"
    | "REVERSE"
    | "PARTIAL_REFUND"
    | "FULL_REFUND"
    | "REQUIRE_REVIEW"
    | "RETRY"
    | null;
  reason?: string;
  amountMinor?: string;
  currency?: string;
  evidence: Record<string, unknown>;
  providerPayload: Record<string, unknown>;
}

export interface PaymentEventResult {
  duplicate: boolean;
  outcome: "applied" | "unmatched" | "ignored";
}

interface CheckoutPricing {
  cartVersion: number;
  itemSubtotalMinor: bigint;
  discountMinor: bigint;
  deliveryMinor: bigint;
  taxMinor: bigint;
  serviceFeeMinor: bigint;
  totalMinor: bigint;
}

interface OrderItemSnapshot {
  offerId: string;
  productId: string;
  productVariantId: string;
  productName: string;
  variantName: string;
  quantity: string;
  unitPriceMinor: bigint;
  lineTotalMinor: bigint;
  currency: string;
  returnPolicySnapshot: Record<string, unknown>;
}

const checkoutPricing = (value: unknown): CheckoutPricing => {
  const snapshot = asRecord(value);
  return {
    cartVersion: Number(snapshot.cartVersion),
    itemSubtotalMinor: BigInt(String(snapshot.itemSubtotalMinor ?? "0")),
    discountMinor: BigInt(String(snapshot.discountMinor ?? "0")),
    deliveryMinor: BigInt(String(snapshot.deliveryMinor ?? "0")),
    taxMinor: BigInt(String(snapshot.taxMinor ?? "0")),
    serviceFeeMinor: BigInt(String(snapshot.serviceFeeMinor ?? "0")),
    totalMinor: BigInt(String(snapshot.totalMinor ?? "0")),
  };
};

const orderItemSnapshot = (value: unknown): OrderItemSnapshot => {
  const snapshot = asRecord(value);
  const required = ["offerId", "productId", "productVariantId", "productName", "variantName", "quantity", "currency"];
  if (required.some((key) => typeof snapshot[key] !== "string")) {
    throw new Error("Checkout item snapshot is incomplete");
  }
  return {
    offerId: String(snapshot.offerId),
    productId: String(snapshot.productId),
    productVariantId: String(snapshot.productVariantId),
    productName: String(snapshot.productName),
    variantName: String(snapshot.variantName),
    quantity: String(snapshot.quantity),
    unitPriceMinor: BigInt(String(snapshot.unitPriceMinor)),
    lineTotalMinor: BigInt(String(snapshot.lineTotalMinor)),
    currency: String(snapshot.currency),
    returnPolicySnapshot: asRecord(snapshot.returnPolicySnapshot),
  };
};

const toAttempt = (payment: typeof payments.$inferSelect): PaymentAttemptRecord => ({
  id: payment.id,
  checkoutId: payment.checkoutSessionId,
  buyerId: payment.userId!,
  reference: payment.providerReference!,
  status: payment.status,
  version: payment.version,
  amount: { amountMinor: payment.amountMinor, currency: payment.currency },
  currency: payment.currency,
});

const finishWebhook = async (
  db: Database,
  webhookId: string,
  status: "PROCESSED" | "IGNORED",
): Promise<void> => {
  await db
    .update(paymentWebhookEvents)
    .set({ processingStatus: status, attemptCount: 1, processedAt: new Date() })
    .where(eq(paymentWebhookEvents.id, webhookId));
};

export class PostgresPaymentRepository {
  constructor(private readonly db: Database) {}

  prepareInitialization(input: {
    buyerId: string;
    checkoutId: string;
    idempotencyKey: string;
  }): Promise<PaymentAttemptRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const actor = `buyer:${input.buyerId}:checkout:${input.checkoutId}`;
      const [existing] = await db
        .select()
        .from(payments)
        .where(and(
          eq(payments.provider, "PAYSTACK"),
          eq(payments.idempotencyActor, actor),
          eq(payments.idempotencyKey, input.idempotencyKey),
        ))
        .for("update")
        .limit(1);
      if (existing) return toAttempt(existing);

      const [checkout] = await db
        .select()
        .from(checkoutSessions)
        .where(and(eq(checkoutSessions.id, input.checkoutId), eq(checkoutSessions.userId, input.buyerId)))
        .for("update")
        .limit(1);
      if (!checkout || checkout.status !== "READY" || checkout.expiresAt <= new Date()) {
        throw new PersistenceError("PAYMENT_ALREADY_COMPLETED", "Checkout is not ready for payment", 409);
      }
      const pricing = checkoutPricing(checkout.pricingSnapshot);
      if (pricing.totalMinor <= 0n) {
        throw new PersistenceError("VALIDATION_FAILED", "Checkout total must be greater than zero", 400);
      }
      const reference = `nister_${randomUUID().replaceAll("-", "")}`;
      const [payment] = await db
        .insert(payments)
        .values({
          id: randomUUID(),
          publicReference: publicReference("PAY"),
          checkoutSessionId: checkout.id,
          userId: input.buyerId,
          provider: "PAYSTACK",
          providerReference: reference,
          status: "CREATED",
          amountMinor: pricing.totalMinor,
          currency: checkout.currency,
          idempotencyActor: actor,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();
      await db
        .update(checkoutSessions)
        .set({ status: "PAYMENT_PENDING", version: checkout.version + 1, updatedAt: new Date() })
        .where(eq(checkoutSessions.id, checkout.id));
      return toAttempt(payment!);
    });
  }

  recordInitialized(
    reference: string,
    result: PaymentInitializationRecord,
  ): Promise<PaymentAttemptRecord> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const [payment] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.provider, "PAYSTACK"), eq(payments.providerReference, reference)))
        .for("update")
        .limit(1);
      if (!payment) throw PersistenceError.notFound("Payment attempt not found");
      if (result.reference !== reference) {
        throw new PersistenceError(
          "PAYMENT_RECONCILIATION_REQUIRED",
          "Provider reference did not match the prepared payment",
          409,
        );
      }
      if (payment.status === "PENDING") return toAttempt(payment);
      if (payment.status !== "CREATED" && payment.status !== "INITIALISED") {
        throw new PersistenceError("PAYMENT_ALREADY_COMPLETED", "Payment cannot be initialized again", 409);
      }
      await db
        .insert(paymentAttempts)
        .values({
          id: randomUUID(),
          paymentId: payment.id,
          attemptNumber: 1,
          providerRequestReference: reference,
          status: "PENDING",
          safeResponseData: result,
        })
        .onConflictDoNothing();
      const increment = payment.status === "CREATED" ? 2 : 1;
      const [updated] = await db
        .update(payments)
        .set({
          status: "PENDING",
          initialisedAt: payment.initialisedAt ?? new Date(),
          version: payment.version + increment,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id))
        .returning();
      return toAttempt(updated!);
    });
  }

  applyVerifiedEvent(event: VerifiedPaymentEventRecord): Promise<PaymentEventResult> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const webhookId = randomUUID();
      const [inserted] = await db
        .insert(paymentWebhookEvents)
        .values({
          id: webhookId,
          provider: "PAYSTACK",
          providerEventId: event.eventId,
          eventType: event.eventType,
          signatureValid: true,
          payload: event.providerPayload,
          payloadSha256: hashJson(event.providerPayload),
          processingStatus: "PROCESSING",
          attemptCount: 0,
        })
        .onConflictDoNothing()
        .returning({ id: paymentWebhookEvents.id });
      if (!inserted) return { duplicate: true, outcome: "ignored" };
      if (!event.action || (event.action !== "CONFIRM_SUCCESS" && event.action !== "FAIL")) {
        await finishWebhook(db, webhookId, "IGNORED");
        return { duplicate: false, outcome: "ignored" };
      }

      const [payment] = await db
        .select()
        .from(payments)
        .where(and(eq(payments.provider, "PAYSTACK"), eq(payments.providerReference, event.reference)))
        .for("update")
        .limit(1);
      if (!payment) {
        await finishWebhook(db, webhookId, "PROCESSED");
        return { duplicate: false, outcome: "unmatched" };
      }
      if (!["INITIALISED", "PENDING", "ACTION_REQUIRED", "UNDER_REVIEW"].includes(payment.status)) {
        await finishWebhook(db, webhookId, "IGNORED");
        return { duplicate: false, outcome: "ignored" };
      }

      const [checkout] = await db
        .select()
        .from(checkoutSessions)
        .where(eq(checkoutSessions.id, payment.checkoutSessionId))
        .for("update")
        .limit(1);
      if (!checkout) throw PersistenceError.notFound("Payment checkout not found");
      if (checkout.status !== "PAYMENT_PENDING") {
        throw new PersistenceError("VERSION_CONFLICT", "Checkout is not awaiting provider confirmation", 409);
      }

      if (event.action === "FAIL") {
        const now = new Date();
        await db
          .update(payments)
          .set({
            status: "FAILED",
            failedAt: now,
            failureCode: "PROVIDER_FAILED",
            failureMessage: event.reason ?? "Provider reported failure",
            version: payment.version + 1,
            updatedAt: now,
          })
          .where(eq(payments.id, payment.id));
        await db
          .update(checkoutSessions)
          .set({ status: "READY", version: checkout.version + 1, updatedAt: now })
          .where(eq(checkoutSessions.id, checkout.id));
        await db.insert(auditLogs).values({
          id: randomUUID(),
          actorType: "PROVIDER",
          action: "payment.failed",
          entityType: "PAYMENT",
          entityId: payment.id,
          reason: event.reason,
          afterData: { status: "FAILED" },
          metadata: { providerEventId: event.eventId, evidence: event.evidence },
        });
        await db.insert(outboxEvents).values({
          id: randomUUID(),
          aggregateType: "PAYMENT",
          aggregateId: payment.id,
          eventType: "PaymentFailed",
          eventVersion: payment.version + 1,
          payload: { paymentId: payment.id, checkoutId: checkout.id, providerEventId: event.eventId },
        });
        await finishWebhook(db, webhookId, "PROCESSED");
        return { duplicate: false, outcome: "applied" };
      }

      return this.applySuccessfulCapture(db, webhookId, payment, checkout, event);
    });
  }

  private async applySuccessfulCapture(
    db: Database,
    webhookId: string,
    payment: typeof payments.$inferSelect,
    checkout: typeof checkoutSessions.$inferSelect,
    event: VerifiedPaymentEventRecord,
  ): Promise<PaymentEventResult> {
    const now = new Date();
    const reservations = await db
      .select()
      .from(stockReservations)
      .where(eq(stockReservations.checkoutSessionId, checkout.id))
      .for("update");
    if (!reservations.length) {
      throw new PersistenceError("INSUFFICIENT_STOCK", "Checkout has no active stock reservations", 409);
    }
    if (reservations.some((reservation) => reservation.status !== "ACTIVE" || reservation.expiresAt <= now)) {
      throw new PersistenceError("INSUFFICIENT_STOCK", "Checkout stock reservations are no longer active", 409);
    }
    const inventory = await db
      .select()
      .from(inventoryItems)
      .where(inArray(inventoryItems.id, reservations.map((reservation) => reservation.inventoryItemId)))
      .for("update");
    if (inventory.length !== reservations.length) throw new Error("Reserved inventory projection is incomplete");
    const inventoryById = new Map(inventory.map((item) => [item.id, item]));

    const groups = await db
      .select()
      .from(checkoutVendorGroups)
      .where(eq(checkoutVendorGroups.checkoutSessionId, checkout.id));
    if (!groups.length) throw new Error("Checkout has no vendor groups");
    const pricing = checkoutPricing(checkout.pricingSnapshot);
    if (pricing.totalMinor !== payment.amountMinor || checkout.currency !== payment.currency) {
      throw new PersistenceError(
        "PAYMENT_RECONCILIATION_REQUIRED",
        "Verified payment does not match the checkout total",
        409,
      );
    }
    let verifiedAmountMinor: bigint;
    try {
      verifiedAmountMinor = BigInt(event.amountMinor ?? "");
    } catch {
      throw new PersistenceError(
        "PAYMENT_RECONCILIATION_REQUIRED",
        "Provider verification did not include a valid amount",
        409,
      );
    }
    if (verifiedAmountMinor !== payment.amountMinor || event.currency !== payment.currency) {
      throw new PersistenceError(
        "PAYMENT_RECONCILIATION_REQUIRED",
        "Verified payment amount or currency does not match the prepared payment",
        409,
      );
    }

    const orderId = randomUUID();
    await db.insert(orders).values({
      id: orderId,
      publicReference: publicReference("ORD"),
      userId: checkout.userId,
      checkoutSessionId: checkout.id,
      status: "CONFIRMED",
      currency: checkout.currency,
      itemSubtotalMinor: pricing.itemSubtotalMinor,
      discountMinor: pricing.discountMinor,
      deliveryMinor: pricing.deliveryMinor,
      taxMinor: pricing.taxMinor,
      serviceFeeMinor: pricing.serviceFeeMinor,
      grandTotalMinor: pricing.totalMinor,
      contactSnapshot: asRecord(checkout.contactData),
      addressSnapshot: asRecord(checkout.addressData),
      confirmedAt: now,
    });

    const orderItemByOffer = new Map<string, string>();
    const vendorOrderIds: string[] = [];
    for (const group of groups) {
      const vendorOrderId = randomUUID();
      vendorOrderIds.push(vendorOrderId);
      await db.insert(vendorOrders).values({
        id: vendorOrderId,
        publicReference: publicReference("VOR"),
        orderId,
        vendorId: group.vendorId,
        storeId: group.storeId,
        status: "AWAITING_VENDOR_RESPONSE",
        subtotalMinor: group.subtotalMinor,
        discountMinor: group.discountMinor,
        taxMinor: group.taxMinor,
        deliveryMinor: group.deliveryMinor,
        commissionMinor: 0n,
        vendorNetMinor: group.subtotalMinor - group.discountMinor + group.taxMinor,
        responseDeadlineAt: new Date(now.getTime() + 30 * 60_000),
      });
      const snapshots = asRecordArray(group.itemsSnapshot).map(orderItemSnapshot);
      if (!snapshots.length) throw new Error("Checkout vendor group has no item snapshots");
      for (const snapshot of snapshots) {
        const itemId = randomUUID();
        await db.insert(orderItems).values({
          id: itemId,
          orderId,
          vendorOrderId,
          vendorOfferId: snapshot.offerId,
          productId: snapshot.productId,
          productVariantId: snapshot.productVariantId,
          productSnapshot: {
            name: snapshot.productName,
            variantName: snapshot.variantName,
          },
          quantity: snapshot.quantity,
          unitPriceMinor: snapshot.unitPriceMinor,
          discountMinor: 0n,
          taxMinor: 0n,
          lineTotalMinor: snapshot.lineTotalMinor,
          commissionRuleSnapshot: { type: "NONE", amountMinor: "0" },
          returnPolicySnapshot: snapshot.returnPolicySnapshot,
          status: "ACTIVE",
        });
        orderItemByOffer.set(snapshot.offerId, itemId);
      }
    }

    for (const reservation of reservations) {
      const item = inventoryById.get(reservation.inventoryItemId)!;
      const orderItemId = orderItemByOffer.get(item.vendorOfferId);
      if (!orderItemId) throw new Error("Reservation does not match an order item snapshot");
      const quantity = scaledQuantity(reservation.quantity);
      if (
        scaledQuantity(item.physicalQuantity) < quantity ||
        scaledQuantity(item.reservedQuantity) < quantity
      ) {
        throw new PersistenceError("INSUFFICIENT_STOCK", "Reserved inventory cannot be consumed", 409);
      }
      const physicalAfter = subtractQuantities(item.physicalQuantity, reservation.quantity);
      const reservedAfter = subtractQuantities(item.reservedQuantity, reservation.quantity);
      await db
        .update(inventoryItems)
        .set({
          physicalQuantity: physicalAfter,
          reservedQuantity: reservedAfter,
          version: item.version + 1,
          updatedAt: now,
        })
        .where(eq(inventoryItems.id, item.id));
      await db
        .update(stockReservations)
        .set({ status: "CONSUMED", consumedAt: now, version: reservation.version + 1, updatedAt: now })
        .where(eq(stockReservations.id, reservation.id));
      await db.insert(inventoryMovements).values({
        id: randomUUID(),
        inventoryItemId: item.id,
        movementType: "SALE",
        quantityChange: quantityFromScaled(-quantity),
        physicalBefore: item.physicalQuantity,
        physicalAfter,
        reservedBefore: item.reservedQuantity,
        reservedAfter,
        reasonCode: "VERIFIED_PAYMENT_CAPTURE",
        relatedOrderItemId: orderItemId,
        relatedReservationId: reservation.id,
        idempotencyKey: `payment:${payment.id}:sale:${reservation.id}`,
      });
    }

    const accounts = await db
      .select({ id: ledgerAccounts.id, code: ledgerAccounts.code })
      .from(ledgerAccounts)
      .where(and(
        inArray(ledgerAccounts.code, ["1010", "2000"]),
        eq(ledgerAccounts.ownerType, "PLATFORM"),
        eq(ledgerAccounts.currency, payment.currency),
        eq(ledgerAccounts.status, "ACTIVE"),
      ));
    const accountByCode = new Map(accounts.map((account) => [account.code, account.id]));
    const receivableAccountId = accountByCode.get("1010");
    const clearingAccountId = accountByCode.get("2000");
    if (!receivableAccountId || !clearingAccountId) throw new Error("Payment capture ledger accounts are not seeded");
    const journalId = randomUUID();
    await db.insert(ledgerTransactions).values({
      id: journalId,
      publicReference: publicReference("JRN"),
      transactionType: "PAYMENT_CAPTURE",
      postingTemplateCode: "PAYMENT_CAPTURED_V1",
      sourceEntityType: "PAYMENT",
      sourceEntityId: payment.id,
      sourceEventId: event.eventId,
      currency: payment.currency,
      status: "PENDING",
      description: `Verified Paystack capture for ${payment.publicReference}`,
      idempotencyKey: `payment-capture:${payment.id}`,
    });
    await db.insert(ledgerEntries).values([
      {
        id: randomUUID(),
        ledgerTransactionId: journalId,
        ledgerAccountId: receivableAccountId,
        direction: "DEBIT",
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        orderId,
        paymentId: payment.id,
      },
      {
        id: randomUUID(),
        ledgerTransactionId: journalId,
        ledgerAccountId: clearingAccountId,
        direction: "CREDIT",
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        orderId,
        paymentId: payment.id,
      },
    ]);
    await db
      .update(ledgerTransactions)
      .set({ status: "POSTED", postedAt: now })
      .where(eq(ledgerTransactions.id, journalId));

    const historyRequestId = randomUUID();
    await db.insert(orderStatusHistory).values({
      id: randomUUID(),
      orderId,
      previousStatus: null,
      newStatus: "CONFIRMED",
      action: "PAYMENT_CAPTURED",
      actorType: "PROVIDER",
      requestId: historyRequestId,
      idempotencyKey: `${event.eventId}:order`,
      metadata: { paymentId: payment.id },
    });
    for (const vendorOrderId of vendorOrderIds) {
      await db.insert(orderStatusHistory).values({
        id: randomUUID(),
        vendorOrderId,
        previousStatus: null,
        newStatus: "AWAITING_VENDOR_RESPONSE",
        action: "ORDER_CREATED",
        actorType: "PROVIDER",
        requestId: historyRequestId,
        idempotencyKey: `${event.eventId}:vendor:${vendorOrderId}`,
        metadata: { paymentId: payment.id, orderId },
      });
    }
    await db.insert(auditLogs).values({
      id: randomUUID(),
      actorType: "PROVIDER",
      action: "payment.capture.confirmed",
      entityType: "PAYMENT",
      entityId: payment.id,
      beforeData: { status: payment.status },
      afterData: { status: "SUCCESSFUL", orderId },
      metadata: { providerEventId: event.eventId, evidence: event.evidence, journalId },
    });
    await db.insert(outboxEvents).values({
      id: randomUUID(),
      aggregateType: "ORDER",
      aggregateId: orderId,
      eventType: "OrderConfirmed",
      eventVersion: 1,
      payload: { orderId, paymentId: payment.id, vendorOrderIds },
    });
    for (const vendorOrderId of vendorOrderIds) {
      await db.insert(outboxEvents).values({
        id: randomUUID(),
        aggregateType: "VENDOR_ORDER",
        aggregateId: vendorOrderId,
        eventType: "VendorOrderCreated",
        eventVersion: 1,
        payload: { vendorOrderId, orderId, paymentId: payment.id },
      });
    }

    await db
      .update(payments)
      .set({ status: "SUCCESSFUL", orderId, completedAt: now, version: payment.version + 1, updatedAt: now })
      .where(eq(payments.id, payment.id));
    await db
      .update(checkoutSessions)
      .set({ status: "COMPLETED", completedAt: now, version: checkout.version + 1, updatedAt: now })
      .where(eq(checkoutSessions.id, checkout.id));
    await db
      .update(carts)
      .set({ status: "CONVERTED", updatedAt: now })
      .where(eq(carts.id, checkout.cartId));
    await finishWebhook(db, webhookId, "PROCESSED");
    return { duplicate: false, outcome: "applied" };
  }
}
