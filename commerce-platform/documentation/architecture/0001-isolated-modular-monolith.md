# ADR 0001: Isolated Marketplace Modular Monolith

Status: accepted

## Context

The repository already contains a production WISP service. The marketplace
specification requires a broad commerce domain, different payment semantics and
separate operational data. Sharing runtime modules or databases would create an
unacceptable regression and accounting risk.

## Decision

Build the marketplace in `commerce-platform/` as a pnpm/Turborepo monorepo. Use
separately deployed web applications, one NestJS/Fastify modular-monolith API,
one worker process, PostgreSQL, Redis/BullMQ, object storage and OpenSearch.

The marketplace may link to the WISP brand surface, but it may not import WISP
runtime code, reuse the hotspot API contract, or share the WISP payment ledger.

Business modules communicate through explicit services and contracts. Slow
side effects use a transactional outbox. Modules remain separable if scale later
justifies extracting a service.

## Consequences

- WISP deployment and behavior remain unchanged.
- Marketplace failures cannot corrupt WISP balances or access state.
- Infrastructure cost is higher than adding routes to the existing app, but
  ownership, audit and rollback boundaries are clear.
- Cross-brand identity can be integrated later through OIDC without coupling
  application databases.
