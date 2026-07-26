import { describe, expect, it, vi } from "vitest";
import { OutboxDispatcher, type OutboxEvent, type OutboxRepository, type QueueRegistry } from "./outbox-dispatcher.js";
import { queueNames, stableJobId } from "./queues.js";

describe("worker idempotency", () => {
  it("uses stable queue job identifiers", () => {
    expect(stableJobId("payments", "event-1")).toBe("payments:event-1");
  });

  it("marks an outbox event only after the queue accepts it", async () => {
    const event: OutboxEvent = {
      id: "event-1",
      eventType: "payment.reconcile",
      queue: "payments",
      requestId: "request-1",
      payload: {},
      createdAt: new Date("2026-07-20T00:00:00Z"),
      attemptCount: 0,
    };
    const repository: OutboxRepository = {
      claimBatch: vi.fn().mockResolvedValue([event]),
      markProcessed: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    };
    const add = vi.fn().mockResolvedValue(undefined);
    const queues = Object.fromEntries(queueNames.map((name) => [name, { add }])) as unknown as QueueRegistry;
    const result = await new OutboxDispatcher(repository, queues).dispatchBatch();

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(add).toHaveBeenCalledWith("payment.reconcile", expect.any(Object), expect.objectContaining({ jobId: "payments:event-1" }));
    expect(repository.markProcessed).toHaveBeenCalledWith("event-1");
  });
});
