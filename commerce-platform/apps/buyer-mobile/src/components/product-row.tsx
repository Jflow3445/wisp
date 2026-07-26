import { ChevronRight, ShoppingBag } from "lucide-react-native";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Product } from "@/data";
import { formatMoney } from "@/lib/format";
import { colors, spacing } from "@/theme";
import { StatusBadge } from "./ui";

export function ProductRow({ product }: { product: Product }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${product.name}, ${formatMoney(product.offer.price)}, sold by ${product.offer.vendorName}`}
      onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.icon} accessibilityElementsHidden>
        <ShoppingBag color={colors.primary} size={24} />
      </View>
      <View style={styles.body}>
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.meta}>{product.offer.vendorName}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMoney(product.offer.price)}</Text>
          {product.offer.stockStatus === "LOW_STOCK" ? <StatusBadge label="Low stock" tone="warning" /> : null}
        </View>
      </View>
      <ChevronRight color={colors.muted} size={20} accessibilityElementsHidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 94, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomColor: colors.border, borderBottomWidth: 1 },
  pressed: { opacity: 0.66 },
  icon: { width: 48, height: 48, borderRadius: 6, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 3 },
  name: { color: colors.text, fontSize: 16, fontWeight: "700", lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 13 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  price: { color: colors.primary, fontSize: 15, fontWeight: "800" },
});
