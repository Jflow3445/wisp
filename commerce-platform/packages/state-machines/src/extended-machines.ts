import type {
  CartStatus,
  CashObligationStatus,
  ChargebackStatus,
  FulfilmentStatus,
  PayoutStatus,
  PromotionStatus,
  ReconciliationIssueStatus,
  RefundStatus,
  SupportTicketStatus,
  UserStatus,
} from "@nister/contracts";
import { createMachine } from "./machine.js";

export type UserAccountAction =
  | "VERIFY"
  | "RESTRICT"
  | "REMOVE_RESTRICTION"
  | "SUSPEND"
  | "RESTORE_ACTIVE"
  | "RESTORE_RESTRICTED"
  | "DEACTIVATE"
  | "REACTIVATE_ACTIVE"
  | "REACTIVATE_RESTRICTED"
  | "REQUEST_DELETION"
  | "CANCEL_DELETION_ACTIVE"
  | "CANCEL_DELETION_DEACTIVATED"
  | "ANONYMISE";

export const userAccountMachine = createMachine<UserStatus, UserAccountAction>({
  VERIFY: { from: ["PENDING_VERIFICATION"], to: "ACTIVE", requiresEvidence: true },
  RESTRICT: { from: ["ACTIVE"], to: "RESTRICTED", requiresReason: true },
  REMOVE_RESTRICTION: { from: ["RESTRICTED"], to: "ACTIVE", requiresReason: true },
  SUSPEND: { from: ["PENDING_VERIFICATION", "ACTIVE", "RESTRICTED"], to: "SUSPENDED", requiresReason: true },
  RESTORE_ACTIVE: { from: ["SUSPENDED"], to: "ACTIVE", requiresReason: true },
  RESTORE_RESTRICTED: { from: ["SUSPENDED"], to: "RESTRICTED", requiresReason: true },
  DEACTIVATE: { from: ["ACTIVE", "RESTRICTED", "SUSPENDED"], to: "DEACTIVATED", requiresReason: true },
  REACTIVATE_ACTIVE: { from: ["DEACTIVATED"], to: "ACTIVE", requiresReason: true },
  REACTIVATE_RESTRICTED: { from: ["DEACTIVATED"], to: "RESTRICTED", requiresReason: true },
  REQUEST_DELETION: { from: ["ACTIVE", "RESTRICTED", "DEACTIVATED"], to: "DELETION_PENDING", requiresEvidence: true },
  CANCEL_DELETION_ACTIVE: { from: ["DELETION_PENDING"], to: "ACTIVE", requiresReason: true },
  CANCEL_DELETION_DEACTIVATED: { from: ["DELETION_PENDING"], to: "DEACTIVATED", requiresReason: true },
  ANONYMISE: { from: ["DELETION_PENDING"], to: "ANONYMISED", requiresEvidence: true },
});

export type CartAction = "CONVERT" | "ABANDON" | "EXPIRE" | "RESTORE";
export const cartMachine = createMachine<CartStatus, CartAction>({
  CONVERT: { from: ["ACTIVE"], to: "CONVERTED" },
  ABANDON: { from: ["ACTIVE"], to: "ABANDONED" },
  EXPIRE: { from: ["ACTIVE"], to: "EXPIRED" },
  RESTORE: { from: ["ABANDONED"], to: "ACTIVE" },
});

export type FulfilmentAction = "START_PICKING" | "PACK" | "MARK_READY" | "COLLECT" | "DELIVER" | "CANCEL" | "FAIL" | "RETRY";
export const fulfilmentMachine = createMachine<FulfilmentStatus, FulfilmentAction>({
  START_PICKING: { from: ["CREATED", "FAILED"], to: "PICKING" },
  PACK: { from: ["PICKING"], to: "PACKED" },
  MARK_READY: { from: ["PACKED"], to: "READY" },
  COLLECT: { from: ["READY"], to: "COLLECTED", requiresEvidence: true },
  DELIVER: { from: ["COLLECTED"], to: "DELIVERED", requiresEvidence: true },
  CANCEL: { from: ["CREATED", "PICKING", "PACKED", "READY", "FAILED"], to: "CANCELLED", requiresReason: true },
  FAIL: { from: ["PICKING", "PACKED", "READY", "COLLECTED"], to: "FAILED", requiresReason: true },
  RETRY: { from: ["FAILED"], to: "PICKING", requiresReason: true },
});

