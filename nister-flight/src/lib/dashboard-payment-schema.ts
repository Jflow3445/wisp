import { z } from "zod";

export const dashboardPaymentSchema = z.object({
  intent: z.enum(["create_invoice", "submit_tx"]),
  paymentMethodId: z.string().min(1),
  planSlug: z.string().trim().max(80).optional(),
  amountUsd: z.coerce.number().min(1).max(1_000_000).optional(),
  topUpMonths: z.coerce.number().int().min(1).max(36).optional(),
  declaredSenderAddress: z.string().trim().min(16).max(128).optional(),
  invoiceReference: z.string().trim().min(4).max(64).optional(),
  txHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional(),
  note: z.string().trim().max(191).optional(),
  legalConsent: z.boolean(),
});

function asBool(value: FormDataEntryValue | null) {
  return value === "true" || value === "on" || value === "1";
}

function readLastNonEmptyFormValue(formData: FormData, keys: string[]) {
  for (const key of keys) {
    const entries = formData.getAll(key);
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (typeof entry !== "string") {
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return undefined;
}

export function parseDashboardPaymentFormData(formData: FormData) {
  const topUpMonthsValue = readLastNonEmptyFormValue(formData, [
    "topUpMonths",
    "topupMonths",
    "monthsToTopUp",
    "months",
  ]);

  return dashboardPaymentSchema.safeParse({
    intent: String(formData.get("intent") || "").trim().toLowerCase(),
    paymentMethodId: String(formData.get("paymentMethodId") || "").trim(),
    planSlug: String(formData.get("planSlug") || "").trim() || undefined,
    amountUsd: String(formData.get("amountUsd") || "").trim() || undefined,
    topUpMonths: topUpMonthsValue,
    declaredSenderAddress: String(formData.get("declaredSenderAddress") || "").trim() || undefined,
    invoiceReference: String(formData.get("invoiceReference") || "").trim() || undefined,
    txHash: String(formData.get("txHash") || "").trim() || undefined,
    note: String(formData.get("note") || "").trim() || undefined,
    legalConsent: asBool(formData.get("legalConsent")),
  });
}
