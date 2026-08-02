import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { Bell, Camera, Check, LocateFixed, MapPinned } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, PageHeader, Screen, StatusBadge } from "@/components/ui";
import { colors, spacing } from "@/theme";

type PermissionState = "UNKNOWN" | "GRANTED" | "DENIED";
export default function PermissionsScreen() {
  const router = useRouter();
  const [location, setLocation] = useState<PermissionState>("UNKNOWN");
  const [camera, setCamera] = useState<PermissionState>("UNKNOWN");
  useEffect(() => { void Promise.all([Location.getForegroundPermissionsAsync(), ImagePicker.getCameraPermissionsAsync()]).then(([locationResult, cameraResult]) => { setLocation(locationResult.granted ? "GRANTED" : locationResult.canAskAgain ? "UNKNOWN" : "DENIED"); setCamera(cameraResult.granted ? "GRANTED" : cameraResult.canAskAgain ? "UNKNOWN" : "DENIED"); }); }, []);
  const requestLocation = async () => { const result = await Location.requestForegroundPermissionsAsync(); setLocation(result.granted ? "GRANTED" : "DENIED"); };
  const requestCamera = async () => { const result = await ImagePicker.requestCameraPermissionsAsync(); setCamera(result.granted ? "GRANTED" : "DENIED"); };
  return <Screen><PageHeader title="Before a shift" subtitle="Permissions are requested only after their operational purpose is explained." />
    <PermissionCard icon={LocateFixed} title="Location while using the app" detail="Used for route progress, arrival evidence, and delivery support. Location is not proof of delivery by itself." state={location} onPress={() => void requestLocation()} />
    <PermissionCard icon={MapPinned} title="Background location" detail="Required only during an active shift. It needs a signed development or store build and is never requested by this preview." state="UNKNOWN" disabled />
    <PermissionCard icon={Camera} title="Camera" detail="Used for package condition and proof-of-delivery photographs when policy requires them. Manual codes remain available." state={camera} onPress={() => void requestCamera()} />
    <PermissionCard icon={Bell} title="Notifications" detail="Used for delivery offers, reassignment, document expiry, payouts, and safety alerts." state="UNKNOWN" disabled />
    {location === "DENIED" ? <Card><Text style={styles.warning}>You can review the app while location is denied, but the backend will block starting a shift that requires location.</Text></Card> : null}
    <Button label="Continue to driver home" icon={Check} onPress={() => router.replace("/(tabs)")} />
  </Screen>;
}

function PermissionCard({ icon: Icon, title, detail, state, onPress, disabled = false }: { icon: typeof Camera; title: string; detail: string; state: PermissionState; onPress?: () => void; disabled?: boolean }) {
  return <Card><View style={styles.row}><View style={styles.icon}><Icon color={colors.primary} size={23} /></View><View style={styles.grow}><Text style={styles.title}>{title}</Text><Text style={styles.detail}>{detail}</Text></View><StatusBadge label={disabled ? "Later" : state} tone={state === "GRANTED" ? "success" : state === "DENIED" ? "danger" : "neutral"} /></View>{!disabled && state !== "GRANTED" ? <Button label={state === "DENIED" ? "Review in system settings" : `Allow ${title.toLowerCase()}`} variant="secondary" onPress={onPress ?? (() => undefined)} /> : null}</Card>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md }, icon: { width: 42, height: 42, borderRadius: 6, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }, grow: { flex: 1, gap: spacing.xs }, title: { color: colors.text, fontSize: 15, fontWeight: "700" }, detail: { color: colors.muted, fontSize: 13, lineHeight: 18 }, warning: { color: colors.danger, fontSize: 13, lineHeight: 19 } });
