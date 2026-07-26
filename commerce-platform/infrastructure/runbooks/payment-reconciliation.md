# Payment Reconciliation

Run daily and after any provider incident. Compare provider events, internal
payment state, order existence, journal postings, settlement receivables, bank
deposits, fees and refunds.

Required issue codes include `PROVIDER_PAID_INTERNAL_PENDING`,
`INTERNAL_PAID_PROVIDER_MISSING`, `ORDER_MISSING_FOR_PAYMENT`,
`LEDGER_MISSING_FOR_PAYMENT`, `DUPLICATE_PROVIDER_CHARGE`,
`REFUND_PROVIDER_ONLY`, `REFUND_INTERNAL_ONLY`,
`SETTLEMENT_AMOUNT_MISMATCH`, `PAYOUT_STATUS_MISMATCH`,
`CASH_DEPOSIT_MISMATCH` and `UNBALANCED_LEDGER_TRANSACTION`.

An ambiguous provider timeout remains under review. Do not retry a refund or
payout automatically until provider status is known. Corrections use a named
command, reason, evidence, approval, full journal reversal where applicable and
an immutable audit record.
