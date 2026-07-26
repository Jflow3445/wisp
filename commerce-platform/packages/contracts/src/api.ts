import { z } from "zod";

export const RequestIdSchema = z.uuid();

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
}

export interface ObjectResponse<T> {
  data: T;
  meta: ResponseMeta;
}

export interface ListResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
  };
  meta: ResponseMeta;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

export const CursorPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const CriticalHeadersSchema = z.object({
  "x-request-id": z.uuid().optional(),
  "idempotency-key": z.string().min(8).max(255),
});

export const errorCodes = [
  "AUTHENTICATION_REQUIRED",
  "TOKEN_EXPIRED",
  "ACCOUNT_RESTRICTED",
  "ACCOUNT_SUSPENDED",
  "MFA_REQUIRED",
  "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND",
  "VALIDATION_FAILED",
  "INVALID_STATE_TRANSITION",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_PAYLOAD_MISMATCH",
  "RATE_LIMITED",
  "PRODUCT_UNAVAILABLE",
  "VENDOR_UNAVAILABLE",
  "VARIANT_REQUIRED",
  "INSUFFICIENT_STOCK",
  "STOCK_RESERVATION_EXPIRED",
  "PRICE_CHANGED",
  "CART_CHANGED",
  "ADDRESS_OUTSIDE_SERVICE_AREA",
  "DELIVERY_OPTION_UNAVAILABLE",
  "DELIVERY_QUOTE_EXPIRED",
  "COUPON_INVALID",
  "COUPON_EXPIRED",
  "COUPON_NOT_ELIGIBLE",
  "PROMOTION_LIMIT_REACHED",
  "PAYMENT_INITIALISATION_FAILED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "PAYMENT_ALREADY_COMPLETED",
  "PAYMENT_RECONCILIATION_REQUIRED",
  "ORDER_NOT_CANCELLABLE",
  "ORDER_RESPONSE_EXPIRED",
  "ITEM_NOT_RETURNABLE",
  "REFUND_NOT_ALLOWED",
  "REFUND_AMOUNT_EXCEEDED",
  "REFUND_APPROVAL_REQUIRED",
  "PAYOUT_NOT_ELIGIBLE",
  "PAYOUT_ACCOUNT_UNVERIFIED",
  "PAYOUT_APPROVAL_REQUIRED",
  "DRIVER_NOT_ELIGIBLE",
  "DRIVER_CASH_LIMIT_EXCEEDED",
  "DELIVERY_OFFER_EXPIRED",
  "DELIVERY_VERIFICATION_FAILED",
  "FILE_TYPE_NOT_ALLOWED",
  "FILE_TOO_LARGE",
  "FILE_SECURITY_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "SERVICE_TEMPORARILY_UNAVAILABLE",
] as const;

export type ErrorCode = (typeof errorCodes)[number];
