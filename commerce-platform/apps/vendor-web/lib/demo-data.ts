import type { DashboardData, FinanceEntry, OnboardingStep, Order, Product } from "./types";

export const orders: Order[] = [
  {
    id: "ord_01",
    reference: "NS-10482",
    customer: "Abena Owusu",
    customerPhone: "+233 24 218 4903",
    status: "AWAITING_VENDOR_RESPONSE",
    itemCount: 3,
    amountMinor: "42850",
    placedAt: "2026-07-20T12:42:00Z",
    responseDueAt: "2026-07-20T13:02:00Z",
    deliveryAddress: "East Legon Hills, near Lakeside Police Station, Accra",
    paymentMethod: "Mobile money",
    items: [
      { name: "Organic pantry basket", sku: "NP-BSK-018", quantity: "1", amountMinor: "26000" },
      { name: "Raw forest honey 500 ml", sku: "NP-HNY-005", quantity: "2", amountMinor: "16850" },
    ],
    timeline: [
      { label: "Order received", at: "2026-07-20T12:42:00Z", detail: "Payment verified by Hubtel" },
      { label: "Stock reserved", at: "2026-07-20T12:42:04Z", detail: "Reservation expires after vendor response window" },
    ],
  },
  {
    id: "ord_02",
    reference: "NS-10479",
    customer: "Kojo Lamptey",
    customerPhone: "+233 55 018 7314",
    status: "PREPARING",
    itemCount: 2,
    amountMinor: "18600",
    placedAt: "2026-07-20T11:58:00Z",
    deliveryAddress: "Cantonments, opposite the French Embassy, Accra",
    paymentMethod: "Card",
    items: [{ name: "Breakfast provisions set", sku: "NP-BRK-012", quantity: "2", amountMinor: "18600" }],
    timeline: [
      { label: "Order received", at: "2026-07-20T11:58:00Z", detail: "Card payment verified" },
      { label: "Accepted", at: "2026-07-20T12:04:00Z", detail: "Accepted by Esi A." },
      { label: "Preparation started", at: "2026-07-20T12:11:00Z", detail: "Estimated ready time 13:00" },
    ],
  },
  {
    id: "ord_03",
    reference: "NS-10465",
    customer: "Nana Yeboah",
    customerPhone: "+233 20 441 0822",
    status: "READY_FOR_PICKUP",
    itemCount: 6,
    amountMinor: "71300",
    placedAt: "2026-07-20T10:36:00Z",
    deliveryAddress: "Airport Residential, Senchi Street, Accra",
    paymentMethod: "Mobile money",
    items: [
      { name: "Household essentials crate", sku: "NP-HSE-030", quantity: "1", amountMinor: "59300" },
      { name: "Dried mango 200 g", sku: "NP-MNG-002", quantity: "3", amountMinor: "12000" },
    ],
    timeline: [
      { label: "Order received", at: "2026-07-20T10:36:00Z", detail: "Payment verified by Paystack" },
      { label: "Ready for pickup", at: "2026-07-20T12:18:00Z", detail: "Package sealed by Yaa N." },
    ],
  },
  {
    id: "ord_04",
    reference: "NS-10431",
    customer: "Akosua Boateng",
    customerPhone: "+233 27 104 8221",
    status: "OUT_FOR_DELIVERY",
    itemCount: 1,
    amountMinor: "32900",
    placedAt: "2026-07-20T08:14:00Z",
    deliveryAddress: "Adenta New Site, Ritz Junction, Accra",
    paymentMethod: "Cash on delivery",
    items: [{ name: "Weekend fresh produce box", sku: "NP-PRD-022", quantity: "1", amountMinor: "32900" }],
    timeline: [
      { label: "Order received", at: "2026-07-20T08:14:00Z", detail: "COD eligibility confirmed" },
      { label: "Handed to driver", at: "2026-07-20T10:08:00Z", detail: "Pickup PIN verified" },
      { label: "Out for delivery", at: "2026-07-20T10:11:00Z", detail: "Driver: Kwame D." },
    ],
  },
  {
    id: "ord_05",
    reference: "NS-10398",
    customer: "Yaw Sarpong",
    customerPhone: "+233 50 331 4900",
    status: "DELIVERED",
    itemCount: 4,
    amountMinor: "48200",
    placedAt: "2026-07-19T15:44:00Z",
    deliveryAddress: "Osu, Oxford Street behind Shoprite, Accra",
    paymentMethod: "Card",
    items: [{ name: "Monthly office pantry pack", sku: "NP-OFF-042", quantity: "1", amountMinor: "48200" }],
    timeline: [
      { label: "Order received", at: "2026-07-19T15:44:00Z", detail: "Card payment verified" },
      { label: "Delivered", at: "2026-07-19T18:21:00Z", detail: "Customer delivery PIN verified" },
    ],
  },
  {
    id: "ord_06",
    reference: "NS-10372",
    customer: "Mabel Ofori",
    customerPhone: "+233 54 771 0921",
    status: "CANCELLED",
    itemCount: 2,
    amountMinor: "15400",
    placedAt: "2026-07-19T12:07:00Z",
    deliveryAddress: "Madina Estate, Social Welfare Junction, Accra",
    paymentMethod: "Mobile money",
    items: [{ name: "Cereal and milk pair", sku: "NP-BRK-005", quantity: "2", amountMinor: "15400" }],
    timeline: [
      { label: "Order received", at: "2026-07-19T12:07:00Z", detail: "Payment verified" },
      { label: "Cancelled", at: "2026-07-19T12:19:00Z", detail: "Stock discrepancy reported" },
    ],
  },
];

