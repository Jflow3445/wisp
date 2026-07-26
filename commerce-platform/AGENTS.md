# NISTER Marketplace Agent Guide

This directory is the additive NISTER commerce platform. It is intentionally
isolated from the production WISP implementation in the repository root.

## Hard Boundary

- Do not modify `../hotspot`, `../api`, `../pay-portal`, `../wifi-portal`,
  `../ops`, router deployment scripts, or existing WISP runtime behavior while
  working on marketplace features.
- Do not fold marketplace code into `../nister-org`. Brand integration must use
  links, documented APIs, or separately deployed hosts.
- Marketplace API and payment routes must use marketplace-specific hosts and
  credentials. They must never reuse the WISP hotspot API or wallet ledger.

## Source Of Truth

- PostgreSQL is authoritative for marketplace business data.
- Inventory movements are authoritative for stock.
- Posted double-entry ledger transactions are authoritative for money.
- Verified provider events are authoritative for payment outcomes.
- Named state-machine commands are authoritative for operational transitions.

## Working Contract

- Read `documentation/IMPLEMENTATION_STATUS.md` before starting work.
- Update that file in the same change whenever a work item is completed,
  deferred, or materially re-scoped.
- Never edit posted ledger entries or status columns directly. Corrections use
  reversal transactions and named transition services.
- Store money as integer minor units and quantities as fixed-precision decimal
  strings. Never use floating point for financial calculations.
- Critical creates and transitions require idempotency keys.

## Required Checks

Run from this directory:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run integration and browser suites when their dependencies are available:

```bash
pnpm test:integration
pnpm test:e2e
```
