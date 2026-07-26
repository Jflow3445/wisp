import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "./connection.js";
import { ledgerAccountSeeds, deterministicSeedUuid } from "./seed-data.js";
import { seedDatabase } from "./seed.js";
import * as schema from "./schema.js";

const migrationPath = fileURLToPath(
  new URL("../drizzle/0000_supreme_millenium_guard.sql", import.meta.url),
);

const executeMigration = async (client: PGlite): Promise<void> => {
  const migration = await readFile(migrationPath, "utf8");
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await client.exec(statement);
  }
};

const accountId = (code: string): string => {
  const account = ledgerAccountSeeds.find((candidate) => candidate.code === code);
  if (!account) {
    throw new Error(`Missing seeded account ${code}`);
  }
  return account.id;
};

describe.sequential("Release 1 PostgreSQL migration", () => {
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite();
    await executeMigration(client);
    const database = drizzle(client, { schema }) as unknown as Database;
    await seedDatabase(database);
    await seedDatabase(database);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it("applies the schema and seeds reference data idempotently", async () => {
    const tableResult = await client.query<{ table_count: number }>(
      "select count(*)::integer as table_count from information_schema.tables where table_schema = 'public'",
    );
    const roleResult = await client.query<{ role_count: number }>(
      "select count(*)::integer as role_count from roles",
    );
    const accountResult = await client.query<{ account_count: number }>(
      "select count(*)::integer as account_count from ledger_accounts",
    );

    expect(tableResult.rows[0]?.table_count).toBe(47);
    expect(roleResult.rows[0]?.role_count).toBe(5);
    expect(accountResult.rows[0]?.account_count).toBe(45);
  });

  it("posts a balanced journal and then rejects all mutation", async () => {
    const transactionId = deterministicSeedUuid(10_000);
    await client.exec("begin");
    await client.query(
      `insert into ledger_transactions
        (id, public_reference, transaction_type, posting_template_code, source_entity_type,
         source_entity_id, source_event_id, currency, description, idempotency_key)
       values ($1, 'JRN-TEST-1', 'PAYMENT_CAPTURE', 'PAYMENT_CAPTURED_V1', 'PAYMENT',
         $2, 'provider:event:1', 'GHS', 'Balanced test capture', 'ledger:test:1')`,
      [transactionId, deterministicSeedUuid(10_001)],
    );
    await client.query(
      `insert into ledger_entries
        (id, ledger_transaction_id, ledger_account_id, direction, amount_minor, currency)
       values ($1, $2, $3, 'DEBIT', 11000, 'GHS'),
              ($4, $2, $5, 'CREDIT', 11000, 'GHS')`,
      [
        deterministicSeedUuid(10_002),
        transactionId,
        accountId("1010"),
        deterministicSeedUuid(10_003),
        accountId("2000"),
      ],
    );
    await client.query("update ledger_transactions set status = 'POSTED', posted_at = now() where id = $1", [
      transactionId,
    ]);
    await client.exec("commit");

    await expect(
      client.query("update ledger_entries set amount_minor = 1 where ledger_transaction_id = $1", [transactionId]),
    ).rejects.toThrow(/immutable/i);
    await expect(client.query("delete from ledger_transactions where id = $1", [transactionId])).rejects.toThrow(
      /cannot be deleted/i,
    );
  });

  it("rejects an unbalanced journal at deferred commit", async () => {
    const transactionId = deterministicSeedUuid(10_010);
    await client.exec("begin");
    await client.query(
      `insert into ledger_transactions
        (id, public_reference, transaction_type, posting_template_code, source_entity_type,
         source_entity_id, source_event_id, currency, description, idempotency_key)
       values ($1, 'JRN-TEST-2', 'PAYMENT_CAPTURE', 'PAYMENT_CAPTURED_V1', 'PAYMENT',
         $2, 'provider:event:2', 'GHS', 'Unbalanced test capture', 'ledger:test:2')`,
      [transactionId, deterministicSeedUuid(10_011)],
    );
    await client.query(
      `insert into ledger_entries
        (id, ledger_transaction_id, ledger_account_id, direction, amount_minor, currency)
       values ($1, $2, $3, 'DEBIT', 11000, 'GHS'),
              ($4, $2, $5, 'CREDIT', 10000, 'GHS')`,
      [
        deterministicSeedUuid(10_012),
        transactionId,
        accountId("1010"),
        deterministicSeedUuid(10_013),
        accountId("2000"),
      ],
    );
    await client.query("update ledger_transactions set status = 'POSTED', posted_at = now() where id = $1", [
      transactionId,
    ]);

    await expect(client.exec("commit")).rejects.toThrow(/unbalanced/i);
    await client.exec("rollback");
  });

  it("requires a reversal to be the complete dimensional inverse", async () => {
    const originalId = deterministicSeedUuid(10_020);
    const reversalId = deterministicSeedUuid(10_021);

    await client.exec("begin");
    await client.query(
      `insert into ledger_transactions
        (id, public_reference, transaction_type, posting_template_code, source_entity_type,
         source_entity_id, source_event_id, currency, description, idempotency_key)
       values ($1, 'JRN-TEST-3', 'ALLOCATION', 'VENDOR_ORDER_ACCEPTED_V1', 'VENDOR_ORDER',
         $2, 'order:event:1', 'GHS', 'Allocation', 'ledger:test:3')`,
      [originalId, deterministicSeedUuid(10_022)],
    );
    await client.query(
      `insert into ledger_entries
        (id, ledger_transaction_id, ledger_account_id, direction, amount_minor, currency)
       values ($1, $2, $3, 'DEBIT', 10000, 'GHS'),
              ($4, $2, $5, 'CREDIT', 9000, 'GHS'),
              ($6, $2, $7, 'CREDIT', 1000, 'GHS')`,
      [
        deterministicSeedUuid(10_023),
        originalId,
        accountId("2000"),
        deterministicSeedUuid(10_024),
        accountId("2010"),
        deterministicSeedUuid(10_025),
        accountId("2130"),
      ],
    );
    await client.query("update ledger_transactions set status = 'POSTED', posted_at = now() where id = $1", [
      originalId,
    ]);
    await client.exec("commit");

    await client.exec("begin");
    await client.query(
      `insert into ledger_transactions
        (id, public_reference, transaction_type, posting_template_code, source_entity_type,
         source_entity_id, source_event_id, currency, description, idempotency_key,
         reversal_of_transaction_id)
       values ($1, 'JRN-TEST-4', 'REVERSAL', 'JOURNAL_REVERSAL_V1', 'LEDGER_TRANSACTION',
         $2, 'ledger:event:reversal:1', 'GHS', 'Partial reversal', 'ledger:test:4', $2)`,
      [reversalId, originalId],
    );
    await client.query(
      `insert into ledger_entries
        (id, ledger_transaction_id, ledger_account_id, direction, amount_minor, currency)
       values ($1, $2, $3, 'CREDIT', 5000, 'GHS'),
              ($4, $2, $5, 'DEBIT', 4500, 'GHS'),
              ($6, $2, $7, 'DEBIT', 500, 'GHS')`,
      [
        deterministicSeedUuid(10_026),
        reversalId,
        accountId("2000"),
        deterministicSeedUuid(10_027),
        accountId("2010"),
        deterministicSeedUuid(10_028),
        accountId("2130"),
      ],
    );
    await client.query("update ledger_transactions set status = 'POSTED', posted_at = now() where id = $1", [
      reversalId,
    ]);

    await expect(client.exec("commit")).rejects.toThrow(/complete dimensional inverse/i);
    await client.exec("rollback");
  });

  it("deduplicates provider events and source postings", async () => {
    await client.query(
      `insert into payment_webhook_events
        (id, provider, provider_event_id, event_type, signature_valid, payload, payload_sha256)
       values ($1, 'PAYSTACK', 'evt_unique_1', 'charge.success', true, '{}', $2)`,
      [deterministicSeedUuid(10_030), "a".repeat(64)],
    );
    await expect(
      client.query(
        `insert into payment_webhook_events
          (id, provider, provider_event_id, event_type, signature_valid, payload, payload_sha256)
         values ($1, 'PAYSTACK', 'evt_unique_1', 'charge.success', true, '{}', $2)`,
        [deterministicSeedUuid(10_031), "b".repeat(64)],
      ),
    ).rejects.toThrow(/unique|duplicate/i);

    await expect(
      client.query(
        `insert into ledger_transactions
          (id, public_reference, transaction_type, posting_template_code, source_entity_type,
           source_entity_id, source_event_id, currency, description, idempotency_key)
         values ($1, 'JRN-DUPLICATE', 'PAYMENT_CAPTURE', 'PAYMENT_CAPTURED_V1', 'PAYMENT',
           $2, 'provider:event:1', 'GHS', 'Duplicate source posting', 'ledger:test:duplicate')`,
        [deterministicSeedUuid(10_032), deterministicSeedUuid(10_033)],
      ),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it("keeps audit evidence append-only", async () => {
    const auditId = deterministicSeedUuid(10_040);
    await client.query(
      `insert into audit_logs (id, actor_type, action, entity_type, entity_id)
       values ($1, 'SYSTEM', 'test.audit', 'TEST', $2)`,
      [auditId, deterministicSeedUuid(10_041)],
    );
    await expect(client.query("delete from audit_logs where id = $1", [auditId])).rejects.toThrow(/append-only/i);
  });
});
