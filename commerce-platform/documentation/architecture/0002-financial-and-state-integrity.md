# ADR 0002: State And Financial Integrity

Status: accepted

## Decision

- Every operational status change uses a named transition command with an
  expected version and idempotency key.
- Transition history, inventory movements, ledger postings and outbox events
  commit in the same PostgreSQL transaction where required.
- Ledger transactions are immutable and balanced per currency. Corrections are
  full reversals linked to the original posting.
- Money uses `bigint` minor units. Quantities use `numeric(18,6)` and cross API
  boundaries as strings.
- Payment redirects are informational only. Orders are confirmed by verified
  provider webhooks or server-side verification.
- PostgreSQL row locks and constraints protect final stock units. Redis locks
  may reduce contention but are never the source of truth.
