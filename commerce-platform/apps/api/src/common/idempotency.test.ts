import { describe, expect, it, vi } from "vitest";
import { IdempotencyService, InMemoryIdempotencyRepository } from "./idempotency.js";

describe("IdempotencyService", () => {
  it("replays a completed response without repeating the operation", async () => {
    const service = new IdempotencyService(new InMemoryIdempotencyRepository());
    const operation = vi.fn(async () => ({ id: "result-1" }));
    await expect(service.execute("scope", "key-12345", { b: 2, a: 1 }, operation)).resolves.toEqual({ id: "result-1" });
    await expect(service.execute("scope", "key-12345", { a: 1, b: 2 }, operation)).resolves.toEqual({ id: "result-1" });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("rejects key reuse with a different payload", async () => {
    const service = new IdempotencyService(new InMemoryIdempotencyRepository());
    await service.execute("scope", "key-12345", { quantity: "1" }, async () => "ok");
    await expect(service.execute("scope", "key-12345", { quantity: "2" }, async () => "wrong")).rejects.toMatchObject({
      code: "IDEMPOTENCY_PAYLOAD_MISMATCH",
    });
  });

  it("releases a failed operation so it can be retried", async () => {
    const service = new IdempotencyService(new InMemoryIdempotencyRepository());
    await expect(service.execute("scope", "key-12345", {}, async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(service.execute("scope", "key-12345", {}, async () => "retried")).resolves.toBe("retried");
  });
});
