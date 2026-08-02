# Marketplace Implementation Status

Last updated: 2026-08-02

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

## Current Checkpoint

The marketplace is implemented as an isolated additive workspace under
`commerce-platform/`. Current uncommitted work is commerce-only; a manual
boundary check with `git diff --name-only -- . ':!commerce-platform'` returned
no paths on 2026-08-02.

New in this checkpoint:

- Driver Release 2 backend slice added:
  - `0000_supreme_millenium_guard.sql` baseline migration is now visible to
    git, and `0001_luxuriant_spot.sql` plus its Drizzle snapshot were added.
  - Driver profiles, documents, vehicles, shifts, locations, payout accounts,
    delivery offers, cash transactions, safety incidents and emergency events.
  - Canonical `driver_id` and `vehicle_id` dimensions on deliveries.
  - `driver_id` dimension on ledger entries for future driver balance
    reconstruction.
  - `DRIVER` role plus contract-named driver permission seeds.
  - PostgreSQL repository for home, shifts, atomic offer acceptance/rejection,
    active delivery reads, named delivery transitions, location batch dedupe,
    COD cash records, cash summaries, earnings summaries, safety incidents and
    emergencies.
  - Nest `DriverModule` exposing `/api/v1/driver/...` operational endpoints.
  - API and PostgreSQL integration tests for idempotent offer acceptance,
    explicit delivery transitions, offline location dedupe and COD cash
    liability.
- API Nest DI class dependencies are explicitly annotated for the `tsx` dev
  runtime so local previews start with the same wiring validated by `tsc`.
- Buyer, vendor and driver Expo mobile apps are present and build for
  iOS/Android/web. They remain demo/development client layers until production
  Auth0, push, background location and store-release work is finished.
- Storefront demo-mode production fixture and Playwright selectors were
  stabilised in the previous checkpoint and remain passing.

## Delivery Status

| Release area | Status | Evidence / next action |
| --- | --- | --- |
| WISP isolation | Complete | Marketplace work remains under `commerce-platform/`; production WISP paths were not modified by this checkpoint |
| Monorepo foundation | Complete | Workspace, packages, apps, Dockerfiles, CI-oriented scripts, ADRs and local services exist |
| Shared contracts and validation | In progress | API envelopes, enums, Ghana address/cart/checkout validation and driver status alignment exist; generated OpenAPI/client workflow still required |
| Money and permission foundations | Complete | Exact bigint arithmetic, scoped auth guard, seeded driver permissions and permission package tests pass |
| State-machine foundation | In progress | Checkout/payment/vendor/product/order/delivery and extended machines exist; remaining actor/guard policies and full transition coverage remain |
| Financial-ledger foundation | In progress | Chart, immutable posting/reversal constraints and core templates exist; full posting services for delivery, COD, payout, refund and driver balances remain |
| PostgreSQL schema and migrations | In progress | 57 tables across `0000` and `0001`, PGlite migrations and repository integration tests pass; returns/disputes/payout batches/advanced tables remain |
| Auth0 and RBAC adapter | In progress | Development/Auth0 boundary, OIDC validation and scoped API guard exist; production tenant configuration and internal user mapping policy remain external blockers |
| Catalogue and inventory | In progress | Catalogue API, inventory projections, immutable adjustment movement and tests exist; import workflow and broad concurrency/authorization tests remain |
| Cart and checkout | In progress | Multi-vendor cart, checkout reservation and payment start path exist; full delivery option, coupon, COD and review flows remain |
| Paystack and ledger | In progress | Paystack init/verified event path, webhook dedupe and payment capture journal exist; settlement, reconciliation and refund/payout postings remain |
| Orders and vendor fulfilment | In progress | Parent/vendor order creation and vendor transition API exist; parent derived status and full fulfilment side effects remain |
| Driver and delivery operations | In progress | Driver operational DB/API slice, atomic offer acceptance, explicit delivery transitions, location dedupe and COD cash record tests pass; dispatch worker, onboarding/admin review, proof verification, full ledger postings and payouts remain |
| Storefront web | In progress | Public/product/cart/checkout/account routes and e2e suite pass in demo mode; production API contract gaps remain |
| Vendor portal | In progress | Dashboard, catalogue, inventory, order and finance surfaces and e2e suite pass; production API adapters still need generated-client alignment |
| Admin portal | In progress | Moderation, orders, payments, ledger, reconciliation and audit surfaces and e2e suite pass; driver admin and deeper finance operations remain |
| Background worker | In progress | Queue taxonomy, stable job IDs and outbox dispatcher exist; domain processors and persistent queue integration remain |
| Mobile apps | In progress | Buyer, vendor and driver Expo apps build and have focused tests; production auth/push/offline upload/background location/store release remain |
| Advanced marketplace | Deferred to Release 3 | Promotions, returns, disputes, automated payouts, fraud, chargebacks and advanced reporting remain |
| Infrastructure as code | In progress | VPC, Aurora, Redis, S3, ECS/ECR/secrets baseline, Dockerfiles, CI and runbooks exist; load balancers/services/OpenSearch remain |
| Verification | Current checkpoint complete | Required commerce checks passed on 2026-08-02; see verification log |

