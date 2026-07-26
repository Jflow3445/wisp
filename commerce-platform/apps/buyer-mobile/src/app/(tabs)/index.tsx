import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowRight, Search } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ProductRow } from "@/components/product-row";
import { Button, Card, PageHeader, QueryState, SectionHeader, StatusBadge } from "@/components/ui";
import { buyerData, dataMode } from "@/data";
import { colors, spacing } from "@/theme";

const categories = ["Groceries", "Personal care", "Home"];

export default function HomeScreen() {
  const router = useRouter();
  const products = useQuery({ queryKey: ["products", "featured"], queryFn: () => buyerData.listProducts() });

  return (
    <View style={styles.screen}>
      <PageHeader title="Shop nearby" subtitle="Everyday products from verified local sellers." />
      {dataMode === "demo" ? <StatusBadge label="Demo catalogue" tone="warning" /> : null}
      <Button label="Search products" icon={Search} variant="secondary" onPress={() => router.push("/(tabs)/search")} />

      <View style={styles.section}>
        <SectionHeader title="Browse categories" />
        <View style={styles.categories}>
          {categories.map((category) => (
            <Pressable
              key={category}
              accessibilityRole="button"
              accessibilityLabel={`Search ${category}`}
              onPress={() => router.push({ pathname: "/(tabs)/search", params: { q: category } })}
              style={({ pressed }) => [styles.category, pressed ? styles.pressed : null]}
            >
              <Text style={styles.categoryText}>{category}</Text>
              <ArrowRight color={colors.primary} size={17} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Available now" />
        <QueryState loading={products.isLoading} error={products.error} empty={products.data?.length === 0} onRetry={() => void products.refetch()} />
        {products.data?.length ? (
          <Card style={styles.productList}>{products.data.slice(0, 5).map((product) => <ProductRow key={product.id} product={product} />)}</Card>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.md },
  categories: { gap: spacing.sm },
  category: { minHeight: 48, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  categoryText: { color: colors.text, fontWeight: "650", fontSize: 15 },
  pressed: { opacity: 0.66 },
  productList: { paddingVertical: 0 },
});
