import type { Money } from "@nister/money";
import type { LedgerAccountCode } from "./accounts.js";

export * from "./accounts.js";
export * from "./templates.js";

export interface JournalEntry {
  accountCode: LedgerAccountCode;
  direction: "DEBIT" | "CREDIT";
  amount: Money;
  vendorId?: string;
  driverId?: string;
  orderId?: string;
  vendorOrderId?: string;
  paymentId?: string;
  deliveryId?: string;
  refundId?: string;
  payoutId?: string;
}

export interface JournalDraft {
  sourceEventId: string;
  sourceEntityType: string;
  sourceEntityId: string;
  postingTemplateCode: string;
  currency: string;
  entries: readonly JournalEntry[];
  reversesTransactionId?: string;
}

export function assertBalancedJournal(journal: JournalDraft): void {
  if (journal.entries.length < 2) {
    throw new Error("A journal requires at least two entries");
  }
  const currencies = new Set(journal.entries.map((entry) => entry.amount.currency));
  if (currencies.size !== 1 || !currencies.has(journal.currency)) {
    throw new Error("All journal entries must use the journal currency");
  }
  if (journal.entries.some((entry) => entry.amount.amountMinor <= 0n)) {
    throw new Error("Journal entry amounts must be positive");
  }
  const debit = journal.entries
    .filter((entry) => entry.direction === "DEBIT")
    .reduce((total, entry) => total + entry.amount.amountMinor, 0n);
  const credit = journal.entries
    .filter((entry) => entry.direction === "CREDIT")
    .reduce((total, entry) => total + entry.amount.amountMinor, 0n);
  if (debit !== credit) {
    throw new Error(`Unbalanced journal: debits ${debit} do not equal credits ${credit}`);
  }
}

export function reverseJournal(original: JournalDraft, originalTransactionId: string, reversalEventId: string): JournalDraft {
  return {
    sourceEventId: reversalEventId,
    sourceEntityType: original.sourceEntityType,
    sourceEntityId: original.sourceEntityId,
    postingTemplateCode: "JOURNAL_REVERSAL_V1",
    currency: original.currency,
    reversesTransactionId: originalTransactionId,
    entries: original.entries.map((entry) => ({
      ...entry,
      direction: entry.direction === "DEBIT" ? "CREDIT" : "DEBIT",
    })),
  };
}
