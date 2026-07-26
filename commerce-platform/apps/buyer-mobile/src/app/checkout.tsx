import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2, CreditCard, Smartphone, WalletCards } from "lucide-react-native";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { z } from "zod";

import { Button, Card, Divider, PageHeader, Screen, SectionHeader, TextField } from "@/components/ui";
import { buyerData } from "@/data";
import { cartTotal, useCommerceStore, type CheckoutDraft } from "@/lib/commerce-store";
import { formatMoney } from "@/lib/format";
import { colors, spacing } from "@/theme";

const DeliverySchema = z.object({
  recipientName: z.string().min(2, "Enter the recipient's name"),
  phone: z.string().regex(/^\+233\d{9}$/, "Use a Ghana number such as +233201234567"),
  city: z.string().min(2, "Enter a city or town"),
  landmark: z.string().min(3, "Add a nearby landmark for the driver"),
  instructions: z.string().max(500, "Keep instructions under 500 characters"),
});
type DeliveryValues = z.infer<typeof DeliverySchema>;

const paymentOptions = [
  { value: "MOBILE_MONEY" as const, label: "Mobile Money", icon: Smartphone },
  { value: "CARD" as const, label: "Card", icon: CreditCard },
  { value: "CASH_ON_DELIVERY" as const, label: "Cash on delivery", icon: WalletCards },
];

export default function CheckoutScreen() {
  const router = useRouter();
  const lines = useCommerceStore((state) => state.lines);
  const checkout = useCommerceStore((state) => state.checkout);
  const patchCheckout = useCommerceStore((state) => state.patchCheckout);
  const clearAfterOrder = useCommerceStore((state) => state.clearAfterOrder);
  const { control, handleSubmit, watch } = useForm<DeliveryValues>({
    resolver: zodResolver(DeliverySchema),
    defaultValues: {
      recipientName: checkout.recipientName,
      phone: checkout.phone,
      city: checkout.city,
      landmark: checkout.landmark,
      instructions: checkout.instructions,
    },
  });

  useEffect(() => {
    const subscription = watch((values) => patchCheckout(values as Partial<CheckoutDraft>));
    return () => subscription.unsubscribe();
  }, [patchCheckout, watch]);

  const placeOrder = useMutation({
    mutationFn: () => buyerData.placeOrder({
      lines: lines.map((line) => ({ offerId: line.offerId, quantity: line.quantity })),
      delivery: {
        recipientName: checkout.recipientName,
        phone: checkout.phone,
        city: checkout.city,
        landmark: checkout.landmark,
        instructions: checkout.instructions,
      },
      paymentMethod: checkout.paymentMethod,
      idempotencyKey: checkout.idempotencyKey,
    }),
    onSuccess: (order) => {
      clearAfterOrder();
      router.replace({ pathname: "/order/[id]", params: { id: order.id } });
    },
  });

  if (!lines.length) {
    return (
      <Screen>
        <PageHeader title="Checkout" subtitle="Your cart is empty." />
        <Button label="Return to cart" icon={ArrowLeft} variant="secondary" onPress={() => router.replace("/(tabs)/cart")} />
      </Screen>
    );
  }

  if (checkout.step === "delivery") {
    return (
      <Screen>
        <PageHeader title="Delivery details" subtitle="This progress is saved automatically on this device." />
        <Card>
          <Controller control={control} name="recipientName" render={({ field, fieldState }) => <TextField label="Recipient name" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
          <Controller control={control} name="phone" render={({ field, fieldState }) => <TextField label="Mobile number" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} keyboardType="phone-pad" autoCapitalize="none" />} />
          <Controller control={control} name="city" render={({ field, fieldState }) => <TextField label="City or town" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
          <Controller control={control} name="landmark" render={({ field, fieldState }) => <TextField label="Nearest landmark" placeholder="For example, opposite the clinic" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
          <Controller control={control} name="instructions" render={({ field, fieldState }) => <TextField label="Delivery instructions (optional)" multiline value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        </Card>
        <Button label="Review order" onPress={handleSubmit((values) => patchCheckout({ ...values, step: "review" }))} />
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title="Review and pay" subtitle="Confirm your address and payment method." />
      <Card>
        <SectionHeader title="Delivery" action={<Pressable accessibilityRole="button" onPress={() => patchCheckout({ step: "delivery" })}><Text style={styles.edit}>Edit</Text></Pressable>} />
        <Text style={styles.strong}>{checkout.recipientName} · {checkout.phone}</Text>
        <Text style={styles.body}>{checkout.landmark}, {checkout.city}</Text>
        {checkout.instructions ? <Text style={styles.meta}>{checkout.instructions}</Text> : null}
      </Card>
      <View style={styles.section}>
        <SectionHeader title="Payment method" />
        {paymentOptions.map((option) => {
          const selected = checkout.paymentMethod === option.value;
          const Icon = option.icon;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              onPress={() => patchCheckout({ paymentMethod: option.value })}
              style={({ pressed }) => [styles.payment, selected ? styles.paymentSelected : null, pressed ? styles.pressed : null]}
            >
              <Icon color={selected ? colors.primary : colors.muted} size={22} />
              <Text style={[styles.paymentText, selected ? styles.paymentTextSelected : null]}>{option.label}</Text>
              {selected ? <CheckCircle2 color={colors.primary} size={21} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Card>
        <View style={styles.summaryRow}><Text style={styles.meta}>Items</Text><Text style={styles.strong}>{lines.reduce((sum, line) => sum + line.quantity, 0)}</Text></View>
        <Divider />
        <View style={styles.summaryRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.total}>{formatMoney(cartTotal(lines))}</Text></View>
        <Text style={styles.meta}>Any delivery fee is shown by the payment provider before charge.</Text>
      </Card>
      {placeOrder.error ? <Text accessibilityRole="alert" style={styles.error}>Order submission failed. Your checkout is still saved; try again when connected.</Text> : null}
      <Button label="Place order" loading={placeOrder.isPending} onPress={() => placeOrder.mutate()} />
      <Button label="Back to delivery" icon={ArrowLeft} variant="ghost" onPress={() => patchCheckout({ step: "delivery" })} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  edit: { color: colors.primary, fontWeight: "750", padding: spacing.sm },
  strong: { color: colors.text, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  payment: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: spacing.lg },
  paymentSelected: { borderColor: colors.primary, backgroundColor: colors.successSoft },
  paymentText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "650" },
  paymentTextSelected: { color: colors.primary },
  pressed: { opacity: 0.7 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  totalLabel: { color: colors.text, fontSize: 17, fontWeight: "800" },
  total: { color: colors.primary, fontSize: 18, fontWeight: "850" },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
