import { useQuery } from "@tanstack/react-query";
import { Banknote, CalendarClock, Landmark } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Card, Divider, PageHeader, QueryState, Screen, SectionHeader, StatusBadge } from "@/components/ui";
import { vendorData } from "@/data";
import { formatMoney, formatTime } from "@/lib/format";
import { useVendorStore } from "@/lib/vendor-store";
import { colors, spacing } from "@/theme";

export default function FinanceScreen() {
  const scope = useVendorStore((state) => state.scope);
  const finance = useQuery({ queryKey: ["vendor-finance", scope?.vendorId], queryFn: () => vendorData.finance(scope!), enabled: Boolean(scope) });
  return (
    <Screen>
      <PageHeader title="Finance" subtitle="Read-only earnings and payout position." />
      <QueryState loading={finance.isLoading} error={finance.error} onRetry={() => void finance.refetch()} />
      {finance.data ? <>
        <View style={styles.metrics}>
          <Card style={styles.metric}><Landmark color={colors.primary} size={21} /><Text style={styles.label}>Available payout</Text><Text style={styles.amount}>{formatMoney(finance.data.availableBalance)}</Text></Card>
          <Card style={styles.metric}><Banknote color={colors.info} size={21} /><Text style={styles.label}>Pending earnings</Text><Text style={styles.amount}>{formatMoney(finance.data.pendingBalance)}</Text></Card>
        </View>
        <Card><View style={styles.row}><CalendarClock color={colors.primary} size={21} /><View style={styles.grow}><Text style={styles.strong}>Next payout</Text><Text style={styles.meta}>{finance.data.nextPayoutAt ? formatTime(finance.data.nextPayoutAt) : "Not scheduled"}</Text></View></View><Divider /><View style={styles.rowBetween}><Text style={styles.meta}>Last 7 days</Text><Text style={styles.strong}>{formatMoney(finance.data.lastSevenDays)}</Text></View></Card>
        <View style={styles.section}><SectionHeader title="Recent payouts" />{finance.data.recentPayouts.length === 0 ? <Text style={styles.meta}>No payouts yet.</Text> : finance.data.recentPayouts.map((payout) => <Card key={payout.id}><View style={styles.rowBetween}><View style={styles.grow}><Text style={styles.strong}>{payout.reference}</Text><Text style={styles.meta}>{formatTime(payout.createdAt)}</Text></View><View style={styles.right}><Text style={styles.strong}>{formatMoney(payout.amount)}</Text><StatusBadge label={payout.status} tone={payout.status === "PAID" ? "success" : payout.status === "FAILED" ? "danger" : "warning"} /></View></View></Card>)}</View>
      </> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: "row", gap: spacing.sm }, metric: { flex: 1, minHeight: 132 }, label: { color: colors.muted, fontSize: 12 }, amount: { color: colors.text, fontSize: 19, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md }, rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }, grow: { flex: 1, gap: 3 }, right: { alignItems: "flex-end", gap: spacing.xs },
  strong: { color: colors.text, fontSize: 14, fontWeight: "700" }, meta: { color: colors.muted, fontSize: 13, lineHeight: 18 }, section: { gap: spacing.sm },
});
