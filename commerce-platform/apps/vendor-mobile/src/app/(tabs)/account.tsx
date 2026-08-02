import { useRouter } from "expo-router";
import { Bell, ChevronRight, CircleHelp, LogOut, ShieldCheck, Store, UsersRound } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, PageHeader, Screen, StatusBadge } from "@/components/ui";
import { useSessionStore } from "@/lib/session-store";
import { useVendorStore } from "@/lib/vendor-store";
import { colors, spacing } from "@/theme";

const menu = [
  { icon: Bell, label: "Notifications", detail: "Order, stock, payout, and security alerts" },
  { icon: UsersRound, label: "Staff", detail: "Permissions are managed in the web portal" },
  { icon: ShieldCheck, label: "Security", detail: "Sessions and account protection" },
  { icon: CircleHelp, label: "Support", detail: "Open and review vendor support tickets" },
];

export default function AccountScreen() {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const signOut = useSessionStore((state) => state.signOut);
  const scope = useVendorStore((state) => state.scope);
  const clearScope = useVendorStore((state) => state.clearScope);
  return (
    <Screen>
      <PageHeader title="More" subtitle="Store controls and account settings." />
      <Card><View style={styles.profile}><View style={styles.avatar}><Store color={colors.primary} size={24} /></View><View style={styles.grow}><Text style={styles.name}>{session?.displayName ?? "Vendor user"}</Text><Text style={styles.meta}>{session?.email}</Text></View><StatusBadge label={scope?.role ?? "Member"} tone="info" /></View></Card>
      <Pressable accessibilityRole="button" accessibilityLabel="Change store" onPress={() => { clearScope(); router.replace("/scope"); }} style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}><Store color={colors.primary} size={20} /><View style={styles.grow}><Text style={styles.rowTitle}>Active store</Text><Text style={styles.meta}>{scope?.vendorName} · {scope?.locationName}</Text></View><ChevronRight color={colors.muted} size={20} /></Pressable>
      {menu.map(({ icon: Icon, label, detail }) => <View key={label} style={[styles.row, styles.disabled]}><Icon color={colors.muted} size={20} /><View style={styles.grow}><Text style={styles.rowTitle}>{label}</Text><Text style={styles.meta}>{detail}</Text></View><StatusBadge label="Web" /></View>)}
      <Button label="Sign out" icon={LogOut} variant="danger" onPress={() => { clearScope(); signOut(); router.replace("/sign-in"); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: spacing.md }, avatar: { width: 48, height: 48, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.successSoft }, grow: { flex: 1, gap: 3 },
  name: { color: colors.text, fontWeight: "800", fontSize: 16 }, meta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  row: { minHeight: 66, borderWidth: 1, borderColor: colors.border, borderRadius: 6, backgroundColor: colors.surface, padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md }, rowTitle: { color: colors.text, fontSize: 15, fontWeight: "700" }, disabled: { opacity: 0.72 }, pressed: { opacity: 0.68 },
});
