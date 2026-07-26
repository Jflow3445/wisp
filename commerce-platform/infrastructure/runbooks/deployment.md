# Deployment And Rollback

1. Confirm CI has passed type, unit, integration, contract, migration and browser
   checks for the exact commit.
2. Back up PostgreSQL and record the restore point. Verify the previous image
   digests remain available.
3. Review the migration for locks, table rewrites and backward compatibility.
   Use expand/migrate/contract across separate releases.
4. Deploy workers that understand both old and new event shapes, then the API,
   then web clients. Mobile clients must remain compatible with the supported API
   window.
5. Run smoke tests for authentication, catalogue, checkout status, payment
   webhook receipt, vendor order visibility, admin audit and queue health. Never
   send a real charge merely to prove a deployment.
6. Monitor errors, p95 latency, database saturation, queue lag, provider errors,
   unbalanced-journal alerts and reconciliation mismatches.

Rollback application images when code health fails. Do not blindly reverse a
database migration that has accepted production writes. Use a forward repair or
the documented restore procedure after declaring an incident.
