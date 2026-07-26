# NISTER Commerce Platform

The marketplace is an additive NISTER product and a separate deployment from
the production WISP. Its runtime code, database, authentication, payments and
operational controls are isolated under this directory.

## Applications

- `apps/storefront-web`: buyer storefront and account experience.
- `apps/vendor-web`: vendor onboarding and operations portal.
- `apps/admin-web`: platform administration and finance controls.
- `apps/api`: NestJS/Fastify modular-monolith API.
- `apps/worker`: BullMQ workers for outbox and asynchronous processing.

Mobile clients are tracked in the implementation ledger and will consume the
same generated API client and contracts.

## Local Setup

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d postgres redis minio opensearch
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Local ports:

- API and OpenAPI: `http://localhost:4100` and `/docs`
- Storefront: `http://localhost:4200`
- Vendor portal: `http://localhost:4201`
- Admin portal: `http://localhost:4202`

Development authentication is explicit and disabled when `NODE_ENV=production`.
Production requires Auth0 OIDC and real provider credentials.

## Status

Read [documentation/IMPLEMENTATION_STATUS.md](documentation/IMPLEMENTATION_STATUS.md)
before continuing work. It records verified work, current constraints and the
next implementation slice for future agents.
