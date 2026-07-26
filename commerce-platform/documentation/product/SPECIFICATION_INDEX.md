# Specification Index

The marketplace is governed by four documents supplied on 2026-07-20. Keep the
hashes below with any archived copy so later revisions cannot silently change a
financial or operational contract.

| Document | SHA-256 |
| --- | --- |
| API and Database Contract.docx | `5e2bd7e29d5997e54794431eb433c220ad56698e3e7486b27fd69536647a0903` |
| Complete Multi-Vendor Ecommerce Platform Specification.docx | `86c46934f87f44102e80ae561a7762e4936d3a47a6b4312df082c3f2906b7dfb` |
| Complete Screen-by-Screen Requirements Specification.docx | `1153eb2e59c09e0f35a96bc73f276a8511ca73d767df6cd9d2d4833207434a5a` |
| State-Machine and Financial-Ledger Specification.docx | `2786a4d55ab3e2c4715244b6ae63c1936465967ce3262fdc4098418e0688c84a` |

## Fixed Decisions

- Initial country/currency: Ghana and GHS, with configuration boundaries for
  later countries.
- API: REST `/api/v1`, OpenAPI 3.1, webhooks `/webhooks/v1`.
- Applications: storefront web, vendor web, admin web, and three separately
  distributed Expo mobile apps for buyers, vendors and drivers.
- Backend: TypeScript, NestJS/Fastify modular monolith, PostgreSQL/Drizzle,
  Redis/BullMQ, OpenSearch and S3.
- Providers: Auth0, Paystack and Google Maps behind replaceable adapters.
- Platform edge/operations: Cloudflare, AWS ECS/RDS/ElastiCache/S3/OpenSearch,
  Sentry, OpenTelemetry, Grafana-compatible monitoring and PostHog.
- Correctness: named transitions, optimistic versions, idempotency, transactional
  outbox, verified payment events, immutable inventory/financial journals.

## Release Sequence

Release 1 delivers auth/RBAC, vendors, catalogue, inventory, storefront, cart,
checkout, Paystack, orders, vendor/admin portals, basic platform delivery and
the financial ledger. Release 2 delivers the three mobile apps, push, driver
tracking/proof, dispatch and COD reconciliation. Release 3 delivers advanced
promotions, returns/disputes, automated payouts, fraud/search/reporting,
recommendations, analytics and third-party logistics.

## Decisions Requiring Written Approval

- Marketplace name and public/API/portal hostnames. `api.nister.org` remains
  WISP-only and is unavailable to this platform.
- Merchant-of-record model, guest checkout, Paystack split/settlement strategy,
  payout channels/schedules/reserves and dual-approval limits.
- Tax treatment, commission precedence, promotion funding/stacking, rounding,
  weighted-product pricing and delivery-fee allocation/refund policy.
- Delivery zones/rates/consolidation, COD eligibility and cash limits, failed
  delivery fees, cancellation windows, evidence rules and return logistics.
- Ghana legal/accounting approval, KYC/KYB, privacy/retention, driver-location
  sampling and fraud appeals.
- Some ledger templates reference accounts absent from the supplied chart:
  `SPONSOR_RECEIVABLE`, `CANCELLATION_FEE_REVENUE`,
  `PAYOUT_FEE_RECOVERY_REVENUE`, `CASH_OVERAGE_SUSPENSE`,
  `DRIVER_WAITING_COMPENSATION_RECOVERY` and optional `PROVIDER_FEE_EXPENSE`.
  These must be ratified before those templates are enabled.

## Screen Scope

The screen document contains 355 unique screen IDs: 65 public/buyer web, 63
buyer mobile, 68 vendor web, 27 vendor mobile, 54 driver mobile, 69 admin and 9
shared system screens. Only 19 routes are explicit. Missing routes and mobile
deep links must be added to the API/client contract as each release is planned;
they must not be invented inconsistently inside individual applications.
