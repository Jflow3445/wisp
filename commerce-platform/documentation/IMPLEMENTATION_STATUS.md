# Marketplace Implementation Status

Last updated: 2026-07-20

This is the handoff ledger for all future agents. Update it with every material
marketplace change. The production WISP remains outside this directory and has
not been modified by marketplace implementation.

## Source Documents

- `API and Database Contract.docx`
- `Complete Multi-Vendor Ecommerce Platform Specification.docx`
- `Complete Screen-by-Screen Requirements Specification.docx`
- `State-Machine and Financial-Ledger Specification.docx`

The original documents were supplied outside the repository. Their mandatory
architecture and integrity rules are recorded in `AGENTS.md` and the ADRs.

## Delivery Status

| Release area | Status | Evidence / next action |
| --- | --- | --- |
| WISP isolation | Complete | `commerce-platform/AGENTS.md`, ADR 0001 |
| Monorepo foundation | In progress | Workspace, local services, guardrails and ADRs added; application integration pending |
| Shared contracts and validation | In progress | API envelopes, key enums, Ghana address/cart/checkout validation added; Release 2/3 contracts remain |
| Money and permission foundations | Complete | Exact bigint arithmetic and scoped authorization packages have passing tests |
| State-machine foundation | In progress | Release 1 checkout/payment/vendor/product/order/delivery machines added; remaining machines and actor/guard policies remain |
| Financial-ledger foundation | In progress | Chart, balance/reversal rules and core posting templates added; remaining approved templates and DB posting service remain |
| PostgreSQL schema and migrations | Complete | 47 tables, generated migration, deterministic seeds and deferred ledger/reversal triggers verified in PGlite |
| Auth0 and RBAC adapter | In progress | Development/Auth0 boundary, OIDC validation and scoped API guard added; production tenant remains an external blocker |
| Catalogue and inventory | Not started | API, stock movements, reservation locking and tests |
| Cart and checkout | Not started | Multi-vendor calculation and checkout state machine |
| Paystack and ledger | Not started | Verified webhooks, postings, reversal and reconciliation |
| Orders and vendor fulfilment | Not started | Parent/vendor order split and controlled transitions |
| Basic delivery | Not started | Delivery creation, assignment and completion flow |
| Storefront web | In progress | Release 1 route implementation and browser tests added; top-level verification pending |
| Vendor portal | In progress | Dashboard, catalogue, inventory, order and finance surfaces added; top-level verification pending |
| Admin portal | In progress | Moderation, orders, payments, ledger, reconciliation and audit surfaces added; top-level verification pending |
| Background worker | In progress | Queue taxonomy, stable job IDs and outbox dispatcher added; domain processors and persistence pending |
| Mobile apps | Deferred to Release 2 | Buyer, vendor and driver Expo apps remain required |
| Advanced marketplace | Deferred to Release 3 | Promotions, returns, disputes, automated payouts, fraud |
| Infrastructure as code | In progress | VPC, Aurora, Redis, S3, ECS/ECR/secrets baseline, Dockerfiles, CI and runbooks added; load balancers/services/OpenSearch remain |
| Verification | Not started | Unit, integration, contract, e2e and browser checks |

## External Launch Blockers

These require owner-provided accounts or policy approval and cannot be invented
in code: Auth0 tenant values, Paystack credentials and settlement policy,
production DNS/hosts, AWS account, Google Maps credentials, Ghana tax/legal
rules, commission schedules, delivery zones/rates, refund authority limits,
Sentry/Grafana/PostHog projects and mobile store accounts.

## Next Agent Start Point

Finish the current in-progress row before starting another release area. Run the
required checks in `AGENTS.md`, record exact commands and outcomes here, and do
not mark a row complete until its tests and operational documentation exist.

## Verification Log

- 2026-07-20: `pnpm --filter` type checks passed for contracts, money,
  permissions, state machines, ledger and API client after building dependency
  declarations.
- 2026-07-20: 16 unit tests passed across contracts, money, permissions, state
  machines and ledger. API client had no tests at this checkpoint.
- 2026-07-20: database type-check and 15 schema tests passed; the six
  migration/seed/deferred-trigger integration tests also passed independently
  in PGlite. Docker was unavailable, so PostgreSQL 17 compose verification is
  still required in CI or another development environment.
- 2026-07-20: API foundation package reported 16 passing tests, lint,
  type-check, build and route smoke verification before PostgreSQL adapters were
  integrated. Re-run these checks after adapter integration.
