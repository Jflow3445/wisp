import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { PostgresIdempotencyRepository, type Database } from "@nister/database";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError } from "./errors.js";
import {
  DATABASE,
  PERSISTENCE_MODE,
  PersistenceModule,
  requireDatabase,
  type PersistenceMode,
} from "../persistence/persistence.module.js";

export const IdempotencyKeySchema = z.string().min(8).max(255);

export function requireIdempotencyKey(value: unknown): string {
  const parsed = IdempotencyKeySchema.safeParse(value);
  if (!parsed.success) throw ApiError.validation(parsed.error);
  return parsed.data;
}

export type IdempotencyAcquireResult =
  | { state: "acquired"; leaseToken: string }
  | { state: "completed"; response: unknown }
  | { state: "in_progress" }
  | { state: "payload_mismatch" };

export interface IdempotencyRepository {
  acquire(scope: string, key: string, payloadHash: string): Promise<IdempotencyAcquireResult>;
  complete(scope: string, key: string, leaseToken: string, response: unknown): Promise<void>;
  release(scope: string, key: string, leaseToken: string): Promise<void>;
}

export const IDEMPOTENCY_REPOSITORY = Symbol("IDEMPOTENCY_REPOSITORY");

interface MemoryRecord {
  payloadHash: string;
  leaseToken: string;
  state: "in_progress" | "completed";
  response?: unknown;
}

@Injectable()
export class InMemoryIdempotencyRepository implements IdempotencyRepository {
  private readonly records = new Map<string, MemoryRecord>();

  async acquire(scope: string, key: string, payloadHash: string): Promise<IdempotencyAcquireResult> {
    const recordKey = `${scope}:${key}`;
    const existing = this.records.get(recordKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) return { state: "payload_mismatch" };
      if (existing.state === "completed") return { state: "completed", response: structuredClone(existing.response) };
      return { state: "in_progress" };
    }
    const leaseToken = randomUUID();
    this.records.set(recordKey, { payloadHash, leaseToken, state: "in_progress" });
    return { state: "acquired", leaseToken };
  }

  async complete(scope: string, key: string, leaseToken: string, response: unknown): Promise<void> {
    const recordKey = `${scope}:${key}`;
    const existing = this.records.get(recordKey);
    if (!existing || existing.leaseToken !== leaseToken || existing.state !== "in_progress") {
      throw new Error("Idempotency lease is no longer valid");
    }
    this.records.set(recordKey, { ...existing, state: "completed", response: structuredClone(response) });
  }

  async release(scope: string, key: string, leaseToken: string): Promise<void> {
    const recordKey = `${scope}:${key}`;
    const existing = this.records.get(recordKey);
    if (existing?.leaseToken === leaseToken && existing.state === "in_progress") this.records.delete(recordKey);
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Idempotency payload contains a non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("Idempotency payload contains an unsupported value");
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(IDEMPOTENCY_REPOSITORY) private readonly repository: IdempotencyRepository) {}

  async execute<T>(scope: string, key: string, payload: unknown, operation: () => Promise<T>): Promise<T> {
    const payloadHash = createHash("sha256").update(canonicalJson(payload)).digest("hex");
    const acquired = await this.repository.acquire(scope, key, payloadHash);
    if (acquired.state === "payload_mismatch") {
      throw new ApiError(
        "IDEMPOTENCY_PAYLOAD_MISMATCH",
        "This idempotency key was already used with a different request payload",
        409,
      );
    }
    if (acquired.state === "in_progress") {
      throw new ApiError("VERSION_CONFLICT", "An operation with this idempotency key is still in progress", 409);
    }
    if (acquired.state === "completed") return acquired.response as T;

    try {
      const response = await operation();
      await this.repository.complete(scope, key, acquired.leaseToken, response);
      return response;
    } catch (error) {
      await this.repository.release(scope, key, acquired.leaseToken);
      throw error;
    }
  }
}

@Global()
@Module({
  imports: [PersistenceModule],
  providers: [
    {
      provide: IDEMPOTENCY_REPOSITORY,
      inject: [PERSISTENCE_MODE, DATABASE],
      useFactory: (mode: PersistenceMode, database: Database | null): IdempotencyRepository =>
        mode === "postgres"
          ? new PostgresIdempotencyRepository(requireDatabase(database))
          : new InMemoryIdempotencyRepository(),
    },
    IdempotencyService,
  ],
  exports: [IDEMPOTENCY_REPOSITORY, IdempotencyService],
})
export class IdempotencyModule {}
