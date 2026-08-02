import { useQuery } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { driverData } from "@/data";
import { useSessionStore } from "@/lib/session-store";
import { colors } from "@/theme";

export default function IndexScreen() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const session = useSessionStore((state) => state.session);
  const active = useQuery({ queryKey: ["driver-delivery", "active"], queryFn: driverData.getActiveDelivery, enabled: Boolean(session), retry: false });
  if (!hydrated || (session && active.isLoading)) return <View accessibilityRole="progressbar" style={styles.loading}><ActivityIndicator color={colors.primary} /></View>;
  if (!session) return <Redirect href="/sign-in" />;
  if (active.data && active.data.status !== "COMPLETED") return <Redirect href={{ pathname: "/delivery/[id]", params: { id: active.data.id } }} />;
  return <Redirect href="/permissions" />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background } });
