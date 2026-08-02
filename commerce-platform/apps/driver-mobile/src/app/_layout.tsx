import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppProvider } from "@/providers/app-provider";
import { colors } from "@/theme";

export default function RootLayout() {
  return <AppProvider><StatusBar style="dark" /><Stack screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: "700" }, headerBackButtonDisplayMode: "minimal", contentStyle: { backgroundColor: colors.background } }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="sign-in" options={{ headerShown: false }} />
    <Stack.Screen name="permissions" options={{ title: "App permissions", headerBackVisible: false }} />
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="offer/[id]" options={{ title: "Delivery offer", presentation: "modal" }} />
    <Stack.Screen name="delivery/[id]" options={{ title: "Active delivery", headerBackVisible: false }} />
    <Stack.Screen name="emergency" options={{ title: "Emergency and safety", presentation: "modal" }} />
    <Stack.Screen name="sync-queue" options={{ title: "Pending sync" }} />
  </Stack></AppProvider>;
}
