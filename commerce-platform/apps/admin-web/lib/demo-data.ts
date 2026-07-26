import type { AdminDashboard, AdminOrder, AuditEvent, LedgerEntry, Payment, ProductReview, ReconciliationCase, VendorReview, WebhookEvent } from "./types";

export const vendors: VendorReview[] = [
  { id: "vnd_01", reference: "VN-0084", name: "Asaase Home Goods", owner: "Adwoa Kumi", category: "Home & living", status: "SUBMITTED", risk: "LOW", submittedAt: "2026-07-20T11:42:00Z", region: "Greater Accra" },
  { id: "vnd_02", reference: "VN-0083", name: "Kente House Studio", owner: "Kwesi Manu", category: "Fashion", status: "UNDER_REVIEW", risk: "MEDIUM", submittedAt: "2026-07-20T09:18:00Z", region: "Ashanti" },
  { id: "vnd_03", reference: "VN-0080", name: "Tema Fresh Foods", owner: "Maame Esi Arthur", category: "Groceries", status: "MORE_INFORMATION_REQUIRED", risk: "MEDIUM", submittedAt: "2026-07-19T15:03:00Z", region: "Greater Accra" },
  { id: "vnd_04", reference: "VN-0079", name: "Volta Naturals", owner: "Sena Agbeko", category: "Beauty", status: "APPROVED", risk: "LOW", submittedAt: "2026-07-19T12:11:00Z", region: "Volta" },
  { id: "vnd_05", reference: "VN-0068", name: "QuickCart Electronics", owner: "Rashid Osman", category: "Electronics", status: "SUSPENDED", risk: "HIGH", submittedAt: "2026-07-15T08:44:00Z", region: "Northern" },
  { id: "vnd_06", reference: "VN-0077", name: "Cape Coast Craft", owner: "Efua Essel", category: "Arts & crafts", status: "UNDER_REVIEW", risk: "LOW", submittedAt: "2026-07-18T16:27:00Z", region: "Central" },
];

export const products: ProductReview[] = [
  { id: "prd_01", reference: "PR-1820", name: "Shea & moringa body butter", vendor: "Volta Naturals", category: "Beauty", status: "SUBMITTED", flags: 0, submittedAt: "2026-07-20T12:14:00Z", priceMinor: "8600" },
  { id: "prd_02", reference: "PR-1818", name: "Handwoven laptop sleeve", vendor: "Kente House Studio", category: "Fashion", status: "UNDER_REVIEW", flags: 1, submittedAt: "2026-07-20T11:08:00Z", priceMinor: "24500" },
  { id: "prd_03", reference: "PR-1815", name: "USB-C power station 800W", vendor: "QuickCart Electronics", category: "Electronics", status: "SUSPENDED", flags: 3, submittedAt: "2026-07-20T09:34:00Z", priceMinor: "684000" },
  { id: "prd_04", reference: "PR-1809", name: "Large bolga market basket", vendor: "Cape Coast Craft", category: "Home & living", status: "CHANGES_REQUESTED", flags: 1, submittedAt: "2026-07-19T16:12:00Z", priceMinor: "31000" },
  { id: "prd_05", reference: "PR-1804", name: "Cold pressed coconut oil", vendor: "Tema Fresh Foods", category: "Groceries", status: "APPROVED", flags: 0, submittedAt: "2026-07-19T13:29:00Z", priceMinor: "7200" },
  { id: "prd_06", reference: "PR-1798", name: "Carved serving board", vendor: "Asaase Home Goods", category: "Home & living", status: "SUBMITTED", flags: 0, submittedAt: "2026-07-18T15:41:00Z", priceMinor: "18800" },
];

