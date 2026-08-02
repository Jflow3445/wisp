import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";

import { createOfflineQueue } from "./offline-queue-core";

function memoryStorage(): StateStorage {
  const values = new Map<string, string>();
  return { getItem: (name) => values.get(name) ?? null, setItem: (name, value) => { values.set(name, value); }, removeItem: (name) => { values.delete(name); } };
}

describe("driver offline queue", () => {
  let counter = 0;
  beforeEach(() => { counter = 0; });

  it("assigns stable IDs and retains optimistic versions", () => {
    const queue = createOfflineQueue(memoryStorage(), () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`, () => "2026-08-01T12:00:00.000Z");
    const event = queue.getState().enqueue({ kind: "DELIVERY_ACTION", entityId: "delivery-1", expectedVersion: 4, payload: { action: "ARRIVED_AT_PICKUP" } });
    expect(event.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(event.expectedVersion).toBe(4);
    expect(queue.getState().events).toEqual([event]);
  });

  it("tracks attempts and requires an explicit retry after failure", () => {
    const queue = createOfflineQueue(memoryStorage(), () => "00000000-0000-4000-8000-000000000001");
    const event = queue.getState().enqueue({ kind: "DELIVERY_NOTE", entityId: "delivery-1", expectedVersion: null, payload: { note: "Gate closed" } });
    queue.getState().markSyncing(event.id);
    queue.getState().markFailed(event.id, "PROVIDER_UNAVAILABLE");
    expect(queue.getState().events[0]).toMatchObject({ attempts: 1, status: "FAILED", lastError: "PROVIDER_UNAVAILABLE" });
    queue.getState().markPending(event.id);
    expect(queue.getState().events[0]).toMatchObject({ attempts: 1, status: "PENDING", lastError: null });
  });

  it("does not discard version conflicts", () => {
    const queue = createOfflineQueue(memoryStorage(), () => "00000000-0000-4000-8000-000000000001");
    const event = queue.getState().enqueue({ kind: "DELIVERY_ACTION", entityId: "delivery-1", expectedVersion: 2, payload: { action: "COMPLETE" } });
    queue.getState().markConflict(event.id, "VERSION_CONFLICT");
    expect(queue.getState().events[0]?.status).toBe("CONFLICT");
  });
});
