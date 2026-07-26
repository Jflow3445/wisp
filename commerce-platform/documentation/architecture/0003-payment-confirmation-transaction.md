# ADR 0003: Verified Payment Confirmation Transaction

Status: accepted

## Decision

A browser redirect never confirms a payment. A verified and deduplicated
Paystack webhook or server-side verification command is the only automated
source of a successful provider outcome.

Payment confirmation runs one database command that:

1. Locks the payment, checkout, active reservations and affected inventory.
2. Verifies idempotency, provider evidence, expected versions, reservation
   validity and current stock.
3. Marks the payment successful.
4. Creates one parent order, vendor-specific orders and immutable item snapshots.
5. Consumes reservations and writes inventory movements.
6. Posts the balanced `PAYMENT_CAPTURED_V1` journal.
7. Writes transition history, audit and outbox events.
8. Commits before notifications or search projections run.

If the payment is successful after a reservation expires, the command enters
manual reconciliation. It must not recreate stock, oversell or silently refund
without an explicit controlled decision.
