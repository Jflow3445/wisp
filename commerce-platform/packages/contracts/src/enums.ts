import { z } from "zod";

export const userStatuses = [
  "PENDING_VERIFICATION",
  "ACTIVE",
  "RESTRICTED",
  "SUSPENDED",
  "DEACTIVATED",
  "DELETION_PENDING",
  "ANONYMISED",
] as const;

export const vendorStatuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "DEACTIVATED",
] as const;

export const vendorApplicationStatuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const driverStatuses = [
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

export const productStatuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "ARCHIVED",
] as const;

export const checkoutStatuses = [
  "CREATED",
  "VALIDATING",
  "READY",
  "PAYMENT_PENDING",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
  "REVIEW_REQUIRED",
] as const;

export const reservationStatuses = ["ACTIVE", "CONSUMED", "RELEASED", "EXPIRED"] as const;

export const paymentStatuses = [
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

export const parentOrderStatuses = [
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

export const vendorOrderStatuses = [
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

export const deliveryStatuses = [
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

export const payoutStatuses = [
  "PENDING",
  "HELD",
  "ELIGIBLE",
  "SCHEDULED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "REVERSED",
  "CANCELLED",
] as const;

export const cartStatuses = ["ACTIVE", "CONVERTED", "ABANDONED", "EXPIRED"] as const;
export const fulfilmentStatuses = ["CREATED", "PICKING", "PACKED", "READY", "COLLECTED", "DELIVERED", "CANCELLED", "FAILED"] as const;
export const refundStatuses = ["PENDING_APPROVAL", "APPROVED", "PROCESSING", "SUCCESSFUL", "FAILED", "MANUAL_REVIEW", "REJECTED", "CANCELLED"] as const;
export const cashObligationStatuses = ["OPEN", "PARTIALLY_SETTLED", "SETTLED", "DISPUTED", "OVERDUE", "WRITTEN_OFF"] as const;
export const chargebackStatuses = ["RECEIVED", "EVIDENCE_REQUIRED", "EVIDENCE_SUBMITTED", "UNDER_PROVIDER_REVIEW", "WON", "LOST", "PARTIALLY_LOST", "EXPIRED", "CLOSED"] as const;
export const promotionStatuses = ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "REJECTED", "PAUSED", "EXPIRED", "CANCELLED"] as const;
export const supportTicketStatuses = ["OPEN", "WAITING_FOR_USER", "WAITING_FOR_INTERNAL", "RESOLVED", "CLOSED"] as const;
export const reconciliationIssueStatuses = ["OPEN", "ASSIGNED", "INVESTIGATING", "AWAITING_PROVIDER", "AWAITING_INTERNAL_ACTION", "RESOLVED", "IGNORED", "ESCALATED"] as const;

export const UserStatusSchema = z.enum(userStatuses);
export const VendorStatusSchema = z.enum(vendorStatuses);
export const VendorApplicationStatusSchema = z.enum(vendorApplicationStatuses);
export const DriverStatusSchema = z.enum(driverStatuses);
export const ProductStatusSchema = z.enum(productStatuses);
export const CheckoutStatusSchema = z.enum(checkoutStatuses);
export const ReservationStatusSchema = z.enum(reservationStatuses);
export const PaymentStatusSchema = z.enum(paymentStatuses);
export const ParentOrderStatusSchema = z.enum(parentOrderStatuses);
export const VendorOrderStatusSchema = z.enum(vendorOrderStatuses);
export const DeliveryStatusSchema = z.enum(deliveryStatuses);
export const PayoutStatusSchema = z.enum(payoutStatuses);
export const CartStatusSchema = z.enum(cartStatuses);
export const FulfilmentStatusSchema = z.enum(fulfilmentStatuses);
export const RefundStatusSchema = z.enum(refundStatuses);
export const CashObligationStatusSchema = z.enum(cashObligationStatuses);
export const ChargebackStatusSchema = z.enum(chargebackStatuses);
export const PromotionStatusSchema = z.enum(promotionStatuses);
export const SupportTicketStatusSchema = z.enum(supportTicketStatuses);
export const ReconciliationIssueStatusSchema = z.enum(reconciliationIssueStatuses);

export type UserStatus = z.infer<typeof UserStatusSchema>;
export type VendorStatus = z.infer<typeof VendorStatusSchema>;
export type VendorApplicationStatus = z.infer<typeof VendorApplicationStatusSchema>;
export type DriverStatus = z.infer<typeof DriverStatusSchema>;
export type ProductStatus = z.infer<typeof ProductStatusSchema>;
export type CheckoutStatus = z.infer<typeof CheckoutStatusSchema>;
export type ReservationStatus = z.infer<typeof ReservationStatusSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type ParentOrderStatus = z.infer<typeof ParentOrderStatusSchema>;
export type VendorOrderStatus = z.infer<typeof VendorOrderStatusSchema>;
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;
export type CartStatus = z.infer<typeof CartStatusSchema>;
export type FulfilmentStatus = z.infer<typeof FulfilmentStatusSchema>;
export type RefundStatus = z.infer<typeof RefundStatusSchema>;
export type CashObligationStatus = z.infer<typeof CashObligationStatusSchema>;
export type ChargebackStatus = z.infer<typeof ChargebackStatusSchema>;
export type PromotionStatus = z.infer<typeof PromotionStatusSchema>;
export type SupportTicketStatus = z.infer<typeof SupportTicketStatusSchema>;
export type ReconciliationIssueStatus = z.infer<typeof ReconciliationIssueStatusSchema>;
