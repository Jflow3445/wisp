import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "../connection.js";
import { idempotencyRecords } from "../schema.js";

export type IdempotencyAcquireResult =
  | { state: "acquired"; leaseToken: string }
  | { state: "completed"; response: unknown }
  | { state: "in_progress" }
  | { state: "payload_mismatch" };

const identityFor = (scope: string): { actorKey: string; operationScope: string } => {
  const parts = scope.split(":");
  if ((parts[0] === "buyer" || parts[0] === "vendor") && parts[1]) {
    return { actorKey: `${parts[0]}:${parts[1]}`, operationScope: parts.slice(2).join(":").slice(0, 100) };
  }
  return { actorKey: "api", operationScope: scope.slice(0, 100) };
};

export class PostgresIdempotencyRepository {
  constructor(private readonly db: Database) {}

  acquire(scope: string, key: string, payloadHash: string): Promise<IdempotencyAcquireResult> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const identity = identityFor(scope);
      const recordId = randomUUID();
      const leaseToken = randomUUID();
      const now = new Date();
      const lockedUntil = new Date(now.getTime() + 60_000);
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000);
      const [inserted] = await db
        .insert(idempotencyRecords)
        .values({
          id: recordId,
          actorKey: identity.actorKey,
          scope: identity.operationScope,
          idempotencyKey: key,
          requestHash: payloadHash,
          state: "PROCESSING",
          resourceType: "IDEMPOTENCY_LEASE",
          resourceId: leaseToken,
          lockedUntil,
          expiresAt,
        })
        .onConflictDoNothing()
        .returning({ id: idempotencyRecords.id });
      if (inserted) return { state: "acquired", leaseToken };

      const [record] = await db
        .select()
        .from(idempotencyRecords)
        .where(and(
          eq(idempotencyRecords.actorKey, identity.actorKey),
          eq(idempotencyRecords.scope, identity.operationScope),
          eq(idempotencyRecords.idempotencyKey, key),
        ))
        .for("update")
        .limit(1);
      if (!record) throw new Error("Idempotency record disappeared");
      if (record.requestHash !== payloadHash) return { state: "payload_mismatch" };
      if (record.state === "COMPLETED") return { state: "completed", response: record.responseBody };
      if (record.state === "PROCESSING" && record.lockedUntil && record.lockedUntil > now) {
        return { state: "in_progress" };
      }

      await db
        .update(idempotencyRecords)
        .set({
          state: "PROCESSING",
          resourceType: "IDEMPOTENCY_LEASE",
          resourceId: leaseToken,
          lockedUntil,
          expiresAt,
          responseStatus: null,
          responseBody: null,
          updatedAt: now,
        })
        .where(eq(idempotencyRecords.id, record.id));
      return { state: "acquired", leaseToken };
    });
  }

  async complete(
    scope: string,
    key: string,
    leaseToken: string,
    response: unknown,
  ): Promise<void> {
    const identity = identityFor(scope);
    const [updated] = await this.db
      .update(idempotencyRecords)
      .set({
        state: "COMPLETED",
        responseStatus: 200,
        responseBody: response,
        resourceType: null,
        resourceId: null,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(idempotencyRecords.actorKey, identity.actorKey),
        eq(idempotencyRecords.scope, identity.operationScope),
        eq(idempotencyRecords.idempotencyKey, key),
        eq(idempotencyRecords.state, "PROCESSING"),
        eq(idempotencyRecords.resourceId, leaseToken),
      ))
      .returning({ id: idempotencyRecords.id });
    if (!updated) throw new Error("Idempotency lease is no longer valid");
  }

  async release(scope: string, key: string, leaseToken: string): Promise<void> {
    const identity = identityFor(scope);
    await this.db
      .update(idempotencyRecords)
      .set({
        state: "FAILED",
        resourceType: null,
        resourceId: null,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(idempotencyRecords.actorKey, identity.actorKey),
        eq(idempotencyRecords.scope, identity.operationScope),
        eq(idempotencyRecords.idempotencyKey, key),
        eq(idempotencyRecords.state, "PROCESSING"),
        eq(idempotencyRecords.resourceId, leaseToken),
      ));
  }
}
