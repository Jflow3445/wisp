export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "PREORDER";

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string;
  accent: string;
}

export interface Vendor {
  id: string;
  slug: string;
  name: string;
  location: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  description: string;
  fulfilment: string;
}

export interface Product {
  id: string;
  offerId: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  categorySlug: string;
  vendorSlug: string;
  image: string;
  imageAlt: string;
  priceMinor: string;
  previousPriceMinor: string | null;
  currency: "GHS";
  rating: number;
  reviewCount: number;
  stockStatus: StockStatus;
  availableQuantity: string;
  badge?: string;
  highlights: string[];
}

export interface CartLine {
  offerId: string;
  quantity: string;
}

export interface DeliveryAddress {
  recipientName: string;
  phone: string;
  region: string;
  city: string;
  streetAddress: string;
  digitalAddress?: string;
  landmark: string;
  deliveryInstructions?: string;
}

export interface PaymentSelection {
  method: "MOBILE_MONEY" | "CARD" | "CASH_ON_DELIVERY";
  network?: "MTN" | "TELECEL" | "AT";
  phone?: string;
}

export interface CheckoutPayload {
  cartVersion: number;
  currency: "GHS";
  items: CartLine[];
  deliveryAddress: DeliveryAddress;
  payment: PaymentSelection;
}

export interface OrderItem extends CartLine {
  productName: string;
  image: string;
  unitPriceMinor: string;
}

export interface Order {
  id: string;
  publicReference: string;
  status: "PAYMENT_PENDING" | "CONFIRMED" | "PROCESSING" | "OUT_FOR_DELIVERY" | "COMPLETED";
  placedAt: string;
  totalMinor: string;
  deliveryMinor: string;
  currency: "GHS";
  items: OrderItem[];
  address: DeliveryAddress;
  paymentMethod: string;
  isDemo?: boolean;
  timeline: Array<{ label: string; at?: string; complete: boolean }>;
}

export interface CatalogFilters {
  query?: string;
  category?: string;
  vendor?: string;
  sort?: "featured" | "price-asc" | "price-desc" | "rating";
}
