import { Linking, StyleSheet, Text } from "react-native";
import { AlertTriangle, Phone, ShieldAlert, Wrench } from "lucide-react-native";

import { Button, Card, PageHeader, Screen } from "@/components/ui";
import { colors } from "@/theme";

export default function EmergencyScreen() {
  return <Screen><PageHeader title="Emergency and safety" subtitle="Stop in a safe place before using these controls." /><Card style={styles.emergency}><ShieldAlert color={colors.danger} size={28} /><Text style={styles.title}>Immediate danger or injury</Text><Text style={styles.body}>Call Ghana emergency services first. Share your location only when it is safe and necessary.</Text><Button label="Call emergency services (112)" icon={Phone} variant="danger" onPress={() => void Linking.openURL("tel:112")} /></Card><Card><AlertTriangle color={colors.accent} size={24} /><Text style={styles.title}>Contact platform operations</Text><Text style={styles.body}>The production operations number and authenticated incident endpoint must be configured before launch.</Text><Button label="Operations contact not configured" disabled variant="secondary" onPress={() => undefined} /></Card><Card><Wrench color={colors.primary} size={24} /><Text style={styles.title}>Vehicle breakdown or safety incident</Text><Text style={styles.body}>Keep the delivery secure. The backend safety-incident workflow remains required before these reports can be submitted.</Text></Card></Screen>;
}
const styles = StyleSheet.create({ emergency: { borderColor: colors.danger }, title: { color: colors.text, fontSize: 17, fontWeight: "800" }, body: { color: colors.muted, fontSize: 14, lineHeight: 20 }, });
