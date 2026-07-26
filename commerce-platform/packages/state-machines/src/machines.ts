import type {
  CheckoutStatus,
  DeliveryStatus,
  PaymentStatus,
  ProductStatus,
  ReservationStatus,
  VendorApplicationStatus,
  VendorOrderStatus,
  VendorStatus,
} from "@nister/contracts";
import { createMachine } from "./machine.js";

export type VendorApplicationAction =
  | "SUBMIT"
  | "BEGIN_REVIEW"
  | "REQUEST_INFORMATION"
  | "RESUBMIT"
  | "APPROVE"
  | "REJECT"
  | "WITHDRAW"
  | "REOPEN";

export const vendorApplicationMachine = createMachine<VendorApplicationStatus, VendorApplicationAction>({
  SUBMIT: { from: ["DRAFT"], to: "SUBMITTED" },
  BEGIN_REVIEW: { from: ["SUBMITTED"], to: "UNDER_REVIEW" },
  REQUEST_INFORMATION: { from: ["UNDER_REVIEW"], to: "MORE_INFORMATION_REQUIRED", requiresReason: true },
  RESUBMIT: { from: ["MORE_INFORMATION_REQUIRED"], to: "SUBMITTED" },
  APPROVE: { from: ["UNDER_REVIEW"], to: "APPROVED" },
  REJECT: { from: ["UNDER_REVIEW"], to: "REJECTED", requiresReason: true },
  WITHDRAW: { from: ["DRAFT", "SUBMITTED", "MORE_INFORMATION_REQUIRED"], to: "WITHDRAWN", requiresReason: true },
  REOPEN: { from: ["REJECTED"], to: "DRAFT", requiresReason: true },
});

export type VendorOperationalAction = "SUSPEND" | "RESTORE" | "DEACTIVATE" | "REACTIVATE";
export const vendorOperationalMachine = createMachine<VendorStatus, VendorOperationalAction>({
  SUSPEND: { from: ["APPROVED"], to: "SUSPENDED", requiresReason: true },
  RESTORE: { from: ["SUSPENDED"], to: "APPROVED", requiresReason: true },
  DEACTIVATE: { from: ["APPROVED", "SUSPENDED"], to: "DEACTIVATED", requiresReason: true },
  REACTIVATE: { from: ["DEACTIVATED"], to: "APPROVED", requiresReason: true },
});

export type ProductAction =
  | "SUBMIT"
  | "BEGIN_REVIEW"
  | "REQUEST_CHANGES"
  | "EDIT"
  | "RESUBMIT"
  | "APPROVE"
  | "REJECT"
  | "REOPEN"
  | "SUSPEND"
  | "RESTORE"
  | "ARCHIVE"
  | "RESTORE_DRAFT";

