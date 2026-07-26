import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Search as SearchIcon, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { ProductRow } from "@/components/product-row";
import { Button, Card, PageHeader, QueryState } from "@/components/ui";
import { buyerData } from "@/data";
import { colors, spacing } from "@/theme";

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [input, setInput] = useState(params.q ?? "");
  const [submitted, setSubmitted] = useState(params.q ?? "");
  useEffect(() => {
    if (params.q) {
      setInput(params.q);
      setSubmitted(params.q);
    }
  }, [params.q]);
  const results = useQuery({ queryKey: ["products", "search", submitted], queryFn: () => buyerData.listProducts(submitted) });

  return (
    <View style={styles.screen}>
      <PageHeader title="Find products" subtitle="Search is submitted only when you ask, reducing network use." />
      <View style={styles.searchRow}>
        <View style={styles.inputWrap}>
          <SearchIcon color={colors.muted} size={19} />
          <TextInput
            accessibilityLabel="Product search"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setInput}
            onSubmitEditing={() => setSubmitted(input.trim())}
            placeholder="Rice, soap, home..."
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.input}
            value={input}
          />
          {input ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => { setInput(""); setSubmitted(""); }}>
              <X color={colors.muted} size={19} />
            </Pressable>
          ) : null}
        </View>
        <Button label="Search" onPress={() => setSubmitted(input.trim())} />
      </View>
      <QueryState
        loading={results.isLoading}
        error={results.error}
        empty={results.data?.length === 0}
        emptyLabel={submitted ? `No results for "${submitted}".` : "No products are available."}
        onRetry={() => void results.refetch()}
      />
      {results.data?.length ? <Card style={styles.list}>{results.data.map((product) => <ProductRow key={product.id} product={product} />)}</Card> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg },
  searchRow: { gap: spacing.sm },
  inputWrap: { minHeight: 48, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: { flex: 1, minHeight: 46, color: colors.text, fontSize: 16 },
  list: { paddingVertical: 0 },
});
