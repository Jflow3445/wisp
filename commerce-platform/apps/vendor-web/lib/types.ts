export type OrderStatus =
  | "AWAITING_VENDOR_RESPONSE"
  | "ACCEPTED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "HANDED_TO_DRIVER"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type ProductStatus = "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED" | "APPROVED" | "SUSPENDED";

export interface Order {
  id: string;
  reference: string;
  customer: string;
  customerPhone: string;
  status: OrderStatus;
  itemCount: number;
  amountMinor: string;
  placedAt: string;
  responseDueAt?: string;
  deliveryAddress: string;
  paymentMethod: "Mobile money" | "Card" | "Cash on delivery";
  items: Array<{ name: string; sku: string; quantity: string; amountMinor: string }>;
  timeline: Array<{ label: string; at: string; detail: string }>;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  status: ProductStatus;
  stock: string;
  reorderAt: string;
  priceMinor: string;
  updatedAt: string;
}

export interface FinanceEntry {
  id: string;
  reference: string;
  type: "SALE" | "COMMISSION" | "PAYOUT" | "REFUND";
  status: "POSTED" | "PENDING";
  amountMinor: string;
  occurredAt: string;
}

export interface DashboardData {
  metrics: Array<{ label: string; value: string; change: string; tone: "neutral" | "good" | "warning" }>;
  orders: Order[];
  lowStock: Product[];
  onboardingPercent: number;
}

export interface OnboardingStep {
  id: string;
  label: string;
  detail: string;
  status: "COMPLETE" | "IN_REVIEW" | "REQUIRED";
}