export const products: Product[] = [
  { id: "prd_01", name: "Organic pantry basket", sku: "NP-BSK-018", category: "Groceries", status: "APPROVED", stock: "34", reorderAt: "10", priceMinor: "26000", updatedAt: "2026-07-20T09:12:00Z" },
  { id: "prd_02", name: "Raw forest honey 500 ml", sku: "NP-HNY-005", category: "Pantry", status: "APPROVED", stock: "8", reorderAt: "12", priceMinor: "8425", updatedAt: "2026-07-20T08:51:00Z" },
  { id: "prd_03", name: "Weekend fresh produce box", sku: "NP-PRD-022", category: "Fresh food", status: "APPROVED", stock: "3", reorderAt: "8", priceMinor: "32900", updatedAt: "2026-07-20T08:12:00Z" },
  { id: "prd_04", name: "Monthly office pantry pack", sku: "NP-OFF-042", category: "Office supplies", status: "SUBMITTED", stock: "16", reorderAt: "5", priceMinor: "48200", updatedAt: "2026-07-19T16:04:00Z" },
  { id: "prd_05", name: "Breakfast provisions set", sku: "NP-BRK-012", category: "Groceries", status: "CHANGES_REQUESTED", stock: "21", reorderAt: "10", priceMinor: "9300", updatedAt: "2026-07-19T14:32:00Z" },
  { id: "prd_06", name: "Dried mango 200 g", sku: "NP-MNG-002", category: "Snacks", status: "DRAFT", stock: "0", reorderAt: "15", priceMinor: "4000", updatedAt: "2026-07-18T11:17:00Z" },
];

export const financeEntries: FinanceEntry[] = [
  { id: "fin_01", reference: "NS-10398", type: "SALE", status: "POSTED", amountMinor: "48200", occurredAt: "2026-07-19T18:21:00Z" },
  { id: "fin_02", reference: "FEE-10398", type: "COMMISSION", status: "POSTED", amountMinor: "-4820", occurredAt: "2026-07-19T18:21:01Z" },
  { id: "fin_03", reference: "NS-10387", type: "SALE", status: "POSTED", amountMinor: "27600", occurredAt: "2026-07-19T16:34:00Z" },
  { id: "fin_04", reference: "RF-10354", type: "REFUND", status: "POSTED", amountMinor: "-8300", occurredAt: "2026-07-19T11:09:00Z" },
  { id: "fin_05", reference: "PAY-240719", type: "PAYOUT", status: "POSTED", amountMinor: "-318450", occurredAt: "2026-07-19T08:00:00Z" },
  { id: "fin_06", reference: "NS-10482", type: "SALE", status: "PENDING", amountMinor: "42850", occurredAt: "2026-07-20T12:42:00Z" },
];

export const onboardingSteps: OnboardingStep[] = [
  { id: "business", label: "Business profile", detail: "Registration and trading details verified", status: "COMPLETE" },
  { id: "identity", label: "Identity verification", detail: "Primary operator identity verified", status: "COMPLETE" },
  { id: "payout", label: "Payout account", detail: "Fidelity Bank account ending 9041 verified", status: "COMPLETE" },
  { id: "location", label: "Fulfilment location", detail: "East Legon dispatch point review in progress", status: "IN_REVIEW" },
  { id: "agreement", label: "Marketplace agreement", detail: "Signature required from an authorised representative", status: "REQUIRED" },
];

export const dashboard: DashboardData = {
  metrics: [
    { label: "Today's gross sales", value: "GHS 1,284.50", change: "+12.4% vs yesterday", tone: "good" },
    { label: "Open orders", value: "12", change: "2 need a response", tone: "warning" },
    { label: "Ready to settle", value: "GHS 8,642.30", change: "Next payout 23 Jul", tone: "neutral" },
    { label: "Fulfilment rate", value: "97.8%", change: "+0.6 pts this month", tone: "good" },
  ],
  orders: orders.slice(0, 5),
  lowStock: products.filter((product) => Number(product.stock) <= Number(product.reorderAt)),
  onboardingPercent: 80,
};
