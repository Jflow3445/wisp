import type { LucideIcon } from "lucide-react-native";
import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, spacing } from "@/theme";

export function Screen({
  children,
  scroll = true,
  contentStyle,
}: PropsWithChildren<{ scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }>) {
  if (!scroll) {
    return (
      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={[styles.content, contentStyle]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  icon: Icon,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && !disabled ? styles.pressed : null,
        disabled || loading ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.surface : colors.primary} />
      ) : Icon ? (
        <Icon size={19} color={variant === "primary" ? colors.surface : variant === "danger" ? colors.danger : colors.primary} />
      ) : null}
      <Text style={[styles.buttonLabel, styles[`buttonLabel_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType,
  secureTextEntry,
  multiline,
  autoCapitalize = "sentences",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  const errorId = `${label.replace(/\s/g, "-").toLowerCase()}-error`;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        aria-describedby={error ? errorId : undefined}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline ? styles.multiline : null, error ? styles.inputError : null]}
        value={value}
      />
      {error ? (
        <Text nativeID={errorId} accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label.replaceAll("_", " ")}</Text>
    </View>
  );
}

export function QueryState({
  loading,
  error,
  empty,
  onRetry,
  emptyLabel = "Nothing to show yet.",
}: {
  loading: boolean;
  error: unknown;
  empty?: boolean;
  onRetry?: () => void;
  emptyLabel?: string;
}) {
  if (loading) {
    return (
      <View accessibilityRole="progressbar" style={styles.state}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.subtitle}>Loading...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View accessibilityRole="alert" style={styles.state}>
        <Text style={styles.errorTitle}>Could not load this page</Text>
        <Text style={styles.subtitle}>Check your connection and try again.</Text>
        {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.state}>
        <Text style={styles.subtitle}>{emptyLabel}</Text>
      </View>
    );
  }
  return null;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.xs },
  title: { color: colors.text, fontSize: 28, fontWeight: "800", lineHeight: 34 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "750", lineHeight: 24, flexShrink: 1 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: spacing.lg, gap: spacing.md },
  button: { minHeight: 48, borderRadius: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderWidth: 1 },
  button_primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  button_secondary: { backgroundColor: colors.surface, borderColor: colors.primary },
  button_danger: { backgroundColor: colors.surface, borderColor: colors.danger },
  button_ghost: { backgroundColor: "transparent", borderColor: "transparent" },
  buttonLabel: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  buttonLabel_primary: { color: colors.surface },
  buttonLabel_secondary: { color: colors.primary },
  buttonLabel_danger: { color: colors.danger },
  buttonLabel_ghost: { color: colors.primary },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  field: { gap: 6 },
  label: { color: colors.text, fontSize: 14, fontWeight: "650" },
  input: { minHeight: 48, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.text, fontSize: 16 },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 13 },
  errorTitle: { color: colors.danger, fontWeight: "700", fontSize: 16 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 4, backgroundColor: colors.background },
  badge_success: { backgroundColor: colors.successSoft },
  badge_warning: { backgroundColor: colors.warningSoft },
  badge_danger: { backgroundColor: colors.dangerSoft },
  badge_info: { backgroundColor: "#E8F1FB" },
  badge_neutral: { backgroundColor: colors.background },
  badgeText: { color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: "700", textTransform: "capitalize" },
  badgeText_success: { color: colors.primary },
  badgeText_warning: { color: "#795600" },
  badgeText_danger: { color: colors.danger },
  badgeText_info: { color: colors.info },
  badgeText_neutral: { color: colors.muted },
  state: { alignItems: "center", justifyContent: "center", gap: spacing.md, minHeight: 180, padding: spacing.xl },
  divider: { height: 1, backgroundColor: colors.border },
});
