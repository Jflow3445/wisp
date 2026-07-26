import { Redirect, useRouter } from "expo-router";
import { LogOut, ShieldCheck, UserRound } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, PageHeader, SectionHeader, StatusBadge } from "@/components/ui";
import { dataMode } from "@/data";
import { useSessionStore } from "@/lib/session-store";
import { colors, spacing } from "@/theme";

export default function AccountScreen() {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const signOut = useSessionStore((state) => state.signOut);
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <View style={styles.screen}>
      <PageHeader title="Account" subtitle="Profile and app access." />
      <Card>
        <View style={styles.profileRow}>
          <View style={styles.avatar}><UserRound color={colors.primary} size={26} /></View>
          <View style={styles.profileBody}><Text style={styles.name}>{session.displayName}</Text><Text style={styles.meta}>{session.phone}</Text></View>
        </View>
      </Card>
      <Card>
        <SectionHeader title="Security" />
        <View style={styles.securityRow}><ShieldCheck color={colors.primary} size={20} /><Text style={styles.body}>Session credentials are stored in the device secure store.</Text></View>
      </Card>
      <View style={styles.modeRow}><Text style={styles.meta}>Data source</Text><StatusBadge label={dataMode === "demo" ? "Development demo" : "Marketplace API"} tone={dataMode === "demo" ? "warning" : "success"} /></View>
      <Button label="Sign out" icon={LogOut} variant="danger" onPress={() => { signOut(); router.replace("/sign-in"); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.lg },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 50, height: 50, borderRadius: 8, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  profileBody: { flex: 1, gap: 3 },
  name: { color: colors.text, fontSize: 18, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 13 },
  securityRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  body: { color: colors.text, fontSize: 14, lineHeight: 20, flex: 1 },
  modeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
});
