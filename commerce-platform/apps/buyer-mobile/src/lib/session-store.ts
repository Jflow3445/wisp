import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export interface BuyerSession {
  accessToken: string;
  displayName: string;
  phone: string;
}

interface SessionState {
  session: BuyerSession | null;
  hydrated: boolean;
  setSession: (session: BuyerSession) => void;
  signOut: () => void;
  setHydrated: (hydrated: boolean) => void;
}

const secureStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      session: null,
      hydrated: false,
      setSession: (session) => set({ session }),
      signOut: () => set({ session: null }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "nister-buyer-session-v1",
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ session: state.session }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);