export const orders: AdminOrder[] = [
  { id: "ord_01", reference: "NS-10482", customer: "Abena Owusu", vendors: 1, status: "CONFIRMED", amountMinor: "42850", placedAt: "2026-07-20T12:42:00Z", SLA: "ON_TRACK" },
  { id: "ord_02", reference: "NS-10481", customer: "Ebo Mensah", vendors: 2, status: "PAYMENT_REVIEW", amountMinor: "113700", placedAt: "2026-07-20T12:38:00Z", SLA: "AT_RISK" },
  { id: "ord_03", reference: "NS-10479", customer: "Kojo Lamptey", vendors: 1, status: "PROCESSING", amountMinor: "18600", placedAt: "2026-07-20T11:58:00Z", SLA: "ON_TRACK" },
  { id: "ord_04", reference: "NS-10474", customer: "Naa Ashorkor", vendors: 3, status: "PARTIALLY_FULFILLED", amountMinor: "207400", placedAt: "2026-07-20T11:03:00Z", SLA: "BREACHED" },
  { id: "ord_05", reference: "NS-10465", customer: "Nana Yeboah", vendors: 1, status: "PROCESSING", amountMinor: "71300", placedAt: "2026-07-20T10:36:00Z", SLA: "AT_RISK" },
  { id: "ord_06", reference: "NS-10398", customer: "Yaw Sarpong", vendors: 1, status: "COMPLETED", amountMinor: "48200", placedAt: "2026-07-19T15:44:00Z", SLA: "ON_TRACK" },
];

export const payments: Payment[] = [
  { id: "pay_01", reference: "PY-22904", orderReference: "NS-10482", provider: "HUBTEL", status: "SUCCESSFUL", amountMinor: "42850", providerReference: "HTL-9901842", updatedAt: "2026-07-20T12:42:03Z" },
  { id: "pay_02", reference: "PY-22903", orderReference: "NS-10481", provider: "PAYSTACK", status: "UNDER_REVIEW", amountMinor: "113700", providerReference: "PST-f19dc42", updatedAt: "2026-07-20T12:39:12Z" },
  { id: "pay_03", reference: "PY-22898", orderReference: "NS-10479", provider: "PAYSTACK", status: "SUCCESSFUL", amountMinor: "18600", providerReference: "PST-e5821ac", updatedAt: "2026-07-20T11:58:44Z" },
  { id: "pay_04", reference: "PY-22891", orderReference: "NS-10474", provider: "HUBTEL", status: "SUCCESSFUL", amountMinor: "207400", providerReference: "HTL-9901321", updatedAt: "2026-07-20T11:03:29Z" },
  { id: "pay_05", reference: "PY-22876", orderReference: "NS-10461", provider: "PAYSTACK", status: "FAILED", amountMinor: "52600", providerReference: "PST-76ad09f", updatedAt: "2026-07-20T10:19:04Z" },
  { id: "pay_06", reference: "PY-22842", orderReference: "NS-10431", provider: "COD", status: "PENDING", amountMinor: "32900", providerReference: "COD-10431", updatedAt: "2026-07-20T08:14:00Z" },
  { id: "pay_07", reference: "PY-22783", orderReference: "NS-10354", provider: "HUBTEL", status: "REFUNDED", amountMinor: "8300", providerReference: "HTL-9899721", updatedAt: "2026-07-19T11:09:00Z" },
];

export const webhookEvents: WebhookEvent[] = [
  { id: "wh_01", provider: "HUBTEL", eventType: "payment.success", eventReference: "HTL-9901842", status: "PROCESSED", attempts: 1, receivedAt: "2026-07-20T12:42:03Z" },
  { id: "wh_02", provider: "PAYSTACK", eventType: "charge.success", eventReference: "PST-f19dc42", status: "PENDING", attempts: 1, receivedAt: "2026-07-20T12:39:12Z" },
  { id: "wh_03", provider: "PAYSTACK", eventType: "charge.success", eventReference: "PST-e5821ac", status: "DUPLICATE", attempts: 1, receivedAt: "2026-07-20T11:59:01Z" },
  { id: "wh_04", provider: "HUBTEL", eventType: "refund.completed", eventReference: "HTL-9899721", status: "PROCESSED", attempts: 2, receivedAt: "2026-07-19T11:09:00Z" },
  { id: "wh_05", provider: "PAYSTACK", eventType: "transfer.failed", eventReference: "TRF-40993", status: "FAILED", attempts: 4, receivedAt: "2026-07-19T08:21:00Z" },
];

