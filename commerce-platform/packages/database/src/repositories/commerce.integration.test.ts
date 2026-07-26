import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../connection.js";
import { seedDatabase } from "../seed.js";
import * as schema from "../schema.js";
import { PostgresCartRepository } from "./cart.js";
import { PostgresCatalogueRepository } from "./catalogue.js";
import { PostgresCheckoutRepository } from "./checkout.js";
import { PostgresAdminOverviewRepository, PostgresVendorOperationsRepository } from "./operations.js";
import { PostgresPaymentRepository } from "./payment.js";

const ids = {
  buyer: "11111111-1111-4111-8111-111111111111",
  category: "20000000-0000-4000-8000-000000000001",
  vendorA: "30000000-0000-4000-8000-000000000001",
  vendorB: "30000000-0000-4000-8000-000000000002",
  storeA: "40000000-0000-4000-8000-000000000001",
  storeB: "40000000-0000-4000-8000-000000000002",
  productA: "50000000-0000-4000-8000-000000000001",
  productB: "50000000-0000-4000-8000-000000000002",
  variantA: "60000000-0000-4000-8000-000000000001",
  variantB: "60000000-0000-4000-8000-000000000002",
  offerA: "70000000-0000-4000-8000-000000000001",
  offerB: "70000000-0000-4000-8000-000000000002",
  locationA: "80000000-0000-4000-8000-000000000001",
  locationB: "80000000-0000-4000-8000-000000000002",
  inventoryA: "90000000-0000-4000-8000-000000000001",
  inventoryB: "90000000-0000-4000-8000-000000000002",
} as const;

const migrationPath = fileURLToPath(
  new URL("../../drizzle/0000_supreme_millenium_guard.sql", import.meta.url),
);

const migrate = async (client: PGlite): Promise<void> => {
  const migration = await readFile(migrationPath, "utf8");
  for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
    await client.exec(statement);
  }
};