## Known Gaps

- Web and mobile production API adapters are not yet generated from OpenAPI and
  still contain demo/development assumptions in some areas.
- Buyer/vendor/storefront production adapters need a contract pass for canonical
  `/api/v1` paths, supported endpoint coverage and fail-closed behavior where
  backend features are not implemented.
- Driver onboarding APIs and admin driver review APIs are not implemented yet.
- Driver proof validation is structural only; configured OTP/signature/photo
  verification and file upload scanning remain.
- Delivery completion records COD cash liability, but full
  `COD_DELIVERY_COMPLETED_V1` ledger posting and driver payable updates remain.
- Driver payouts are intentionally disabled with `PAYOUT_NOT_ELIGIBLE` until
  ledger-backed eligibility, payout accounts and approval workflow are built.
- Dispatch assignment worker and geographic matching remain to be implemented.

## External Launch Blockers

These require owner-provided accounts or policy approval and cannot be invented
in code: Auth0 tenant values, Paystack credentials and settlement policy,
production DNS/hosts, AWS account, Google Maps credentials, Ghana tax/legal
rules, commission schedules, delivery zones/rates, refund authority limits,
Sentry/Grafana/PostHog projects, push notification credentials and mobile store
accounts.

## Next Agent Start Point

Start with production contract alignment rather than more demo UI:

1. Generate or hand-maintain the OpenAPI 3.1 document from the Nest controllers.
2. Replace buyer/vendor/storefront/mobile handwritten adapters with generated
   clients or fail-closed contract wrappers.
3. Implement driver onboarding/admin review plus proof/file upload support.
4. Add ledger-backed delivery completion and COD postings before enabling driver
   payouts.
5. Add dispatch worker persistence and assignment policies.

Do not mark an area complete until its tests, API contract, migrations and
operational documentation exist.

## Verification Log

- 2026-08-02: `pnpm --filter @nister/database typecheck` passed.
- 2026-08-02: `pnpm --filter @nister/database build` passed.
- 2026-08-02: `pnpm db:generate` generated `0001_luxuriant_spot.sql`.
- 2026-08-02: `pnpm --filter @nister/api typecheck` passed after rebuilding database declarations.
- 2026-08-02: `pnpm --filter @nister/api test` passed: 8 files, 20 tests.
- 2026-08-02: `pnpm --filter @nister/database test` passed: 3 files, 17 tests.
- 2026-08-02: `pnpm --filter @nister/database test:integration` passed: 1 file, 6 tests.
- 2026-08-02: `pnpm lint` passed: 21/21 Turbo tasks. Expo lint reported the existing local Node warning: v20.11.0 is unsupported, required `>=20.19.4`.
- 2026-08-02: `pnpm typecheck` passed: 21/21 Turbo tasks.
- 2026-08-02: `pnpm test` passed: 21/21 Turbo tasks, 81 tests plus API client `passWithNoTests`.
- 2026-08-02: `pnpm test:integration` passed: 9/9 Turbo tasks, including database migrations, vendor/admin integration tests and worker tests.
- 2026-08-02: `pnpm build` passed: 16/16 Turbo tasks. Expo mobile exports still log the existing Node warning and `Something prevented Expo from exiting, forcefully exiting now`, but exited 0.
- 2026-08-02: First concurrent `pnpm test:e2e` attempt failed because storefront Playwright webServer timed out after 120000 ms while `pnpm build` was also exporting Expo bundles. Vendor/admin e2e had passed in that attempt.
- 2026-08-02: Clean rerun of `pnpm test:e2e` passed: 20/20 Turbo tasks. Storefront 6 tests, vendor 8 tests, admin 8 tests and worker 2 tests passed.
- 2026-08-02: `pnpm check:wisp-boundary` failed because this branch already contains protected WISP-path changes relative to `origin/main` (`api/`, `hotspot/`, `pay-portal/`, `ops/`, `systemd/`, regression tests). This checkpoint did not add uncommitted WISP-path changes; manual non-commerce diff was empty.
- 2026-08-02: After the API runtime DI fix, `pnpm --filter @nister/api typecheck`, `pnpm --filter @nister/api test` and `pnpm --filter @nister/api build` passed.
- 2026-08-02: Local preview smoke checks passed: `GET /health/ready`, `HEAD /` on storefront/vendor/admin, and authenticated `GET /api/v1/driver/home`.

## Historical Notes

- 2026-07-20: Initial marketplace foundation, contracts, state machines,
  database schema, API foundation and ADRs were created.
- 2026-08-01: Buyer, vendor and driver Expo client/demo layers were added and
  web visual/e2e checks were stabilised.
