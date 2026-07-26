import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, PageHeader, QueryState, StatusBadge } from "@/components/ui";
import { buyerData, type BuyerOrder } from "@/data";
import { formatDate, formatMoney } from "@/lib/format";
import { colors, spacing } from "@/theme";

function statusTone(status: BuyerOrder["status"]): "success" | "warning" | "info" | "neutral" {
  if (status === "COMPLETED") return "success";
  if (status === "PAYMENT_PENDING" || status === "PAYMENT_REVIEW") return "warning";
  if (["CONFIRMED", "PROCESSING", "PARTIALLY_ACCEPTED", "PARTIALLY_FULFILLED"].includes(status)) return "info";
  return "neutral";
}

export default function OrdersScreen() {
  const router = useRouter();
  const orders = useQuery({ queryKey: ["buyer-orders"], queryFn: buyerData.listOrders });
  return (
    <View style={styles.screen}>
      <PageHeader title="Orders" subtitle="Open an order for its latest delivery status." />
      <QueryState loading={orders.isLoading} error={orders.error} empty={orders.data?.length === 0} emptyLabel="You have not placed an order yet." onRetry={() => void orders.refetch()} />
      {orders.data?.map((order) => (
        <Pressable
          key={order.id}
          accessibilityRole="link"
          accessibilityLabel={`Order ${order.reference}, ${order.status}, ${formatMoney(order.total)}`}
          onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
          style={({ pressed }) => pressed ? styles.pressed : null}
        >
          <Card>
            <View style={styles.row}><Text style={styles.reference}>{order.reference}</Text><StatusBadge label={order.status} tone={statusTone(order.status)} /></View>
            <Text style={styles.meta}>{formatDate(order.placedAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</Text>
            <View style={styles.row}><Text style={styles.total}>{formatMoney(order.total)}</Text><ChevronRight color={colors.muted} size={20} /></View>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  reference: { color: colors.text, fontSize: 17, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  total: { color: colors.primary, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.66 },
});
