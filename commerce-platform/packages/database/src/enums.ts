import { pgEnum } from "drizzle-orm/pg-core";

export const userStatusValues = [
  "PENDING_VERIFICATION",
  "ACTIVE",
  "RESTRICTED",
  "SUSPENDED",
  "DEACTIVATED",
  "DELETION_PENDING",
  "ANONYMISED",
] as const;

export const vendorStatusValues = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "DEACTIVATED",
] as const;

export const vendorApplicationStatusValues = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const productStatusValues = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export const checkoutStatusValues = [
  "CREATED",
  "VALIDATING",
  "READY",
  "PAYMENT_PENDING",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "REVIEW_REQUIRED",
] as const;

export const reservationStatusValues = ["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"] as const;

export const paymentStatusValues = [
  "CREATED",
  "INITIALISED",
  "PENDING",
  "ACTION_REQUIRED",
  "SUCCESSFUL",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "REVERSED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "UNDER_REVIEW",
] as const;

export const parentOrderStatusValues = [
  "DRAFT",
  "PAYMENT_PENDING",
  "PAYMENT_REVIEW",
  "CONFIRMED",
  "PARTIALLY_ACCEPTED",
  "PROCESSING",
  "PARTIALLY_FULFILLED",
  "COMPLETED",
  "CANCELLED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;

export const vendorOrderStatusValues = [
  "AWAITING_VENDOR_RESPONSE",
  "ACCEPTED",
  "REJECTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "HANDED_TO_DRIVER",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;

export const deliveryStatusValues = [
  "CREATED",
  "AWAITING_ASSIGNMENT",
  "OFFER_SENT",
  "DRIVER_ASSIGNED",
  "DRIVER_ACCEPTED",
  "TRAVELLING_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKUP_VERIFIED",
  "IN_TRANSIT",
  "ARRIVED_AT_CUSTOMER",
  "COMPLETED",
  "FAILED",
  "RETURN_REQUIRED",
  "RETURNING_TO_VENDOR",
  "RETURNED_TO_VENDOR",
  "CANCELLED",
] as const;

export const driverStatusValues = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "APPROVED",
  "REJECTED",
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
] as const;

export const userStatusEnum = pgEnum("user_status", userStatusValues);
export const vendorStatusEnum = pgEnum("vendor_status", vendorStatusValues);
export const vendorApplicationStatusEnum = pgEnum(
  "vendor_application_status",
  vendorApplicationStatusValues,
);
export const productStatusEnum = pgEnum("product_status", productStatusValues);
export const checkoutStatusEnum = pgEnum("checkout_status", checkoutStatusValues);
export const reservationStatusEnum = pgEnum("reservation_status", reservationStatusValues);
export const paymentStatusEnum = pgEnum("payment_status", paymentStatusValues);
export const parentOrderStatusEnum = pgEnum("parent_order_status", parentOrderStatusValues);
export const vendorOrderStatusEnum = pgEnum("vendor_order_status", vendorOrderStatusValues);
export const deliveryStatusEnum = pgEnum("delivery_status", deliveryStatusValues);
export const driverStatusEnum = pgEnum("driver_status", driverStatusValues);

export const contactTypeEnum = pgEnum("contact_type", ["EMAIL", "PHONE"]);
export const permissionRiskEnum = pgEnum("permission_risk", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const permissionScopeEnum = pgEnum("permission_scope", [
  "GLOBAL",
  "COUNTRY",
  "REGION",
  "VENDOR",
  "STORE",
  "SELF",
  "ASSIGNED_RECORDS",
]);
export const actorTypeEnum = pgEnum("actor_type", ["USER", "SYSTEM", "PROVIDER"]);
export const membershipStatusEnum = pgEnum("membership_status", [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "REMOVED",
]);
export const storeStatusEnum = pgEnum("store_status", ["ACTIVE", "PAUSED", "SUSPENDED", "CLOSED"]);
export const categoryStatusEnum = pgEnum("category_status", ["ACTIVE", "ARCHIVED", "RESTRICTED"]);
export const brandStatusEnum = pgEnum("brand_status", ["ACTIVE", "ARCHIVED"]);
export const productConditionEnum = pgEnum("product_condition", ["NEW", "USED", "REFURBISHED"]);
export const variantStatusEnum = pgEnum("variant_status", ["ACTIVE", "ARCHIVED"]);
export const offerStatusEnum = pgEnum("offer_status", ["DRAFT", "ACTIVE", "PAUSED", "SUSPENDED", "ARCHIVED"]);
export const stockLocationTypeEnum = pgEnum("stock_location_type", ["STORE", "WAREHOUSE", "DARK_STORE"]);
export const stockLocationStatusEnum = pgEnum("stock_location_status", ["ACTIVE", "PAUSED", "CLOSED"]);
export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", [
  "INITIAL",
  "RESTOCK",
  "ADJUSTMENT",
  "RESERVATION",
  "RESERVATION_RELEASE",
  "SALE",
  "RETURN",
  "DAMAGE",
  "EXPIRY",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "COUNT_CORRECTION",
]);
export const cartStatusEnum = pgEnum("cart_status", ["ACTIVE", "CONVERTED", "ABANDONED", "EXPIRED"]);
export const orderItemStatusEnum = pgEnum("order_item_status", ["ACTIVE", "CANCELLED", "RETURNED", "REFUNDED"]);
export const webhookProcessingStatusEnum = pgEnum("webhook_processing_status", [
  "RECEIVED",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "IGNORED",
]);
export const ledgerAccountTypeEnum = pgEnum("ledger_account_type", [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
]);
export const ledgerOwnerTypeEnum = pgEnum("ledger_owner_type", [
  "PLATFORM",
  "VENDOR",
  "DRIVER",
  "TAX_AUTHORITY",
  "PAYMENT_PROVIDER",
]);
export const ledgerAccountStatusEnum = pgEnum("ledger_account_status", ["ACTIVE", "CLOSED"]);
export const ledgerTransactionStatusEnum = pgEnum("ledger_transaction_status", ["PENDING", "POSTED"]);
export const ledgerDirectionEnum = pgEnum("ledger_direction", ["DEBIT", "CREDIT"]);
export const deliveryMethodEnum = pgEnum("delivery_method", ["PLATFORM", "VENDOR", "PICKUP", "THIRD_PARTY"]);
export const deliveryQuoteStatusEnum = pgEnum("delivery_quote_status", [
  "ACTIVE",
  "ACCEPTED",
  "EXPIRED",
  "CANCELLED",
]);
export const vehicleTypeEnum = pgEnum("vehicle_type", ["BICYCLE", "MOTORBIKE", "CAR", "VAN", "TRUCK"]);
export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "PENDING",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
]);
export const driverShiftStatusEnum = pgEnum("driver_shift_status", ["STARTED", "PAUSED", "ENDED"]);
export const driverLocationSourceEnum = pgEnum("driver_location_source", [
  "FOREGROUND",
  "BACKGROUND",
  "OFFLINE_SYNC",
]);
export const deliveryOfferStatusEnum = pgEnum("delivery_offer_status", [
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
]);
export const driverCashTransactionTypeEnum = pgEnum("driver_cash_transaction_type", [
  "CASH_COLLECTED",
  "CASH_DEPOSITED",
  "CASH_ADJUSTMENT",
  "CASH_WRITEOFF",
]);
export const driverCashTransactionStatusEnum = pgEnum("driver_cash_transaction_status", [
  "PENDING",
  "CONFIRMED",
  "DISPUTED",
]);
export const outboxStatusEnum = pgEnum("outbox_status", ["PENDING", "PROCESSING", "PROCESSED", "FAILED"]);
