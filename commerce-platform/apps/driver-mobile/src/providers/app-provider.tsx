import { focusManager, QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useNetworkState } from "expo-network";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { driverData } from "@/data";
import { offlineQueue, useOfflineQueue } from "@/lib/offline-queue";

function OfflineSync() {
  const queryClient = useQueryClient();
  const network = useNetworkState();
  const events = useOfflineQueue((state) => state.events);
  const syncing = useRef(false);
  useEffect(() => {
    if (!network.isConnected || network.isInternetReachable === false || syncing.current) return;
    const pending = events.filter((event) => event.status === "PENDING");
    if (!pending.length) return;
    syncing.current = true;
    void (async () => {
      for (const event of pending) {
        offlineQueue.getState().markSyncing(event.id);
        try { await driverData.syncEvent(event); offlineQueue.getState().remove(event.id); }
        catch (error) { const message = error instanceof Error ? error.message : "SYNC_FAILED"; if (message.includes("VERSION_CONFLICT") || message.includes("INVALID_STATE_TRANSITION")) offlineQueue.getState().markConflict(event.id, message); else offlineQueue.getState().markFailed(event.id, message); }
      }
      await queryClient.invalidateQueries({ queryKey: ["driver-delivery"] });
      await queryClient.invalidateQueries({ queryKey: ["driver-home"] });
      syncing.current = false;
    })();
  }, [events, network.isConnected, network.isInternetReachable, queryClient]);
  return null;
}

export function AppProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 12 * 60 * 60_000, retry: 1, networkMode: "offlineFirst" }, mutations: { retry: 0, networkMode: "online" } } }));
  useEffect(() => { const subscription = AppState.addEventListener("change", (state) => { if (Platform.OS !== "web") focusManager.setFocused(state === "active"); }); return () => subscription.remove(); }, []);
  return <SafeAreaProvider><QueryClientProvider client={queryClient}><OfflineSync />{children}</QueryClientProvider></SafeAreaProvider>;
}
