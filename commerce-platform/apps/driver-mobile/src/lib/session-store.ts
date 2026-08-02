import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import type { DriverSession } from "@/data/types";

const secureStorage: StateStorage = { getItem: (name) => SecureStore.getItemAsync(name), setItem: (name, value) => SecureStore.setItemAsync(name, value), removeItem: (name) => SecureStore.deleteItemAsync(name) };
interface SessionState { session: DriverSession | null; hydrated: boolean; setSession: (session: DriverSession) => void; signOut: () => void; setHydrated: (value: boolean) => void; }

export const useSessionStore = create<SessionState>()(persist((set) => ({ session: null, hydrated: false, setSession: (session) => set({ session }), signOut: () => set({ session: null }), setHydrated: (hydrated) => set({ hydrated }) }), {
  name: "nister-driver-session-v1", storage: createJSONStorage(() => secureStorage), partialize: (state) => ({ session: state.session }), onRehydrateStorage: () => (state) => state?.setHydrated(true),
}));
