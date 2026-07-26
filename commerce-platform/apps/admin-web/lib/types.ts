export interface VendorReview {
  id: string;
  reference: string;
  name: string;
  owner: string;
  category: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "MORE_INFORMATION_REQUIRED" | "APPROVED" | "SUSPENDED";
  risk: "LOW" | "MEDIUM" | "HIGH";
  submittedAt: string;
  region: string;
}

export interface ProductReview {
  id: string;
  reference: string;
  name: string;
  vendor: string;
  category: string;
  status: "SUBMITTED" | "UNDER_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "SUSPENDED";
  flags: number;
  submittedAt: string;
  priceMinor: string;
}

export interface AdminOrder {
  id: string;
  reference: string;
  customer: string;
  vendors: number;
  status: "PAYMENT_REVIEW" | "CONFIRMED" | "PROCESSING" | "PARTIALLY_FULFILLED" | "COMPLETED" | "CANCELLED";
  amountMinor: string;
  placedAt: string;
  SLA: "ON_TRACK" | "AT_RISK" | "BREACHED";
}

export interface Payment {
  id: string;
  reference: string;
  orderReference: string;
  provider: "PAYSTACK" | "HUBTEL" | "COD";
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "UNDER_REVIEW" | "REVERSED" | "REFUNDED";
  amountMinor: string;
  providerReference: string;
  updatedAt: string;
}

export interface WebhookEvent {
  id: string;
  provider: "PAYSTACK" | "HUBTEL";
  eventType: string;
  eventReference: string;
  status: "PROCESSED" | "DUPLICATE" | "FAILED" | "PENDING";
  attempts: number;
  receivedAt: string;
}

export interface LedgerEntry {
  id: string;
  transactionReference: string;
  account: string;
  side: "DEBIT" | "CREDIT";
  amountMinor: string;
  source: string;
  postedAt: string;
}

export interface ReconciliationCase {
  id: string;
  reference: string;
  provider: "PAYSTACK" | "HUBTEL";
  issue: string;
  status: "OPEN" | "INVESTIGATING" | "RESOLVED";
  differenceMinor: string;
  ageHours: number;
  owner: string | null;
}

export interface AuditEvent {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  target: string;
  reason: string | null;
  requestId: string;
  outcome: "SUCCESS" | "DENIED" | "FAILED";
}

export interface AdminDashboard {
  metrics: Array<{ label: string; value: string; change: string; tone: "neutral" | "good" | "warning" }>;
  vendors: VendorReview[];
  payments: Payment[];
  reconciliations: ReconciliationCase[];
}