export type RefundAction = "APPROVE" | "REJECT" | "CANCEL" | "START_PROCESSING" | "REQUIRE_MANUAL_REVIEW" | "SUCCEED" | "FAIL" | "RETRY";
export const refundMachine = createMachine<RefundStatus, RefundAction>({
  APPROVE: { from: ["PENDING_APPROVAL"], to: "APPROVED", requiresEvidence: true },
  REJECT: { from: ["PENDING_APPROVAL", "MANUAL_REVIEW"], to: "REJECTED", requiresReason: true },
  CANCEL: { from: ["PENDING_APPROVAL", "FAILED"], to: "CANCELLED", requiresReason: true },
  START_PROCESSING: { from: ["APPROVED", "MANUAL_REVIEW"], to: "PROCESSING" },
  REQUIRE_MANUAL_REVIEW: { from: ["APPROVED", "PROCESSING", "FAILED"], to: "MANUAL_REVIEW", requiresReason: true },
  SUCCEED: { from: ["PROCESSING", "MANUAL_REVIEW"], to: "SUCCESSFUL", requiresEvidence: true },
  FAIL: { from: ["PROCESSING"], to: "FAILED", requiresReason: true },
  RETRY: { from: ["FAILED"], to: "PROCESSING", requiresReason: true },
});

export type PayoutAction = "HOLD" | "MARK_ELIGIBLE" | "SCHEDULE" | "START_PROCESSING" | "MARK_PAID" | "FAIL" | "REVERSE" | "CANCEL" | "RETRY";
export const payoutMachine = createMachine<PayoutStatus, PayoutAction>({
  HOLD: { from: ["PENDING", "ELIGIBLE", "SCHEDULED", "FAILED", "REVERSED"], to: "HELD", requiresReason: true },
  MARK_ELIGIBLE: { from: ["PENDING", "HELD", "REVERSED"], to: "ELIGIBLE", requiresEvidence: true },
  SCHEDULE: { from: ["ELIGIBLE", "FAILED"], to: "SCHEDULED" },
  START_PROCESSING: { from: ["SCHEDULED"], to: "PROCESSING" },
  MARK_PAID: { from: ["PROCESSING"], to: "PAID", requiresEvidence: true },
  FAIL: { from: ["PROCESSING"], to: "FAILED", requiresReason: true },
  REVERSE: { from: ["PROCESSING", "PAID"], to: "REVERSED", requiresEvidence: true },
  CANCEL: { from: ["PENDING", "HELD", "SCHEDULED", "FAILED", "REVERSED"], to: "CANCELLED", requiresReason: true },
  RETRY: { from: ["FAILED"], to: "SCHEDULED", requiresReason: true },
});

export type CashObligationAction = "PARTIAL_SETTLE" | "SETTLE" | "DISPUTE" | "MARK_OVERDUE" | "REOPEN" | "WRITE_OFF";
export const cashObligationMachine = createMachine<CashObligationStatus, CashObligationAction>({
  PARTIAL_SETTLE: { from: ["OPEN", "DISPUTED", "OVERDUE"], to: "PARTIALLY_SETTLED", requiresEvidence: true },
  SETTLE: { from: ["OPEN", "PARTIALLY_SETTLED", "DISPUTED", "OVERDUE"], to: "SETTLED", requiresEvidence: true },
  DISPUTE: { from: ["OPEN", "PARTIALLY_SETTLED", "OVERDUE"], to: "DISPUTED", requiresReason: true },
  MARK_OVERDUE: { from: ["OPEN", "PARTIALLY_SETTLED"], to: "OVERDUE" },
  REOPEN: { from: ["DISPUTED"], to: "OPEN", requiresReason: true },
  WRITE_OFF: { from: ["OVERDUE"], to: "WRITTEN_OFF", requiresReason: true, requiresEvidence: true },
});

