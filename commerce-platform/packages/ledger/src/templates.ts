import { money } from "@nister/money";
import type { JournalDraft, JournalEntry } from "./index.js";

interface PostingContext {
  sourceEventId: string;
  entityId: string;
  currency: string;
}

function entry(accountCode: JournalEntry["accountCode"], direction: JournalEntry["direction"], amountMinor: bigint, currency: string, dimensions: Partial<JournalEntry> = {}): JournalEntry {
  return { accountCode, direction, amount: money(amountMinor, currency), ...dimensions };
}

export function paymentCaptured(context: PostingContext & { paymentId: string; amountMinor: bigint }): JournalDraft {
  const dimensions = { paymentId: context.paymentId };
  return {
    sourceEventId: context.sourceEventId,
    sourceEntityType: "PAYMENT",
    sourceEntityId: context.entityId,
    postingTemplateCode: "PAYMENT_CAPTURED_V1",
    currency: context.currency,
    entries: [
      entry("PAYMENT_PROVIDER_RECEIVABLE", "DEBIT", context.amountMinor, context.currency, dimensions),
      entry("CUSTOMER_FUNDS_CLEARING", "CREDIT", context.amountMinor, context.currency, dimensions),
    ],
  };
}

export function vendorOrderAccepted(context: PostingContext & { vendorOrderId: string; vendorId: string; vendorNetMinor: bigint; commissionMinor: bigint }): JournalDraft {
  const gross = context.vendorNetMinor + context.commissionMinor;
  const dimensions = { vendorOrderId: context.vendorOrderId, vendorId: context.vendorId };
  return {
    sourceEventId: context.sourceEventId,
    sourceEntityType: "VENDOR_ORDER",
    sourceEntityId: context.entityId,
    postingTemplateCode: "VENDOR_ORDER_ACCEPTED_V1",
    currency: context.currency,
    entries: [
      entry("CUSTOMER_FUNDS_CLEARING", "DEBIT", gross, context.currency, dimensions),
      entry("VENDOR_PAYABLE_PENDING_FULFILMENT", "CREDIT", context.vendorNetMinor, context.currency, dimensions),
      entry("COMMISSION_DEFERRED", "CREDIT", context.commissionMinor, context.currency, dimensions),
    ],
  };
}

export function vendorPayoutInitiated(context: PostingContext & { vendorId: string; payoutId: string; amountMinor: bigint }): JournalDraft {
  const dimensions = { vendorId: context.vendorId, payoutId: context.payoutId };
  return {
    sourceEventId: context.sourceEventId,
    sourceEntityType: "PAYOUT",
    sourceEntityId: context.entityId,
    postingTemplateCode: "VENDOR_PAYOUT_INITIATED_V1",
    currency: context.currency,
    entries: [
      entry("VENDOR_PAYABLE_AVAILABLE", "DEBIT", context.amountMinor, context.currency, dimensions),
      entry("VENDOR_PAYOUT_CLEARING", "CREDIT", context.amountMinor, context.currency, dimensions),
    ],
  };
}
