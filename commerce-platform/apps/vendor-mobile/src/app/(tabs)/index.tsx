import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { AlertTriangle, ArrowRight, Banknote, Boxes, ClipboardList, Clock3 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, PageHeader, QueryState, SectionHeader, StatusBadge } from "@/components/ui";
import { dataMode, vendorData } from "@/data";
import { formatMoney } from "@/lib/format";
import { useVendorStore } from "@/lib/vendor-store";
import { colors, spacing } from "@/theme";

export default function DashboardScreen() {
  const router = useRouter();
  const scope = useVendorStore((state) => state.scope);
  const dashboard = useQuery({
    queryKey: ["vendor-dashboard", scope?.vendorId, scope?.locationId],
    queryFn: () => vendorData.dashboard(scope!),
    enabled: Boolean(scope),
    refetchInterval: 60_000,
  });

  return (
    <View style={styles.screen}>
      <PageHeader title={scope?.locationName ?? "Dashboard"} subtitle={scope ? `${scope.vendorName} · ${scope.role}` : "Select a store to continue."} />
      {dataMode === "demo" ? <StatusBadge label="Development demo data" tone="warning" /> : null}
      <QueryState loading={dashboard.isLoading} error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      {dashboard.data ? (
        <>
          <View style={styles.metrics}>
            <Metric icon={ClipboardList} label="New orders" value={String(dashboard.data.newOrders)} tone="info" />
            <Metric icon={Clock3} label="Due soon" value={String(dashboard.data.dueSoon)} tone="warning" />
            <Metric icon={Boxes} label="Low stock" value={String(dashboard.data.lowStock)} tone="danger" />
            <Metric icon={Banknote} label="Sales today" value={formatMoney(dashboard.data.salesToday)} tone="success" />
          </View>
          {dashboard.data.dueSoon > 0 ? (
            <Card style={styles.warning}>
              <AlertTriangle color={colors.danger} size={22} />
              <View style={styles.grow}><Text style={styles.warningTitle}>An order needs a response</Text><Text style={styles.meta}>Review it before the vendor response deadline.</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Review orders" onPress={() => router.push("/(tabs)/orders")}><ArrowRight color={colors.primary} size={22} /></Pressable>
            </Card>
          ) : null}
          <View style={styles.section}>
            <SectionHeader title="Quick actions" />
            <QuickAction title="Process orders" detail="Accept, prepare, and mark ready" onPress={() => router.push("/(tabs)/orders")} />
            <QuickAction title="Update stock" detail="Review low and out-of-stock products" onPress={() => router.push("/(tabs)/inventory")} />
          </View>
        </>
      ) : null}
    </View>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof ClipboardList; label: string; value: string; tone: "info" | "warning" | "danger" | "success" }) {
  const iconColor = tone === "danger" ? colors.danger : tone === "warning" ? "#765500" : tone === "info" ? colors.info : colors.primary;
  return <Card style={styles.metric}><Icon color={iconColor} size={20} /><Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={styles.meta}>{label}</Text></Card>;
}

function QuickAction({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`} onPress={onPress} style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}><View style={styles.grow}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.meta}>{detail}</Text></View><ArrowRight color={colors.primary} size={20} /></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: { width: "48%", minHeight: 118, justifyContent: "space-between" },
  metricValue: { color: colors.text, fontSize: 21, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  warning: { flexDirection: "row", alignItems: "center" },
  warningTitle: { color: colors.text, fontWeight: "700", fontSize: 15 },
  grow: { flex: 1, gap: spacing.xs },
  section: { gap: spacing.sm },
  action: { minHeight: 66, borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  actionTitle: { color: colors.text, fontWeight: "700", fontSize: 15 },
  pressed: { opacity: 0.68 },
});
