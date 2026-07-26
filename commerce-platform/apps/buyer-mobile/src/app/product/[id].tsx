import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, ShoppingCart, Star } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, PageHeader, QueryState, Screen, StatusBadge } from "@/components/ui";
import { buyerData } from "@/data";
import { formatMoney } from "@/lib/format";
import { useCommerceStore } from "@/lib/commerce-store";
import { colors, spacing } from "@/theme";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const addLine = useCommerceStore((state) => state.addLine);
  const product = useQuery({ queryKey: ["product", id], queryFn: () => buyerData.getProduct(id), enabled: Boolean(id) });

  if (!product.data) {
    return <Screen><QueryState loading={product.isLoading} error={product.error} onRetry={() => void product.refetch()} /></Screen>;
  }

  const item = product.data;
  return (
    <Screen>
      <View style={styles.productMark} accessibilityElementsHidden>
        <ShoppingCart color={colors.primary} size={38} />
      </View>
      <PageHeader title={item.name} subtitle={`${item.category.name} · ${item.offer.vendorName}`} />
      <View style={styles.priceLine}>
        <Text style={styles.price}>{formatMoney(item.offer.price)}</Text>
        <StatusBadge label={item.offer.stockStatus} tone={item.offer.stockStatus === "LOW_STOCK" ? "warning" : "success"} />
      </View>
      <View style={styles.rating}><Star color={colors.accent} fill={colors.accent} size={18} /><Text style={styles.meta}>{item.rating.average.toFixed(1)} from {item.rating.count} ratings</Text></View>
      <Text style={styles.description}>{item.description}</Text>
      <Card>
        {item.highlights.map((highlight) => (
          <View key={highlight} style={styles.highlight}><Check color={colors.primary} size={18} /><Text style={styles.highlightText}>{highlight}</Text></View>
        ))}
      </Card>
      <Button
        label="Add to cart"
        icon={ShoppingCart}
        disabled={item.offer.stockStatus === "OUT_OF_STOCK"}
        onPress={() => {
          addLine({ offerId: item.offer.id, productId: item.id, name: item.name, vendorName: item.offer.vendorName, unitPrice: item.offer.price });
          router.push("/(tabs)/cart");
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  productMark: { height: 160, borderRadius: 8, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  priceLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md },
  price: { color: colors.primary, fontSize: 24, fontWeight: "850" },
  rating: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  meta: { color: colors.muted, fontSize: 14 },
  description: { color: colors.text, fontSize: 16, lineHeight: 24 },
  highlight: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  highlightText: { color: colors.text, fontSize: 15, flex: 1 },
});
