import {
  checkoutStatuses,
  deliveryStatuses,
  parentOrderStatuses,
  paymentStatuses,
  productStatuses,
  reservationStatuses,
  userStatuses,
  vendorApplicationStatuses,
  vendorOrderStatuses,
  vendorStatuses,
} from "@nister/contracts";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { databaseOptionsFromEnv } from "./connection.js";
import {
  ledgerAccountSeeds,
  permissionSeeds,
  rolePermissionCodes,
  roleSeeds,
} from "./seed-data.js";
import {
  auditLogs,
  checkoutSessions,
  checkoutStatusValues,
  deliveryStatusValues,
  idempotencyRecords,
  inventoryItems,
  ledgerEntries,
  ledgerTransactions,
  orderItems,
  orders,
  parentOrderStatusValues,
  paymentStatusValues,
  paymentWebhookEvents,
  payments,
  productStatusValues,
  reservationStatusValues,
  stockReservations,
  userStatusValues,
  vendorApplicationStatusValues,
  vendorOffers,
  vendorOrderStatusValues,
  vendorStatusValues,
} from "./schema.js";

describe("shared database contract", () => {
  it("keeps state enums aligned with the shared API contracts", () => {
    expect(userStatusValues).toEqual(userStatuses);
    expect(vendorStatusValues).toEqual(vendorStatuses);
    expect(vendorApplicationStatusValues).toEqual(vendorApplicationStatuses);
    expect(productStatusValues).toEqual(productStatuses);
    expect(checkoutStatusValues).toEqual(checkoutStatuses);
    expect(reservationStatusValues).toEqual(reservationStatuses);
    expect(paymentStatusValues).toEqual(paymentStatuses);
    expect(parentOrderStatusValues).toEqual(parentOrderStatuses);
    expect(vendorOrderStatusValues).toEqual(vendorOrderStatuses);
    expect(deliveryStatusValues).toEqual(deliveryStatuses);
  });

  it("uses bigint money and numeric(18,6) quantity columns", () => {
    expect(vendorOffers.priceMinor.getSQLType()).toBe("bigint");
    expect(payments.amountMinor.getSQLType()).toBe("bigint");
    expect(orders.grandTotalMinor.getSQLType()).toBe("bigint");
    expect(ledgerEntries.amountMinor.getSQLType()).toBe("bigint");
    expect(orderItems.quantity.getSQLType()).toBe("numeric(18, 6)");
    expect(inventoryItems.physicalQuantity.getSQLType()).toBe("numeric(18, 6)");
    expect(stockReservations.quantity.getSQLType()).toBe("numeric(18, 6)");
  });

  it("defines required uniqueness and referential constraints", () => {
    const webhook = getTableConfig(paymentWebhookEvents);
    const journal = getTableConfig(ledgerTransactions);
    const entries = getTableConfig(ledgerEntries);
    const idempotency = getTableConfig(idempotencyRecords);

    expect(webhook.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "payment_webhook_events_provider_event_uq",
    );
    expect(journal.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "ledger_transactions_source_posting_uq",
    );
    expect(entries.foreignKeys).toHaveLength(7);
    expect(idempotency.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "idempotency_records_actor_scope_key_uq",
    );
  });

  it("exposes all critical operational tables", () => {
    expect(
      [
        auditLogs,
        checkoutSessions,
        inventoryItems,
        ledgerEntries,
        ledgerTransactions,
        orders,
        paymentWebhookEvents,
        payments,
        stockReservations,
        vendorOffers,
      ].map(getTableName),
    ).toEqual([
      "audit_logs",
      "checkout_sessions",
      "inventory_items",
      "ledger_entries",
      "ledger_transactions",
      "orders",
      "payment_webhook_events",
      "payments",
      "stock_reservations",
      "vendor_offers",
    ]);
  });
});

describe("connection configuration", () => {
  it("validates and normalizes pool configuration", () => {
    expect(
      databaseOptionsFromEnv({
        DATABASE_URL: "postgresql://user:secret@db.example.test/commerce",
        NODE_ENV: "production",
        DATABASE_POOL_MAX: "32",
        DATABASE_SSL: "verify-full",
      }),
    ).toMatchObject({
      maxConnections: 32,
      ssl: "verify-full",
      applicationName: "nister-commerce",
    });
  });

  it("rejects missing, non-PostgreSQL, and invalid numeric configuration", () => {
    expect(() => databaseOptionsFromEnv({})).toThrow("DATABASE_URL is required");
    expect(() => databaseOptionsFromEnv({ DATABASE_URL: "https://db.example.test" })).toThrow(/postgresql/i);
    expect(() =>
      databaseOptionsFromEnv({ DATABASE_URL: "postgresql://localhost/db", DATABASE_POOL_MAX: "0" }),
    ).toThrow("DATABASE_POOL_MAX");
  });
});

describe("deterministic reference seed", () => {
  it("has stable UUIDv7 IDs and no duplicate identifiers", () => {
    const allIds = [...roleSeeds, ...permissionSeeds, ...ledgerAccountSeeds].map(({ id }) => id);
    expect(new Set(allIds)).toHaveLength(allIds.length);
    expect(allIds.every((id) => /^01900000-0000-7[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(
      true,
    );
  });

  it("maps every seeded role permission to a seeded permission", () => {
    const permissionCodes = new Set<string>(permissionSeeds.map(({ code }) => code));
    const roleCodes = new Set<string>(roleSeeds.map(({ code }) => code));

    expect(Object.keys(rolePermissionCodes).every((code) => roleCodes.has(code))).toBe(true);
    expect(
      Object.values(rolePermissionCodes)
        .flat()
        .every((code) => permissionCodes.has(code)),
    ).toBe(true);
  });

  it("contains the specified platform chart of accounts", () => {
    const codes = new Set(ledgerAccountSeeds.map(({ code }) => code));
    expect(codes.size).toBe(45);
    expect(codes.has("1010")).toBe(true);
    expect(codes.has("2010")).toBe(true);
    expect(codes.has("2130")).toBe(true);
    expect(codes.has("4000")).toBe(true);
    expect(codes.has("5000")).toBe(true);
  });
});
