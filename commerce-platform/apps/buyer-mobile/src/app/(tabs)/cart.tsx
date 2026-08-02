import { useRouter } from "expo-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, Divider, PageHeader, QueryState, SectionHeader } from "@/components/ui";
import { cartTotal, useCommerceStore } from "@/lib/commerce-store";
import { formatMoney } from "@/lib/format";
import { colors, spacing } from "@/theme";

export default function CartScreen() {
  const router = useRouter();
  const lines = useCommerceStore((state) => state.lines);
  const setQuantity = useCommerceStore((state) => state.setQuantity);
  const removeLine = useCommerceStore((state) => state.removeLine);
  const total = cartTotal(lines);

  return (
    <View style={styles.screen}>
      <PageHeader title="Your cart" subtitle="Quantities and checkout details are saved on this device." />
      {lines.length === 0 ? <QueryState loading={false} error={null} empty emptyLabel="Your cart is empty." /> : null}
      {lines.map((line) => (
        <Card key={line.offerId}>
          <View style={styles.lineHeader}>
            <View style={styles.lineBody}>
              <Text style={styles.name}>{line.name}</Text>
              <Text style={styles.meta}>{line.vendorName} · {formatMoney(line.unitPrice)} each</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.name}`} hitSlop={10} onPress={() => removeLine(line.offerId)}>
              <Trash2 color={colors.danger} size={20} />
            </Pressable>
          </View>
          <View style={styles.quantityRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${line.name} quantity`} onPress={() => setQuantity(line.offerId, line.quantity - 1)} style={styles.iconButton}><Minus color={colors.primary} size={20} /></Pressable>
            <Text accessibilityLabel={`Quantity ${line.quantity}`} style={styles.quantity}>{line.quantity}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${line.name} quantity`} onPress={() => setQuantity(line.offerId, line.quantity + 1)} style={styles.iconButton}><Plus color={colors.primary} size={20} /></Pressable>
          </View>
        </Card>
      ))}
      {lines.length ? (
        <Card>
          <SectionHeader title="Order summary" />
          <View style={styles.summaryRow}><Text style={styles.meta}>Items</Text><Text style={styles.summaryValue}>{lines.reduce((sum, line) => sum + line.quantity, 0)}</Text></View>
          <Divider />
          <View style={styles.summaryRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.total}>{formatMoney(total)}</Text></View>
          <Text style={styles.note}>Delivery fees are confirmed at checkout.</Text>
          <Button label="Continue to checkout" icon={ShoppingBag} onPress={() => router.push("/checkout")} />
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg },
  lineHeader: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  lineBody: { flex: 1, gap: 4 },
  name: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  quantityRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  quantity: { minWidth: 34, textAlign: "center", color: colors.text, fontSize: 17, fontWeight: "700" },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  summaryValue: { color: colors.text, fontWeight: "700" },
  totalLabel: { color: colors.text, fontSize: 17, fontWeight: "800" },
  total: { color: colors.primary, fontSize: 18, fontWeight: "800" },
  note: { color: colors.muted, fontSize: 13 },
});
