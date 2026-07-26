import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { LogIn, Store } from "lucide-react-native";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, View } from "react-native";
import { z } from "zod";

import { Button, Card, PageHeader, Screen, StatusBadge, TextField } from "@/components/ui";
import { dataMode, vendorData } from "@/data";
import { useSessionStore } from "@/lib/session-store";
import { colors, spacing } from "@/theme";

const Schema = z.object({ email: z.email("Enter a valid work email"), password: z.string().min(8, "Password must contain at least 8 characters") });
type Values = z.infer<typeof Schema>;

export default function SignInScreen() {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const setSession = useSessionStore((state) => state.setSession);
  const { control, handleSubmit } = useForm<Values>({ resolver: zodResolver(Schema), defaultValues: { email: dataMode === "demo" ? "manager@example.com" : "", password: dataMode === "demo" ? "demo-pass" : "" } });
  const signIn = useMutation({ mutationFn: vendorData.signIn, onSuccess: (value) => { setSession(value); router.replace("/scope"); } });
  if (session) return <Redirect href="/" />;
  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.brand}><View style={styles.mark}><Store color={colors.primary} size={28} /></View><PageHeader title="NISTER Vendor" subtitle="Run orders, stock, and payouts for your store." />{dataMode === "demo" ? <StatusBadge label="Development demo data" tone="warning" /> : null}</View>
      <Card>
        <Controller control={control} name="email" render={({ field, fieldState }) => <TextField label="Work email" keyboardType="email-address" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={control} name="password" render={({ field, fieldState }) => <TextField label="Password" secureTextEntry autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        {signIn.error ? <Text accessibilityRole="alert" style={styles.error}>Sign in failed. Check your credentials and connection.</Text> : null}
        <Button label="Sign in" icon={LogIn} loading={signIn.isPending} onPress={handleSubmit((values) => signIn.mutate(values))} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ screen: { justifyContent: "center", maxWidth: 560, width: "100%", alignSelf: "center" }, brand: { gap: spacing.md }, mark: { width: 52, height: 52, borderRadius: 8, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" }, error: { color: colors.danger, fontSize: 14 } });
