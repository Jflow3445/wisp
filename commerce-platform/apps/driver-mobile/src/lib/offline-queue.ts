import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useStore } from "zustand";
import type { StateStorage } from "zustand/middleware";

import { createOfflineQueue, type OfflineQueueState } from "./offline-queue-core";

const secureStorage: StateStorage = { getItem: (name) => SecureStore.getItemAsync(name), setItem: (name, value) => SecureStore.setItemAsync(name, value), removeItem: (name) => SecureStore.deleteItemAsync(name) };

export const offlineQueue = createOfflineQueue(secureStorage, Crypto.randomUUID);
export const useOfflineQueue = <T>(selector: (state: OfflineQueueState) => T): T => useStore(offlineQueue, selector);
export { createOfflineQueue } from "./offline-queue-core";
export type { OfflineQueueState, QueueInput } from "./offline-queue-core";
