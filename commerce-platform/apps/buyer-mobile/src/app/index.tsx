import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useSessionStore } from "@/lib/session-store";
import { colors } from "@/theme";

export default function IndexScreen() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const session = useSessionStore((state) => state.session);

  if (!hydrated) {
    return (
      <View accessibilityRole="progressbar" style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <Redirect href={session ? "/(tabs)" : "/sign-in"} />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background } });
