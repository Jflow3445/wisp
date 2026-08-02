import { AlertTriangle, RefreshCw, Trash2, UploadCloud } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, PageHeader, Screen, StatusBadge } from "@/components/ui";
import { useOfflineQueue } from "@/lib/offline-queue";
import { colors, spacing } from "@/theme";

export default function SyncQueueScreen() {
  const events = useOfflineQueue((state) => state.events); const markPending = useOfflineQueue((state) => state.markPending); const remove = useOfflineQueue((state) => state.remove);
  return <Screen><PageHeader title="Pending sync" subtitle="Offline actions remain here until acknowledged by the backend." />{events.length === 0 ? <Card><UploadCloud color={colors.primary} size={25} /><Text style={styles.title}>Everything is synchronised</Text><Text style={styles.meta}>No delivery actions are waiting on this device.</Text></Card> : events.map((event) => <Card key={event.id} style={event.status === "CONFLICT" ? styles.conflict : undefined}><View style={styles.row}><AlertTriangle color={event.status === "CONFLICT" ? colors.danger : colors.info} size={20} /><View style={styles.grow}><Text style={styles.title}>{event.kind.replaceAll("_", " ")}</Text><Text style={styles.meta}>Entity {event.entityId} · expected version {event.expectedVersion ?? "n/a"}</Text></View><StatusBadge label={event.status} tone={event.status === "CONFLICT" ? "danger" : event.status === "FAILED" ? "warning" : "info"} /></View>{event.lastError ? <Text style={styles.error}>{event.lastError}</Text> : null}<Text style={styles.meta}>Attempts: {event.attempts} · created {new Date(event.createdAt).toLocaleString("en-GH")}</Text>{event.status === "FAILED" ? <Button label="Retry when online" icon={RefreshCw} variant="secondary" onPress={() => markPending(event.id)} /> : null}{event.status === "CONFLICT" ? <Button label="Discard after operational review" icon={Trash2} variant="danger" onPress={() => remove(event.id)} /> : null}</Card>)}</Screen>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", gap: spacing.md }, grow: { flex: 1, gap: 3 }, title: { color: colors.text, fontSize: 15, fontWeight: "700", textTransform: "capitalize" }, meta: { color: colors.muted, fontSize: 12, lineHeight: 18 }, error: { color: colors.danger, fontSize: 12, lineHeight: 18 }, conflict: { borderColor: colors.danger } });
