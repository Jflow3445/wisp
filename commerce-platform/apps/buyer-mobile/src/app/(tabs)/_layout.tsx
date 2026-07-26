import { Tabs } from "expo-router";
import { Home, Package, Search, ShoppingCart, UserRound } from "lucide-react-native";

import { useCommerceStore } from "@/lib/commerce-store";
import { colors } from "@/theme";

export default function BuyerTabs() {
  const count = useCommerceStore((state) => state.lines.reduce((total, line) => total + line.quantity, 0));
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 62 },
        tabBarLabelStyle: { fontSize: 11, paddingBottom: 4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }} />
      <Tabs.Screen name="cart" options={{ title: "Cart", tabBarBadge: count || undefined, tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: ({ color, size }) => <Package color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
