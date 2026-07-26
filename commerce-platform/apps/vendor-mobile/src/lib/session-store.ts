import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export interface VendorSession { accessToken: string; displayName: string; email: string; }
interface SessionState { session: VendorSession | null; hydrated: boolean; setSession: (session: VendorSession) => void; signOut: () => void; setHydrated: (value: boolean) => void; }
const secureStorage: StateStorage = { getItem: (name) => SecureStore.getItemAsync(name), setItem: (name, value) => SecureStore.setItemAsync(name, value), removeItem: (name) => SecureStore.deleteItemAsync(name) };

export const useSessionStore = create<SessionState>()(persist((set) => ({ session: null, hydrated: false, setSession: (session) => set({ session }), signOut: () => set({ session: null }), setHydrated: (hydrated) => set({ hydrated }) }), {
  name: "nister-vendor-session-v1", storage: createJSONStorage(() => secureStorage), partialize: (state) => ({ session: state.session }), onRehydrateStorage: () => (state) => state?.setHydrated(true),
}));