describe.sequential("PostgreSQL commerce repositories", () => {
  let client: PGlite;
  let db: Database;

  beforeAll(async () => {
    client = new PGlite();
    await migrate(client);
    db = drizzle(client, { schema }) as unknown as Database;
    await seedDatabase(db);

    await db.insert(schema.users).values({
      id: ids.buyer,
      identityProviderSubject: `test|${ids.buyer}`,
      primaryEmail: "buyer@example.test",
      status: "ACTIVE",
    });
    await db.insert(schema.categories).values({
      id: ids.category,
      name: "Test category",
      slug: "test-category",
      status: "ACTIVE",
    });
    await db.insert(schema.vendors).values([
      {
        id: ids.vendorA,
        publicReference: "VEN-A",
        legalName: "Vendor A Limited",
        tradingName: "Vendor A",
        slug: "vendor-a",
        status: "APPROVED",
        approvedAt: new Date(),
      },
      {
        id: ids.vendorB,
        publicReference: "VEN-B",
        legalName: "Vendor B Limited",
        tradingName: "Vendor B",
        slug: "vendor-b",
        status: "APPROVED",
        approvedAt: new Date(),
      },
    ]);
    await db.insert(schema.stores).values([
      {
        id: ids.storeA,
        vendorId: ids.vendorA,
        name: "Vendor A Store",
        publicReference: "STORE-A",
        status: "ACTIVE",
        addressData: {},
        latitude: "5.6037000",
        longitude: "-0.1870000",
      },
      {
        id: ids.storeB,
        vendorId: ids.vendorB,
        name: "Vendor B Store",
        publicReference: "STORE-B",
        status: "ACTIVE",
        addressData: {},
        latitude: "5.6037000",
        longitude: "-0.1870000",
      },
    ]);
    await db.insert(schema.products).values([
      {
        id: ids.productA,
        publicReference: "PROD-A",
        name: "Product A",
        slug: "product-a",
        categoryId: ids.category,
        status: "APPROVED",
      },
      {
        id: ids.productB,
        publicReference: "PROD-B",
        name: "Product B",
        slug: "product-b",
        categoryId: ids.category,
        status: "APPROVED",
      },
    ]);
    await db.insert(schema.productVariants).values([
      {
        id: ids.variantA,
        productId: ids.productA,
        publicReference: "VAR-A",
        name: "Product A standard",
        status: "ACTIVE",
      },
      {
        id: ids.variantB,
        productId: ids.productB,
        publicReference: "VAR-B",
        name: "Product B standard",
        status: "ACTIVE",
      },
    ]);
    await db.insert(schema.vendorOffers).values([
      {
        id: ids.offerA,
        vendorId: ids.vendorA,
        storeId: ids.storeA,
        productVariantId: ids.variantA,
        vendorSku: "SKU-A",
        status: "ACTIVE",
        priceMinor: 2_500n,
        currency: "GHS",
      },
      {
        id: ids.offerB,
        vendorId: ids.vendorB,
        storeId: ids.storeB,
        productVariantId: ids.variantB,
        vendorSku: "SKU-B",
        status: "ACTIVE",
        priceMinor: 4_000n,
        currency: "GHS",
      },
    ]);
    await db.insert(schema.stockLocations).values([
      {
        id: ids.locationA,
        vendorId: ids.vendorA,
        storeId: ids.storeA,
        name: "Vendor A Store Stock",
        type: "STORE",
        addressData: {},
        status: "ACTIVE",
      },
      {
        id: ids.locationB,
        vendorId: ids.vendorB,
        storeId: ids.storeB,
        name: "Vendor B Store Stock",
        type: "STORE",
        addressData: {},
        status: "ACTIVE",
      },
    ]);
    await db.insert(schema.inventoryItems).values([
      {
        id: ids.inventoryA,
        vendorOfferId: ids.offerA,
        stockLocationId: ids.locationA,
        physicalQuantity: "10.000000",
      },
      {
        id: ids.inventoryB,
        vendorOfferId: ids.offerB,
        stockLocationId: ids.locationB,
        physicalQuantity: "10.000000",
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it("commits catalogue through verified multi-vendor order exactly once", async () => {
    const catalogue = new PostgresCatalogueRepository(db);
    const carts = new PostgresCartRepository(db);
    const checkouts = new PostgresCheckoutRepository(db);
    const payments = new PostgresPaymentRepository(db);

    const products = await catalogue.listProducts({ limit: 10 });
    expect(products.items).toHaveLength(2);
    expect(products.items.map((product) => product.offer.availableQuantity)).toEqual([
      "10.000000",
      "10.000000",
    ]);

    const cart = await carts.getOrCreateForBuyer(ids.buyer);
    const offerA = await catalogue.findOfferById(ids.offerA);
    const offerB = await catalogue.findOfferById(ids.offerB);
    expect(offerA).not.toBeNull();
    expect(offerB).not.toBeNull();
    const afterA = await carts.addItem(ids.buyer, offerA!, "2", "cart-add-a");
    const afterB = await carts.addItem(ids.buyer, offerB!, "1", "cart-add-b");
    expect(afterA.version).toBe(cart.version + 1);
    expect(afterB.total.amountMinor).toBe(9_000n);

    const checkout = await checkouts.createReady({
      buyerId: ids.buyer,
      cartId: afterB.id,
      expectedCartVersion: afterB.version,
      currency: "GHS",
      idempotencyKey: "checkout-create",
    });
    expect(checkout).toMatchObject({ status: "READY", total: { amountMinor: 9_000n } });

    const reservedBeforePayment = await client.query<{ count: number; quantity: string }>(
      "select count(*)::integer as count, sum(quantity)::text as quantity from stock_reservations where checkout_session_id = $1 and status = 'ACTIVE'",
      [checkout.id],
    );
    expect(reservedBeforePayment.rows[0]).toEqual({ count: 2, quantity: "3.000000" });

    const payment = await payments.prepareInitialization({
      buyerId: ids.buyer,
      checkoutId: checkout.id,
      idempotencyKey: "payment-initialize",
    });
    await payments.recordInitialized(payment.reference, {
      provider: "paystack",
      reference: payment.reference,
      accessCode: "access-code",
      authorizationUrl: "https://checkout.paystack.com/access-code",
      status: "pending",
    });
    await expect(payments.applyVerifiedEvent({
      eventId: "paystack:charge.success:10000",
      eventType: "charge.success",
      reference: payment.reference,
      action: "CONFIRM_SUCCESS",
      amountMinor: "8999",
      currency: "GHS",
      evidence: { verifiedSignature: true, providerEventId: "10000" },
      providerPayload: { event: "charge.success", data: { id: 10000, reference: payment.reference } },
    })).rejects.toMatchObject({ code: "PAYMENT_RECONCILIATION_REQUIRED" });
    const rolledBackCapture = await client.query<{ orders: number; events: number; active: number }>(`select
      (select count(*)::integer from orders) as orders,
      (select count(*)::integer from payment_webhook_events) as events,
      (select count(*)::integer from stock_reservations where status = 'ACTIVE') as active`);
    expect(rolledBackCapture.rows[0]).toEqual({ orders: 0, events: 0, active: 2 });

    const event = {
      eventId: "paystack:charge.success:10001",
      eventType: "charge.success",
      reference: payment.reference,
      action: "CONFIRM_SUCCESS" as const,
      amountMinor: "9000",
      currency: "GHS",
      evidence: { verifiedSignature: true, providerEventId: "10001" },
      providerPayload: { event: "charge.success", data: { id: 10001, reference: payment.reference } },
    };
    await expect(payments.applyVerifiedEvent(event)).resolves.toEqual({ duplicate: false, outcome: "applied" });
    await expect(payments.applyVerifiedEvent(event)).resolves.toEqual({ duplicate: true, outcome: "ignored" });

    const orderProjection = await client.query<{
      orders: number;
      vendor_orders: number;
      items: number;
      total: string;
    }>(`select
      (select count(*)::integer from orders) as orders,
      (select count(*)::integer from vendor_orders) as vendor_orders,
      (select count(*)::integer from order_items) as items,
      (select grand_total_minor::text from orders limit 1) as total`);
    expect(orderProjection.rows[0]).toEqual({ orders: 1, vendor_orders: 2, items: 2, total: "9000" });

    const stockProjection = await client.query<{
      active: number;
      consumed: number;
      physical: string;
      reserved: string;
      sales: number;
    }>(`select
      (select count(*)::integer from stock_reservations where status = 'ACTIVE') as active,
      (select count(*)::integer from stock_reservations where status = 'CONSUMED') as consumed,
      (select sum(physical_quantity)::text from inventory_items) as physical,
      (select sum(reserved_quantity)::text from inventory_items) as reserved,
      (select count(*)::integer from inventory_movements where movement_type = 'SALE') as sales`);
    expect(stockProjection.rows[0]).toEqual({
      active: 0,
      consumed: 2,
      physical: "17.000000",
      reserved: "0.000000",
      sales: 2,
    });

    const financialProjection = await client.query<{
      status: string;
      debits: string;
      credits: string;
      webhook_events: number;
    }>(`select
      (select status::text from ledger_transactions limit 1) as status,
      (select sum(amount_minor)::text from ledger_entries where direction = 'DEBIT') as debits,
      (select sum(amount_minor)::text from ledger_entries where direction = 'CREDIT') as credits,
      (select count(*)::integer from payment_webhook_events) as webhook_events`);
    expect(financialProjection.rows[0]).toEqual({
      status: "POSTED",
      debits: "9000",
      credits: "9000",
      webhook_events: 1,
    });

    const evidence = await client.query<{ histories: number; audits: number; outbox: number }>(`select
      (select count(*)::integer from order_status_history) as histories,
      (select count(*)::integer from audit_logs) as audits,
      (select count(*)::integer from outbox_events) as outbox`);
    expect(evidence.rows[0]).toEqual({ histories: 3, audits: 1, outbox: 3 });

    const vendorReads = new PostgresVendorOperationsRepository(db);
    expect((await vendorReads.listOrders(ids.vendorA, { limit: 10 })).items).toHaveLength(1);
    expect((await vendorReads.listOrders(ids.vendorB, { limit: 10 })).items).toHaveLength(1);
    const overview = await new PostgresAdminOverviewRepository(db).readOverview();
    expect(overview.vendors.active).toBe(2);
    expect(overview.orders.awaitingVendor).toBe(2);
  }, 30_000);
});