export const productMachine = createMachine<ProductStatus, ProductAction>({
  SUBMIT: { from: ["DRAFT"], to: "SUBMITTED" },
  BEGIN_REVIEW: { from: ["SUBMITTED"], to: "UNDER_REVIEW" },
  REQUEST_CHANGES: { from: ["UNDER_REVIEW"], to: "CHANGES_REQUESTED", requiresReason: true },
  EDIT: { from: ["CHANGES_REQUESTED"], to: "DRAFT" },
  RESUBMIT: { from: ["CHANGES_REQUESTED"], to: "SUBMITTED" },
  APPROVE: { from: ["UNDER_REVIEW"], to: "APPROVED" },
  REJECT: { from: ["UNDER_REVIEW"], to: "REJECTED", requiresReason: true },
  REOPEN: { from: ["REJECTED"], to: "DRAFT", requiresReason: true },
  SUSPEND: { from: ["APPROVED"], to: "SUSPENDED", requiresReason: true },
  RESTORE: { from: ["SUSPENDED"], to: "APPROVED", requiresReason: true },
  ARCHIVE: { from: ["DRAFT", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED"], to: "ARCHIVED" },
  RESTORE_DRAFT: { from: ["ARCHIVED"], to: "DRAFT", requiresReason: true },
});

export type CheckoutAction =
  | "BEGIN_VALIDATION"
  | "PASS_VALIDATION"
  | "REQUIRE_REVIEW"
  | "FAIL_VALIDATION"
  | "VALIDATION_TIMEOUT"
  | "UPDATE_DETAILS"
  | "START_PAYMENT"
  | "CONFIRM_COD"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "PAYMENT_EXPIRED"
  | "PAYMENT_AMBIGUOUS"
  | "CONFIRM_REVIEWED_PAYMENT"
  | "RETURN_TO_READY"
  | "CANCEL_AND_REFUND"
  | "EXPIRE"
  | "CANCEL";

export const checkoutMachine = createMachine<CheckoutStatus, CheckoutAction>({
  BEGIN_VALIDATION: { from: ["CREATED"], to: "VALIDATING" },
  PASS_VALIDATION: { from: ["VALIDATING"], to: "READY" },
  REQUIRE_REVIEW: { from: ["VALIDATING"], to: "REVIEW_REQUIRED", requiresReason: true },
  FAIL_VALIDATION: { from: ["VALIDATING"], to: "CANCELLED", requiresReason: true },
  VALIDATION_TIMEOUT: { from: ["VALIDATING"], to: "EXPIRED" },
  UPDATE_DETAILS: { from: ["READY"], to: "VALIDATING" },
  START_PAYMENT: { from: ["READY"], to: "PAYMENT_PENDING" },
  CONFIRM_COD: { from: ["READY"], to: "COMPLETED" },
  PAYMENT_SUCCESS: { from: ["PAYMENT_PENDING"], to: "COMPLETED" },
  PAYMENT_FAILED: { from: ["PAYMENT_PENDING"], to: "READY", requiresReason: true },
  PAYMENT_EXPIRED: { from: ["PAYMENT_PENDING"], to: "EXPIRED" },
  PAYMENT_AMBIGUOUS: { from: ["PAYMENT_PENDING"], to: "REVIEW_REQUIRED", requiresReason: true },
  CONFIRM_REVIEWED_PAYMENT: { from: ["REVIEW_REQUIRED"], to: "COMPLETED" },
  RETURN_TO_READY: { from: ["REVIEW_REQUIRED"], to: "READY", requiresReason: true },
  CANCEL_AND_REFUND: { from: ["REVIEW_REQUIRED"], to: "CANCELLED", requiresReason: true },
  EXPIRE: { from: ["CREATED", "READY", "REVIEW_REQUIRED"], to: "EXPIRED" },
  CANCEL: { from: ["READY", "PAYMENT_PENDING"], to: "CANCELLED", requiresReason: true },
});

export type ReservationAction = "CONSUME" | "RELEASE" | "EXPIRE";
export const reservationMachine = createMachine<ReservationStatus, ReservationAction>({
  CONSUME: { from: ["ACTIVE"], to: "CONSUMED" },
  RELEASE: { from: ["ACTIVE"], to: "RELEASED" },
  EXPIRE: { from: ["ACTIVE"], to: "EXPIRED" },
});

export type PaymentAction =
  | "INITIALISE"
  | "MARK_PENDING"
  | "REQUIRE_ACTION"
  | "CONFIRM_SUCCESS"
  | "FAIL"
  | "EXPIRE"
  | "CANCEL"
  | "REVERSE"
  | "PARTIAL_REFUND"
  | "FULL_REFUND"
  | "REQUIRE_REVIEW"
  | "RETRY";

export const paymentMachine = createMachine<PaymentStatus, PaymentAction>({
  INITIALISE: { from: ["CREATED"], to: "INITIALISED" },
  MARK_PENDING: { from: ["INITIALISED", "ACTION_REQUIRED"], to: "PENDING" },
  REQUIRE_ACTION: { from: ["INITIALISED", "PENDING"], to: "ACTION_REQUIRED" },
  CONFIRM_SUCCESS: { from: ["INITIALISED", "PENDING", "ACTION_REQUIRED", "UNDER_REVIEW"], to: "SUCCESSFUL", requiresEvidence: true },
  FAIL: { from: ["INITIALISED", "PENDING", "ACTION_REQUIRED", "UNDER_REVIEW"], to: "FAILED", requiresReason: true },
  EXPIRE: { from: ["CREATED", "INITIALISED", "PENDING", "ACTION_REQUIRED"], to: "EXPIRED" },
  CANCEL: { from: ["CREATED", "INITIALISED", "PENDING", "ACTION_REQUIRED"], to: "CANCELLED" },
  REVERSE: { from: ["SUCCESSFUL"], to: "REVERSED", requiresReason: true },
  PARTIAL_REFUND: { from: ["SUCCESSFUL", "PARTIALLY_REFUNDED"], to: "PARTIALLY_REFUNDED" },
  FULL_REFUND: { from: ["SUCCESSFUL", "PARTIALLY_REFUNDED"], to: "REFUNDED" },
  REQUIRE_REVIEW: { from: ["INITIALISED", "PENDING", "ACTION_REQUIRED"], to: "UNDER_REVIEW", requiresReason: true },
  RETRY: { from: ["FAILED", "EXPIRED"], to: "INITIALISED" },
});

export type VendorOrderAction =
  | "ACCEPT"
  | "REJECT"
  | "START_PREPARATION"
  | "MARK_READY"
  | "HAND_OVER"
  | "START_DELIVERY"
  | "COMPLETE_DELIVERY"
  | "CANCEL"
  | "REQUEST_RETURN"
  | "RECEIVE_RETURN"
  | "PARTIAL_REFUND"
  | "FULL_REFUND";

export const vendorOrderMachine = createMachine<VendorOrderStatus, VendorOrderAction>({
  ACCEPT: { from: ["AWAITING_VENDOR_RESPONSE"], to: "ACCEPTED" },
  REJECT: { from: ["AWAITING_VENDOR_RESPONSE"], to: "REJECTED", requiresReason: true },
  START_PREPARATION: { from: ["ACCEPTED"], to: "PREPARING" },
  MARK_READY: { from: ["PREPARING"], to: "READY_FOR_PICKUP" },
  HAND_OVER: { from: ["READY_FOR_PICKUP"], to: "HANDED_TO_DRIVER", requiresEvidence: true },
  START_DELIVERY: { from: ["HANDED_TO_DRIVER"], to: "OUT_FOR_DELIVERY" },
  COMPLETE_DELIVERY: { from: ["OUT_FOR_DELIVERY"], to: "DELIVERED", requiresEvidence: true },
  CANCEL: { from: ["AWAITING_VENDOR_RESPONSE", "ACCEPTED", "PREPARING"], to: "CANCELLED", requiresReason: true },
  REQUEST_RETURN: { from: ["DELIVERED"], to: "RETURN_REQUESTED", requiresReason: true },
  RECEIVE_RETURN: { from: ["RETURN_REQUESTED"], to: "RETURNED", requiresEvidence: true },
  PARTIAL_REFUND: { from: ["DELIVERED", "RETURNED", "PARTIALLY_REFUNDED"], to: "PARTIALLY_REFUNDED" },
  FULL_REFUND: { from: ["DELIVERED", "RETURNED", "PARTIALLY_REFUNDED"], to: "REFUNDED" },
});

export type DeliveryAction =
  | "QUEUE_FOR_ASSIGNMENT"
  | "SEND_OFFER"
  | "ASSIGN_DRIVER"
  | "DRIVER_ACCEPT"
  | "TRAVEL_TO_PICKUP"
  | "ARRIVE_PICKUP"
  | "VERIFY_PICKUP"
  | "START_TRANSIT"
  | "ARRIVE_CUSTOMER"
  | "COMPLETE"
  | "FAIL"
  | "REQUIRE_RETURN"
  | "START_RETURN"
  | "COMPLETE_RETURN"
  | "CANCEL";

export const deliveryMachine = createMachine<DeliveryStatus, DeliveryAction>({
  QUEUE_FOR_ASSIGNMENT: { from: ["CREATED"], to: "AWAITING_ASSIGNMENT" },
  SEND_OFFER: { from: ["AWAITING_ASSIGNMENT"], to: "OFFER_SENT" },
  ASSIGN_DRIVER: { from: ["AWAITING_ASSIGNMENT", "OFFER_SENT"], to: "DRIVER_ASSIGNED" },
  DRIVER_ACCEPT: { from: ["DRIVER_ASSIGNED"], to: "DRIVER_ACCEPTED" },
  TRAVEL_TO_PICKUP: { from: ["DRIVER_ACCEPTED"], to: "TRAVELLING_TO_PICKUP" },
  ARRIVE_PICKUP: { from: ["TRAVELLING_TO_PICKUP"], to: "ARRIVED_AT_PICKUP" },
  VERIFY_PICKUP: { from: ["ARRIVED_AT_PICKUP"], to: "PICKUP_VERIFIED", requiresEvidence: true },
  START_TRANSIT: { from: ["PICKUP_VERIFIED"], to: "IN_TRANSIT" },
  ARRIVE_CUSTOMER: { from: ["IN_TRANSIT"], to: "ARRIVED_AT_CUSTOMER" },
  COMPLETE: { from: ["ARRIVED_AT_CUSTOMER"], to: "COMPLETED", requiresEvidence: true },
  FAIL: { from: ["TRAVELLING_TO_PICKUP", "ARRIVED_AT_PICKUP", "PICKUP_VERIFIED", "IN_TRANSIT", "ARRIVED_AT_CUSTOMER"], to: "FAILED", requiresReason: true },
  REQUIRE_RETURN: { from: ["FAILED"], to: "RETURN_REQUIRED", requiresReason: true },
  START_RETURN: { from: ["RETURN_REQUIRED"], to: "RETURNING_TO_VENDOR" },
  COMPLETE_RETURN: { from: ["RETURNING_TO_VENDOR"], to: "RETURNED_TO_VENDOR", requiresEvidence: true },
  CANCEL: { from: ["CREATED", "AWAITING_ASSIGNMENT", "OFFER_SENT", "DRIVER_ASSIGNED"], to: "CANCELLED", requiresReason: true },
});
