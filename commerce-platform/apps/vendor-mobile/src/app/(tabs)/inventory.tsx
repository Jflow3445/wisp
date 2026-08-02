import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Save, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Button, Card, PageHeader, QueryState, Screen, StatusBadge, TextField } from "@/components/ui";
import { vendorData, type InventoryItem } from "@/data";
import { newIdempotencyKey } from "@/lib/format";
import { useVendorStore } from "@/lib/vendor-store";
import { colors, spacing } from "@/theme";

export default function InventoryScreen() {
  const queryClient = useQueryClient();
  const scope = useVendorStore((state) => state.scope);
  const drafts = useVendorStore((state) => state.inventoryDrafts);
  const setDraft = useVendorStore((state) => state.setInventoryDraft);
  const clearDraft = useVendorStore((state) => state.clearInventoryDraft);
  const [search, setSearch] = useState("");
  const inventory = useQuery({ queryKey: ["vendor-inventory", scope?.vendorId, scope?.locationId], queryFn: () => vendorData.listInventory(scope!), enabled: Boolean(scope) });
  const update = useMutation({
    mutationFn: ({ item, quantity }: { item: InventoryItem; quantity: string }) => vendorData.updateInventory(scope!, { itemId: item.id, availableQuantity: quantity, expectedVersion: item.version, idempotencyKey: newIdempotencyKey("stock") }),
    onSuccess: (item) => { clearDraft(item.id); void queryClient.invalidateQueries({ queryKey: ["vendor-inventory"] }); void queryClient.invalidateQueries({ queryKey: ["vendor-dashboard"] }); },
  });
  const visible = useMemo(() => (inventory.data ?? []).filter((item) => `${item.productName} ${item.sku}`.toLowerCase().includes(search.trim().toLowerCase())), [inventory.data, search]);

  return (
    <Screen>
      <PageHeader title="Inventory" subtitle={`${scope?.locationName ?? "Store"} stock availability`} />
      <View style={styles.search}><Search color={colors.muted} size={18} /><TextInput accessibilityLabel="Search inventory" value={search} onChangeText={setSearch} placeholder="Product or SKU" placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
      <QueryState loading={inventory.isLoading} error={inventory.error} empty={!inventory.isLoading && visible.length === 0} emptyLabel="No inventory items match this search." onRetry={() => void inventory.refetch()} />
      {visible.map((item) => {
        const draft = drafts[item.id] ?? item.availableQuantity;
        const low = Number(item.availableQuantity) <= Number(item.lowStockAt);
        const invalid = !/^\d+(\.\d{1,6})?$/.test(draft);
        const changed = draft !== item.availableQuantity;
        return <Card key={item.id}>
          <View style={styles.itemHeader}><View style={styles.icon}><Boxes color={low ? colors.danger : colors.primary} size={21} /></View><View style={styles.grow}><Text style={styles.name}>{item.productName}</Text><Text style={styles.meta}>{item.sku} · Version {item.version}</Text></View><StatusBadge label={Number(item.availableQuantity) === 0 ? "Out of stock" : low ? "Low stock" : "In stock"} tone={Number(item.availableQuantity) === 0 ? "danger" : low ? "warning" : "success"} /></View>
          <TextField label="Available quantity" value={draft} onChangeText={(value) => setDraft(item.id, value)} keyboardType="decimal-pad" error={invalid ? "Enter a non-negative quantity with up to 6 decimal places." : undefined} />
          <View style={styles.threshold}><Text style={styles.meta}>Low-stock threshold</Text><Text style={styles.strong}>{item.lowStockAt}</Text></View>
          {update.error && update.variables?.item.id === item.id ? <Text accessibilityRole="alert" style={styles.error}>Stock changed on the server or could not be saved. Refresh before retrying.</Text> : null}
          <Button label="Save stock" icon={Save} disabled={!changed || invalid} loading={update.isPending && update.variables?.item.id === item.id} onPress={() => update.mutate({ item, quantity: draft })} />
        </Card>;
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { minHeight: 46, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, gap: spacing.sm },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, minHeight: 44 },
  itemHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { width: 42, height: 42, borderRadius: 6, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, gap: 3 }, name: { color: colors.text, fontWeight: "700", fontSize: 15 }, meta: { color: colors.muted, fontSize: 12 },
  threshold: { flexDirection: "row", justifyContent: "space-between" }, strong: { color: colors.text, fontWeight: "700" }, error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
});
