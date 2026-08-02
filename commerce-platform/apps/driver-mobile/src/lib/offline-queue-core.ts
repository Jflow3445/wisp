import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import { OfflineEventSchema, type OfflineEvent } from "@/data/types";

export interface QueueInput { kind: OfflineEvent["kind"]; entityId: string; expectedVersion: number | null; payload: Record<string, unknown>; }
export interface OfflineQueueState {
  events: OfflineEvent[];
  hydrated: boolean;
  enqueue: (input: QueueInput) => OfflineEvent;
  markSyncing: (id: string) => void;
  markConflict: (id: string, reason: string) => void;
  markFailed: (id: string, reason: string) => void;
  markPending: (id: string) => void;
  remove: (id: string) => void;
  setHydrated: (value: boolean) => void;
}

export function createOfflineQueue(storage: StateStorage, createId: () => string, now: () => string = () => new Date().toISOString()) {
  return createStore<OfflineQueueState>()(persist((set, get) => ({
    events: [], hydrated: false,
    enqueue: (input) => { const event = OfflineEventSchema.parse({ id: createId(), ...input, createdAt: now(), attempts: 0, status: "PENDING", lastError: null }); set({ events: [...get().events, event] }); return event; },
    markSyncing: (id) => set((state) => ({ events: state.events.map((event) => event.id === id ? { ...event, status: "SYNCING", attempts: event.attempts + 1, lastError: null } : event) })),
    markConflict: (id, reason) => set((state) => ({ events: state.events.map((event) => event.id === id ? { ...event, status: "CONFLICT", lastError: reason } : event) })),
    markFailed: (id, reason) => set((state) => ({ events: state.events.map((event) => event.id === id ? { ...event, status: "FAILED", lastError: reason } : event) })),
    markPending: (id) => set((state) => ({ events: state.events.map((event) => event.id === id ? { ...event, status: "PENDING", lastError: null } : event) })),
    remove: (id) => set((state) => ({ events: state.events.filter((event) => event.id !== id) })),
    setHydrated: (hydrated) => set({ hydrated }),
  }), { name: "nister-driver-offline-events-v1", storage: createJSONStorage(() => storage), partialize: (state) => ({ events: state.events }), onRehydrateStorage: () => (state) => state?.setHydrated(true) }));
}
