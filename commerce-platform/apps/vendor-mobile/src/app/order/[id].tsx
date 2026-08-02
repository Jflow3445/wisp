import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Check, Clock3, PackageCheck, X } from "lucide-react-native";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Button, Card, Divider, PageHeader, QueryState, Screen, SectionHeader, StatusBadge } from "@/components/ui";
import { vendorData, type VendorOrder } from "@/data";
import { formatMoney, formatTime, newIdempotencyKey } from "@/lib/format";
import { useVendorStore } from "@/lib/vendor-store";
import { colors, spacing } from "@/theme";

type Action = VendorOrder["availableActions"][number];
const actionLabels: Record<Action, string> = { ACCEPT: "Accept order", REJECT: "Reject order", START_PICKING: "Start preparing", MARK_READY: "Mark ready" };

export default function VendorOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const scope = useVendorStore((state) => state.scope);
  const order = useQuery({ queryKey: ["vendor-order", id, scope?.locationId], queryFn: () => vendorData.getOrder(scope!, id), enabled: Boolean(scope && id), refetchInterval: 30_000 });
  const transition = useMutation({
    mutationFn: ({ current, action, reason }: { current: VendorOrder; action: Action; reason?: string }) => vendorData.transitionOrder(scope!, { orderId: current.id, action, expectedVersion: current.version, reason, idempotencyKey: newIdempotencyKey(`order-${action.toLowerCase()}`) }),
    onSuccess: (updated) => { queryClient.setQueryData(["vendor-order", id, scope?.locationId], updated); void queryClient.invalidateQueries({ queryKey: ["vendor-orders"] }); void queryClient.invalidateQueries({ queryKey: ["vendor-dashboard"] }); },
  });
  if (!order.data) return <Screen><QueryState loading={order.isLoading} error={order.error} onRetry={() => void order.refetch()} /></Screen>;
  const current = order.data;

  const run = (action: Action) => {
    if (action === "REJECT") {
      Alert.prompt?.("Reject order", "A reason is required and will be recorded in the order history.", (reason) => { if (reason?.trim()) transition.mutate({ current, action, reason: reason.trim() }); });
      if (!Alert.prompt) Alert.alert("Rejection requires the web portal", "This device does not support secure reason entry for this action.");
      return;
    }
    Alert.alert(actionLabels[action], `Apply this action to ${current.reference}?`, [{ text: "Cancel", style: "cancel" }, { text: "Confirm", onPress: () => transition.mutate({ current, action }) }]);
  };

  return (
    <Screen>
      <PageHeader title={current.reference} subtitle={`Placed ${formatTime(current.placedAt)} · Version ${current.version}`} />
      <View style={styles.summary}><StatusBadge label={current.status} tone="info" /><Text style={styles.total}>{formatMoney(current.total)}</Text></View>
      {current.respondBy ? <Card style={styles.deadline}><Clock3 color={colors.danger} size={21} /><View style={styles.grow}><Text style={styles.strong}>Response deadline</Text><Text style={styles.meta}>{formatTime(current.respondBy)}</Text></View></Card> : null}
      <Card><View style={styles.rowBetween}><Text style={styles.meta}>Customer</Text><Text style={styles.strong}>{current.customerName}</Text></View><Divider /><View style={styles.rowBetween}><Text style={styles.meta}>Fulfilment</Text><Text style={styles.strong}>{current.deliveryMethod === "DELIVERY" ? "Platform delivery" : "Customer pickup"}</Text></View></Card>
      <View style={styles.section}><SectionHeader title="Items" />
        {current.lines.map((line) => <Card key={line.id} style={styles.line}><PackageCheck color={colors.primary} size={21} /><View style={styles.grow}><Text style={styles.strong}>{line.name}</Text><Text style={styles.meta}>Required {line.quantity} · Picked {line.pickedQuantity}</Text></View>{line.pickedQuantity === line.quantity ? <Check color={colors.primary} size={19} /> : null}</Card>)}
      </View>
      {transition.error ? <Card><Text accessibilityRole="alert" style={styles.error}>The order changed or the action could not be applied. Refresh the order before retrying.</Text><Button label="Refresh order" variant="secondary" onPress={() => void order.refetch()} /></Card> : null}
      {current.availableActions.map((action) => <Button key={action} label={actionLabels[action]} icon={action === "REJECT" ? X : Check} variant={action === "REJECT" ? "danger" : "primary"} loading={transition.isPending && transition.variables?.action === action} disabled={transition.isPending} onPress={() => run(action)} />)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }, total: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  deadline: { flexDirection: "row", alignItems: "center", borderColor: colors.danger }, grow: { flex: 1, gap: 3 }, strong: { color: colors.text, fontSize: 14, fontWeight: "700" }, meta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md }, section: { gap: spacing.sm }, line: { flexDirection: "row", alignItems: "center" }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});
