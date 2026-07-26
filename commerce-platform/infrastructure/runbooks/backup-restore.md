# Backup And Restore

- Production PostgreSQL uses point-in-time recovery with at least 35 days of
  retained backups. Object storage uses versioning and lifecycle policies agreed
  with privacy/legal owners. Redis is not a source of truth.
- Run a restore exercise at least quarterly into an isolated account/network.
- After restore, verify migration version, row counts, recent orders, payment
  inbox uniqueness, inventory totals, journal balance by currency, vendor/driver
  liability reconstruction and object references.
- Rebuild OpenSearch and analytics projections from PostgreSQL/outbox data.
- RPO target is five minutes and RTO target is one hour for core commerce.

Never restore marketplace data into WISP databases or hosts.
