import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Check, Circle, MapPin } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Card, PageHeader, QueryState, Screen, SectionHeader, StatusBadge } from "@/components/ui";
import { buyerData } from "@/data";
import { formatDate, formatMoney } from "@/lib/format";
import { colors, spacing } from "@/theme";

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useQuery({ queryKey: ["buyer-order", id], queryFn: () => buyerData.getOrder(id), enabled: Boolean(id), refetchInterval: 60_000 });
  if (!order.data) return <Screen><QueryState loading={order.isLoading} error={order.error} onRetry={() => void order.refetch()} /></Screen>;

  return (
    <Screen>
      <PageHeader title={order.data.reference} subtitle={`Placed ${formatDate(order.data.placedAt)}`} />
      <View style={styles.summary}><StatusBadge label={order.data.status} tone="info" /><Text style={styles.total}>{formatMoney(order.data.total)}</Text></View>
      {order.data.eta ? <Card><Text style={styles.etaLabel}>Estimated arrival</Text><Text style={styles.eta}>{order.data.eta}</Text></Card> : null}
      <View style={styles.section}>
        <SectionHeader title="Tracking" />
        <Card>
          {order.data.timeline.map((event, index) => (
            <View key={`${event.status}-${index}`} style={styles.timelineRow}>
              <View style={[styles.timelineIcon, event.complete ? styles.timelineComplete : null]}>
                {event.complete ? <Check color={colors.surface} size={15} /> : <Circle color={colors.muted} size={14} />}
              </View>
              <View style={styles.timelineBody}>
                <Text style={[styles.timelineLabel, !event.complete ? styles.pending : null]}>{event.label}</Text>
                {event.occurredAt ? <Text style={styles.meta}>{formatDate(event.occurredAt)}</Text> : <Text style={styles.meta}>Pending</Text>}
              </View>
            </View>
          ))}
        </Card>
      </View>
      <Card>
        <View style={styles.addressTitle}><MapPin color={colors.primary} size={19} /><Text style={styles.strong}>Delivery address</Text></View>
        <Text style={styles.body}>{order.data.deliveryAddress}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  total: { color: colors.primary, fontSize: 20, fontWeight: "850" },
  etaLabel: { color: colors.muted, fontSize: 13, fontWeight: "650" },
  eta: { color: colors.text, fontSize: 19, fontWeight: "800" },
  section: { gap: spacing.md },
  timelineRow: { flexDirection: "row", gap: spacing.md, minHeight: 58 },
  timelineIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  timelineComplete: { backgroundColor: colors.primary, borderColor: colors.primary },
  timelineBody: { flex: 1, gap: 3 },
  timelineLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  pending: { color: colors.muted, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 13 },
  addressTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  strong: { color: colors.text, fontSize: 15, fontWeight: "750" },
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
