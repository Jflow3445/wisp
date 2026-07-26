import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { LockKeyhole, LogIn } from "lucide-react-native";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, View } from "react-native";
import { z } from "zod";

import { buyerData, dataMode } from "@/data";
import { Button, Card, PageHeader, Screen, StatusBadge, TextField } from "@/components/ui";
import { useSessionStore } from "@/lib/session-store";
import { colors, spacing } from "@/theme";

const SignInSchema = z.object({
  phone: z.string().regex(/^\+233\d{9}$/, "Use a Ghana number such as +233201234567"),
  password: z.string().min(8, "Password must contain at least 8 characters"),
});
type SignInValues = z.infer<typeof SignInSchema>;

export default function SignInScreen() {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const { control, handleSubmit } = useForm<SignInValues>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { phone: dataMode === "demo" ? "+233201234567" : "+233", password: dataMode === "demo" ? "demo-pass" : "" },
  });
  const signIn = useMutation({
    mutationFn: buyerData.signIn,
    onSuccess: (nextSession) => {
      setSession(nextSession);
      router.replace("/(tabs)");
    },
  });

  if (session) return <Redirect href="/(tabs)" />;

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.brand}>
        <View style={styles.brandMark}><LockKeyhole color={colors.primary} size={28} /></View>
        <PageHeader title="NISTER Market" subtitle="Sign in to shop and track your deliveries." />
        {dataMode === "demo" ? <StatusBadge label="Development demo data" tone="warning" /> : null}
      </View>
      <Card>
        <Controller
          control={control}
          name="phone"
          render={({ field, fieldState }) => (
            <TextField label="Mobile number" keyboardType="phone-pad" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <TextField label="Password" secureTextEntry autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
          )}
        />
        {signIn.error ? <Text accessibilityRole="alert" style={styles.error}>Sign in failed. Check your details and connection.</Text> : null}
        <Button label="Sign in" icon={LogIn} loading={signIn.isPending} onPress={handleSubmit((values) => signIn.mutate(values))} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: "center", maxWidth: 560, width: "100%", alignSelf: "center" },
  brand: { gap: spacing.md },
  brandMark: { width: 52, height: 52, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.successSoft },
  error: { color: colors.danger, fontSize: 14 },
});
