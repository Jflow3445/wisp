# Permission Model

Users may hold buyer, vendor, driver and staff relationships at the same time.
There is no `user_type` switch. A request is authorized only when all of the
following pass:

1. The OIDC token is valid for issuer, audience, expiry, type and subject.
2. The internal user exists and is `ACTIVE` without a risk restriction that
   blocks the action.
3. The user holds the exact named permission.
4. The grant scope matches the resource: global, country, region, vendor, store,
   self or assigned record.
5. Sensitive actions satisfy reason, evidence, reauthentication/MFA, approval
   limit and separation-of-duty policy where applicable.

Initial permission families are `buyer.*`, `vendor.*`, `driver.*` and `admin.*`.
Vendor and store IDs are always resolved from server-side memberships. Client
route parameters never establish scope.

The reusable evaluator lives in `packages/permissions`. Database grants,
membership checks and API guards must all use the same semantics. Every denied
cross-tenant attempt and every allowed sensitive action writes an audit event.
