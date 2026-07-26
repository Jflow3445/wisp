import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { Building2, ChevronRight, MapPin } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, PageHeader, QueryState, Screen } from "@/components/ui";
import { vendorData } from "@/data";
import { useSessionStore } from "@/lib/session-store";
import { useVendorStore } from "@/lib/vendor-store";
import { colors, spacing } from "@/theme";

export default function ScopeScreen() {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const setScope = useVendorStore((state) => state.setScope);
  const scopes = useQuery({ queryKey: ["vendor-scopes"], queryFn: vendorData.listScopes, enabled: Boolean(session) });
  if (!session) return <Redirect href="/sign-in" />;
  return (
    <Screen>
      <PageHeader title="Choose a store" subtitle="All actions and totals will use this vendor and location scope." />
      <QueryState loading={scopes.isLoading} error={scopes.error} empty={scopes.data?.length === 0} emptyLabel="Your account has no assigned store locations." onRetry={() => void scopes.refetch()} />
      {scopes.data?.map((scope) => (
        <Pressable key={`${scope.vendorId}-${scope.locationId}`} accessibilityRole="button" accessibilityLabel={`${scope.vendorName}, ${scope.locationName}, ${scope.role}`} onPress={() => { setScope(scope); router.replace("/(tabs)"); }} style={({ pressed }) => pressed ? styles.pressed : null}>
          <Card style={styles.scopeCard}>
            <View style={styles.icon}><Building2 color={colors.primary} size={24} /></View>
            <View style={styles.body}><Text style={styles.vendor}>{scope.vendorName}</Text><View style={styles.location}><MapPin color={colors.muted} size={15} /><Text style={styles.meta}>{scope.locationName} · {scope.role}</Text></View></View>
            <ChevronRight color={colors.muted} size={21} />
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({ scopeCard: { flexDirection: "row", alignItems: "center" }, icon: { width: 48, height: 48, borderRadius: 6, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }, body: { flex: 1, gap: 5 }, vendor: { color: colors.text, fontSize: 17, fontWeight: "800" }, location: { flexDirection: "row", alignItems: "center", gap: 5 }, meta: { color: colors.muted, fontSize: 13, flexShrink: 1 }, pressed: { opacity: 0.68 } });
