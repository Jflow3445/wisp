import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronRight, Clock3, RefreshCw, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { PageHeader, QueryState, StatusBadge } from "@/components/ui";
import { vendorData, type VendorOrder } from "@/data";
import { formatMoney, formatTime } from "@/lib/format";
import { useVendorStore } from "@/lib/vendor-store";
import { colors, spacing } from "@/theme";

const filters = ["ALL", "AWAITING_VENDOR_RESPONSE", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"] as const;

export default function OrdersScreen() {
  const router = useRouter();
  const scope = useVendorStore((state) => state.scope);
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [search, setSearch] = useState("");
  const orders = useQuery({ queryKey: ["vendor-orders", scope?.vendorId, scope?.locationId], queryFn: () => vendorData.listOrders(scope!), enabled: Boolean(scope) });
  const visible = useMemo(() => (orders.data ?? []).filter((order) => {
    const matchesFilter = filter === "ALL" || order.status === filter;
    const needle = search.trim().toLowerCase();
    return matchesFilter && (!needle || `${order.reference} ${order.customerName}`.toLowerCase().includes(needle));
  }), [filter, orders.data, search]);

  return (
    <View style={styles.screen}>
      <PageHeader title="Orders" subtitle={`${scope?.locationName ?? "Store"} order queue`} />
      <View style={styles.search}><Search color={colors.muted} size={18} /><TextInput accessibilityLabel="Search orders" value={search} onChangeText={setSearch} placeholder="Reference or customer" placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[styles.filter, filter === item ? styles.filterActive : null]}><Text style={[styles.filterText, filter === item ? styles.filterTextActive : null]}>{item === "ALL" ? "All" : item.replaceAll("_", " ")}</Text></Pressable>)}
      </ScrollView>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()} tintColor={colors.primary} />}>
        <QueryState loading={orders.isLoading} error={orders.error} empty={!orders.isLoading && visible.length === 0} emptyLabel="No orders match this view." onRetry={() => void orders.refetch()} />
        {visible.map((order) => <OrderRow key={order.id} order={order} referenceTime={orders.dataUpdatedAt} onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })} />)}
      </ScrollView>
      {orders.data ? <View style={styles.footer}><RefreshCw color={colors.muted} size={14} /><Text style={styles.footerText}>{visible.length} of {orders.data.length} orders</Text></View> : null}
    </View>
  );
}

function OrderRow({ order, referenceTime, onPress }: { order: VendorOrder; referenceTime: number; onPress: () => void }) {
  const urgent = order.respondBy ? new Date(order.respondBy).getTime() - referenceTime < 10 * 60_000 : false;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open order ${order.reference}`} onPress={onPress} style={({ pressed }) => [styles.order, pressed ? styles.pressed : null]}>
      <View style={styles.orderTop}><Text style={styles.reference}>{order.reference}</Text><StatusBadge label={order.status} tone={urgent ? "danger" : "info"} /></View>
      <Text style={styles.customer}>{order.customerName} · {order.lines.length} item line{order.lines.length === 1 ? "" : "s"}</Text>
      <View style={styles.orderBottom}><View style={styles.time}><Clock3 color={urgent ? colors.danger : colors.muted} size={14} /><Text style={[styles.meta, urgent ? styles.urgent : null]}>{order.respondBy ? `Respond by ${formatTime(order.respondBy)}` : formatTime(order.placedAt)}</Text></View><Text style={styles.total}>{formatMoney(order.total)}</Text><ChevronRight color={colors.muted} size={19} /></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg, gap: spacing.md },
  search: { marginHorizontal: spacing.lg, minHeight: 46, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: spacing.sm },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, minHeight: 44 },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  filter: { minHeight: 38, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  filterTextActive: { color: colors.surface },
  list: { flex: 1 }, listContent: { padding: spacing.lg, paddingTop: spacing.xs, gap: spacing.sm },
  order: { borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.sm },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  reference: { color: colors.text, fontSize: 16, fontWeight: "800" },
  customer: { color: colors.text, fontSize: 14 },
  orderBottom: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  time: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { color: colors.muted, fontSize: 12, flexShrink: 1 }, urgent: { color: colors.danger, fontWeight: "700" },
  total: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  footer: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  footerText: { color: colors.muted, fontSize: 12 }, pressed: { opacity: 0.68 },
});
