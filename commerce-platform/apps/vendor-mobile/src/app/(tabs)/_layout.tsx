import { Tabs } from "expo-router";
import { ClipboardList, Landmark, LayoutDashboard, PackageSearch, UserRound } from "lucide-react-native";

import { colors } from "@/theme";

export default function VendorTabs() {
  return (
    <Tabs screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: "700" }, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 62 }, tabBarLabelStyle: { fontSize: 11, paddingBottom: 4 } }}>
      <Tabs.Screen name="index" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen name="inventory" options={{ title: "Inventory", tabBarIcon: ({ color, size }) => <PackageSearch color={color} size={size} /> }} />
      <Tabs.Screen name="finance" options={{ title: "Finance", tabBarIcon: ({ color, size }) => <Landmark color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