export const ledgerEntries: LedgerEntry[] = [
  { id: "led_01", transactionReference: "TX-910842-A", account: "Provider clearing - Hubtel", side: "DEBIT", amountMinor: "42850", source: "PY-22904", postedAt: "2026-07-20T12:42:04Z" },
  { id: "led_02", transactionReference: "TX-910842-A", account: "Customer order liability", side: "CREDIT", amountMinor: "42850", source: "PY-22904", postedAt: "2026-07-20T12:42:04Z" },
  { id: "led_03", transactionReference: "TX-910798-B", account: "Customer order liability", side: "DEBIT", amountMinor: "48200", source: "NS-10398", postedAt: "2026-07-19T18:21:01Z" },
  { id: "led_04", transactionReference: "TX-910798-B", account: "Vendor payable - Nana's Pantry", side: "CREDIT", amountMinor: "43380", source: "NS-10398", postedAt: "2026-07-19T18:21:01Z" },
  { id: "led_05", transactionReference: "TX-910798-B", account: "Marketplace commission revenue", side: "CREDIT", amountMinor: "4820", source: "NS-10398", postedAt: "2026-07-19T18:21:01Z" },
  { id: "led_06", transactionReference: "TX-910754-R", account: "Refund expense", side: "DEBIT", amountMinor: "8300", source: "RF-10354", postedAt: "2026-07-19T11:09:01Z" },
  { id: "led_07", transactionReference: "TX-910754-R", account: "Provider clearing - Hubtel", side: "CREDIT", amountMinor: "8300", source: "RF-10354", postedAt: "2026-07-19T11:09:01Z" },
];

export const reconciliations: ReconciliationCase[] = [
  { id: "rec_01", reference: "RC-0419", provider: "PAYSTACK", issue: "Success webhook; provider lookup pending", status: "OPEN", differenceMinor: "113700", ageHours: 1, owner: null },
  { id: "rec_02", reference: "RC-0417", provider: "HUBTEL", issue: "Settlement amount differs from internal clearing", status: "INVESTIGATING", differenceMinor: "2500", ageHours: 6, owner: "D. Bediako" },
  { id: "rec_03", reference: "RC-0411", provider: "PAYSTACK", issue: "Transfer failed after payout moved to processing", status: "INVESTIGATING", differenceMinor: "318450", ageHours: 29, owner: "A. Nortey" },
  { id: "rec_04", reference: "RC-0408", provider: "HUBTEL", issue: "Duplicate event delivered with new signature", status: "RESOLVED", differenceMinor: "0", ageHours: 42, owner: "K. Adu" },
];

export const auditEvents: AuditEvent[] = [
  { id: "aud_01", occurredAt: "2026-07-20T12:44:18Z", actor: "system:webhook", action: "PAYMENT_CONFIRM_SUCCESS", target: "PY-22904", reason: null, requestId: "req_98f1a24c", outcome: "SUCCESS" },
  { id: "aud_02", occurredAt: "2026-07-20T12:41:03Z", actor: "Ama Nortey", action: "RECONCILIATION_ASSIGN", target: "RC-0411", reason: "Payout transfer needs provider trace", requestId: "req_31a84fd2", outcome: "SUCCESS" },
  { id: "aud_03", occurredAt: "2026-07-20T12:32:51Z", actor: "Kojo Adu", action: "PRODUCT_REQUEST_CHANGES", target: "PR-1818", reason: "Missing conformity evidence", requestId: "req_15b7c221", outcome: "SUCCESS" },
  { id: "aud_04", occurredAt: "2026-07-20T12:18:09Z", actor: "Esi Mensah", action: "LEDGER_ENTRY_UPDATE", target: "TX-910798-B", reason: null, requestId: "req_4a221f92", outcome: "DENIED" },
  { id: "aud_05", occurredAt: "2026-07-20T11:58:44Z", actor: "system:webhook", action: "PAYMENT_CONFIRM_SUCCESS", target: "PY-22898", reason: null, requestId: "req_572cf3b0", outcome: "SUCCESS" },
  { id: "aud_06", occurredAt: "2026-07-20T11:21:17Z", actor: "Yaw Amankwah", action: "VENDOR_BEGIN_REVIEW", target: "VN-0083", reason: null, requestId: "req_83c9e1d4", outcome: "SUCCESS" },
];

export const dashboard: AdminDashboard = {
  metrics: [
    { label: "Gross merchandise value", value: "GHS 186,402", change: "+8.7% vs last Monday", tone: "good" },
    { label: "Orders today", value: "428", change: "11 require attention", tone: "warning" },
    { label: "Payment success", value: "96.4%", change: "+0.9 pts week to date", tone: "good" },
    { label: "Open reconciliation", value: "3", change: "1 older than 24h", tone: "warning" },
  ],
  vendors: vendors.filter((vendor) => ["SUBMITTED", "UNDER_REVIEW"].includes(vendor.status)).slice(0, 4),
  payments: payments.slice(0, 5),
  reconciliations: reconciliations.filter((item) => item.status !== "RESOLVED"),
};
