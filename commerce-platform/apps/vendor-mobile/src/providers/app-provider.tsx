import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export function AppProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, gcTime: 12 * 60 * 60_000, retry: 1, networkMode: "offlineFirst" }, mutations: { retry: 0, networkMode: "online" } } }));
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (Platform.OS !== "web") focusManager.setFocused(state === "active"); });
    return () => subscription.remove();
  }, []);
  return <SafeAreaProvider><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></SafeAreaProvider>;
}