export type ChargebackAction = "REQUIRE_EVIDENCE" | "BEGIN_PROVIDER_REVIEW" | "SUBMIT_EVIDENCE" | "EXPIRE" | "WIN" | "LOSE" | "PARTIAL_LOSS" | "CLOSE";
export const chargebackMachine = createMachine<ChargebackStatus, ChargebackAction>({
  REQUIRE_EVIDENCE: { from: ["RECEIVED"], to: "EVIDENCE_REQUIRED" },
  BEGIN_PROVIDER_REVIEW: { from: ["RECEIVED", "EVIDENCE_SUBMITTED"], to: "UNDER_PROVIDER_REVIEW" },
  SUBMIT_EVIDENCE: { from: ["EVIDENCE_REQUIRED"], to: "EVIDENCE_SUBMITTED", requiresEvidence: true },
  EXPIRE: { from: ["EVIDENCE_REQUIRED"], to: "EXPIRED" },
  WIN: { from: ["UNDER_PROVIDER_REVIEW"], to: "WON", requiresEvidence: true },
  LOSE: { from: ["UNDER_PROVIDER_REVIEW"], to: "LOST", requiresEvidence: true },
  PARTIAL_LOSS: { from: ["UNDER_PROVIDER_REVIEW"], to: "PARTIALLY_LOST", requiresEvidence: true },
  CLOSE: { from: ["WON", "LOST", "PARTIALLY_LOST", "EXPIRED"], to: "CLOSED" },
});

export type PromotionAction = "SUBMIT" | "APPROVE" | "REJECT" | "RETURN_TO_DRAFT" | "PAUSE" | "RESUME" | "EXPIRE" | "CANCEL";
export const promotionMachine = createMachine<PromotionStatus, PromotionAction>({
  SUBMIT: { from: ["DRAFT"], to: "PENDING_APPROVAL" },
  APPROVE: { from: ["PENDING_APPROVAL"], to: "ACTIVE", requiresEvidence: true },
  REJECT: { from: ["PENDING_APPROVAL"], to: "REJECTED", requiresReason: true },
  RETURN_TO_DRAFT: { from: ["PENDING_APPROVAL", "REJECTED"], to: "DRAFT", requiresReason: true },
  PAUSE: { from: ["ACTIVE"], to: "PAUSED", requiresReason: true },
  RESUME: { from: ["PAUSED"], to: "ACTIVE" },
  EXPIRE: { from: ["ACTIVE", "PAUSED"], to: "EXPIRED" },
  CANCEL: { from: ["ACTIVE", "PAUSED"], to: "CANCELLED", requiresReason: true },
});

export type SupportTicketAction = "WAIT_FOR_USER" | "WAIT_FOR_INTERNAL" | "RESOLVE" | "REOPEN" | "CLOSE";
export const supportTicketMachine = createMachine<SupportTicketStatus, SupportTicketAction>({
  WAIT_FOR_USER: { from: ["OPEN"], to: "WAITING_FOR_USER" },
  WAIT_FOR_INTERNAL: { from: ["OPEN"], to: "WAITING_FOR_INTERNAL" },
  RESOLVE: { from: ["OPEN", "WAITING_FOR_USER", "WAITING_FOR_INTERNAL"], to: "RESOLVED", requiresReason: true },
  REOPEN: { from: ["WAITING_FOR_USER", "WAITING_FOR_INTERNAL", "RESOLVED", "CLOSED"], to: "OPEN", requiresReason: true },
  CLOSE: { from: ["RESOLVED"], to: "CLOSED" },
});

export type ReconciliationAction = "ASSIGN" | "ESCALATE" | "INVESTIGATE" | "AWAIT_PROVIDER" | "AWAIT_INTERNAL" | "RESOLVE" | "IGNORE";
export const reconciliationIssueMachine = createMachine<ReconciliationIssueStatus, ReconciliationAction>({
  ASSIGN: { from: ["OPEN"], to: "ASSIGNED" },
  ESCALATE: { from: ["OPEN", "INVESTIGATING"], to: "ESCALATED", requiresReason: true },
  INVESTIGATE: { from: ["ASSIGNED", "AWAITING_PROVIDER", "AWAITING_INTERNAL_ACTION", "ESCALATED"], to: "INVESTIGATING" },
  AWAIT_PROVIDER: { from: ["INVESTIGATING"], to: "AWAITING_PROVIDER" },
  AWAIT_INTERNAL: { from: ["INVESTIGATING"], to: "AWAITING_INTERNAL_ACTION" },
  RESOLVE: { from: ["INVESTIGATING", "ESCALATED"], to: "RESOLVED", requiresReason: true, requiresEvidence: true },
  IGNORE: { from: ["INVESTIGATING"], to: "IGNORED", requiresReason: true },
});
