import { Tabs } from "expo-router";
import { CircleUserRound, History, House, WalletCards } from "lucide-react-native";

import { colors } from "@/theme";

export default function DriverTabs() {
  return <Tabs screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: "700" }, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 62 }, tabBarLabelStyle: { fontSize: 11, paddingBottom: 4 } }}>
    <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
    <Tabs.Screen name="deliveries" options={{ title: "Deliveries", tabBarIcon: ({ color, size }) => <History color={color} size={size} /> }} />
    <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: ({ color, size }) => <WalletCards color={color} size={size} /> }} />
    <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color, size }) => <CircleUserRound color={color} size={size} /> }} />
  </Tabs>;
}
