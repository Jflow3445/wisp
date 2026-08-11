# Owner Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Release 1 Nister owner platform with public acquisition/SEO pages, lead-first property onboarding, phone-number owner auth, pending/approved owner dashboards, admin-controlled property/terms setup, and reconciliation-only revenue reporting.

**Architecture:** Public pages stay in the Next app under `nister-org`; authenticated owner and admin workflows stay in the PHP pay portal under `pay-portal`. Owner accounting is downstream reporting only: a cron/admin reconciliation worker scans applied purchases and writes allocation rows, while `pay-portal/purchase.php` remains untouched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript tests with `node:test` and Playwright, PHP 8, PDO/MySQL/MariaDB, existing SMS, admin CSRF, location, cron, and regression shell tests.

---

## Boundaries

- Do not modify `hotspot/*`, `nister-org/public/router-sync/*`, `api/hotspot/*`, router scripts, Apache/vhost files, or MikroTik deployment scripts for this feature.
- Do not modify `pay-portal/purchase.php` for owner accounting in Release 1.
- Keep owner auth in the separate `nister_owner` session.
- Keep owner pages read-only for network/router/RADIUS/payment/resident mutation.
- Use service request `rejected` or `lost` for business disqualification; owner identity statuses are only `pending`, `approved`, and `suspended`.
- Run `tests/regression/run.sh` after PHP/admin changes.

## File Structure

### Next Public Site

- Modify `nister-org/src/lib/content.ts`: central content, public links, lead form field definitions, SEO resources.
- Create `nister-org/src/lib/seo.ts`: canonical URL, OpenGraph, JSON-LD helpers.
- Modify `nister-org/src/components/shared/site-nav.tsx`: add public acquisition/resource nav links without weakening Get Online and Manage Access.
- Modify `nister-org/src/components/shared/site-footer.tsx`: add public acquisition/resource/footer links.
- Modify `nister-org/src/components/home/nister-wifi-home.tsx`: update homepage CTAs and content blocks.
- Modify `nister-org/src/app/globals.css`: responsive layout for public pages and forms.
- Create public route files:
  - `nister-org/src/app/for-hostels/page.tsx`
  - `nister-org/src/app/how-it-works/page.tsx`
  - `nister-org/src/app/plans/page.tsx`
  - `nister-org/src/app/request-installation/page.tsx`
  - `nister-org/src/app/resources/page.tsx`
  - `nister-org/src/app/resources/[slug]/page.tsx`
  - `nister-org/src/app/faq/page.tsx`
  - `nister-org/src/app/coverage/page.tsx`
  - `nister-org/src/app/about/page.tsx`
  - `nister-org/src/app/sitemap.ts`
  - `nister-org/src/app/robots.ts`
- Modify `nister-org/src/lib/__tests__/guardrails.test.ts`: content/link/SEO guardrails.
- Modify `nister-org/e2e/host-render.spec.ts`: route rendering and form assertions.

### Owner PHP Portal

- Create `pay-portal/lib/owner_schema.php`: additive owner schema bootstrap and schema capability checks.
- Create `pay-portal/lib/owner_auth.php`: `nister_owner` session boot, login/logout, CSRF, status gates, noindex header.
- Create `pay-portal/lib/owner_otp.php`: owner OTP creation, verification, rate limiting, SMS sending.
- Create `pay-portal/lib/property_leads.php`: lead validation, lead insert, lead lookup, lead-to-request conversion.
- Create `pay-portal/lib/property_requests.php`: service request CRUD, transition validation, owner/admin views.
- Create `pay-portal/lib/property_revenue.php`: properties, memberships, links, terms, summaries, allocation engine.
- Create `pay-portal/owner/lead.php`: public lead capture and OTP start page.
- Create `pay-portal/owner/register.php`: OTP verification, password creation/confirmation, lead conversion.
- Create `pay-portal/owner/login.php`: phone/password login.
- Create `pay-portal/owner/logout.php`: POST-only session destroy.
- Create `pay-portal/owner/dashboard.php`: pending/approved dashboard.
- Create `pay-portal/owner/requests.php`: owner request list/create/edit.
- Create `pay-portal/owner/revenue.php`: approved owner revenue report.
- Create `pay-portal/owner/transactions.php`: approved owner transaction list.
- Create `pay-portal/owner/api.php`: owner AJAX mutations.
- Create `pay-portal/assets/owner.css`: owner portal styling.

### Admin And Reconciliation

- Modify `pay-portal/admin/api.php`: require owner libraries and add owner/property/revenue cases.
- Modify `pay-portal/admin/index.php`: add Owner Platform admin section and JS render/actions.
- Create `pay-portal/cron/property_allocation_reconcile.php`: CLI/cron owner allocation reconciler.
- Create `systemd/nister-property-allocation-reconcile.service`: optional production timer service if deploy uses systemd.
- Create `systemd/nister-property-allocation-reconcile.timer`: optional production timer every few minutes.
- Modify `tests/regression/run.sh`: static and PHP assertions for owner boundaries.

---

### Task 1: Guardrail Tests First

**Files:**
- Modify: `tests/regression/run.sh`
- Modify: `nister-org/src/lib/__tests__/guardrails.test.ts`
- Modify: `nister-org/e2e/host-render.spec.ts`

- [ ] **Step 1: Add failing PHP/static regression assertions**

Add assertions in `tests/regression/run.sh` that fail until owner files exist and the forbidden path stays clean:

```bash
owner_schema_content="$(cat pay-portal/lib/owner_schema.php 2>/dev/null || true)"
owner_auth_content="$(cat pay-portal/lib/owner_auth.php 2>/dev/null || true)"
property_revenue_content="$(cat pay-portal/lib/property_revenue.php 2>/dev/null || true)"
owner_pages_content="$(cat pay-portal/owner/*.php 2>/dev/null || true)"
purchase_content="$(cat pay-portal/purchase.php)"

assert_contains "owner_schema_defines_leads" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_leads"
assert_contains "owner_schema_no_rejected_owner_status" "$owner_schema_content" "ENUM('pending','approved','suspended')"
assert_not_contains "owner_schema_never_defines_rejected_owner" "$owner_schema_content" "ENUM('pending','approved','rejected','suspended')"
assert_contains "owner_auth_uses_owner_session" "$owner_auth_content" "session_name('nister_owner')"
assert_contains "owner_pages_are_noindex" "$owner_auth_content$owner_pages_content" "noindex, nofollow"
assert_contains "property_revenue_has_reconciler_entrypoint" "$property_revenue_content" "property_allocation_reconcile"
assert_not_contains "purchase_has_no_owner_allocation_hook" "$purchase_content" "property_allocation"
assert_not_contains "purchase_has_no_owner_revenue_include" "$purchase_content" "property_revenue.php"
```

- [ ] **Step 2: Add failing Next guardrail tests**

In `nister-org/src/lib/__tests__/guardrails.test.ts`, assert:

```ts
assert.equal(EXTERNAL_LINKS.ownerLead, "https://pay.nister.org/owner/lead.php");
assert.deepEqual(leadFormFields.map((field) => field.name), [
  "contact_name",
  "contact_phone",
  "contact_whatsapp",
  "contact_email",
  "property_name",
  "country",
  "region",
  "town",
  "address",
  "digital_address",
  "google_maps_url",
  "nearby_campus",
  "number_of_buildings",
  "number_of_floors",
  "number_of_rooms",
  "estimated_residents",
  "current_occupancy",
  "has_wifi",
  "current_provider",
  "connection_type",
  "current_monthly_cost",
  "current_speed",
  "poor_coverage",
  "slow_internet",
  "downtime",
  "payment_problem",
  "user_management_problem",
  "shared_password_problem",
  "starting_from_scratch",
  "deployment_preference",
]);
```

Add tests that public SEO resources exist in content and do not include unsupported impact metrics.
Add assertions that public route/page source contains canonical metadata, OpenGraph metadata, Organization JSON-LD, BreadcrumbList JSON-LD where useful, and Article JSON-LD for resource articles.

- [ ] **Step 3: Add failing Playwright route/form tests**

Update `nister-org/e2e/host-render.spec.ts` to assert:

- `nister.org` homepage still renders Get Online and Manage Access.
- `/request-installation` has a form with `method="post"` and `action="https://pay.nister.org/owner/lead.php"`.
- The form includes every Release 1 lead field.
- `/resources`, one resource slug, `/faq`, `/coverage`, and `/about` render on `nister.org`.
- `wifi.nister.org` still renders the network guide and static CAPPORT/router-sync files.

- [ ] **Step 4: Run tests and verify failure**

Run:

```bash
cd nister-org && npm test
```

Expected: FAIL on missing `ownerLead`, `leadFormFields`, and SEO/resource exports.

Run:

```bash
cd nister-org && npm run test:e2e
```

Expected: FAIL on missing request-installation route/form and resource routes.

Run:

```bash
bash tests/regression/run.sh
```

Expected: FAIL on missing owner PHP files and assertions.

- [ ] **Step 5: Commit tests**

```bash
git add tests/regression/run.sh nister-org/src/lib/__tests__/guardrails.test.ts nister-org/e2e/host-render.spec.ts
git commit -m "test: lock owner platform release boundaries"
```

---

### Task 2: Public Acquisition And SEO/AEO Pages

**Files:**
- Modify: `nister-org/src/lib/content.ts`
- Create: `nister-org/src/lib/seo.ts`
- Modify: `nister-org/src/components/shared/site-nav.tsx`
- Modify: `nister-org/src/components/shared/site-footer.tsx`
- Modify: `nister-org/src/components/home/nister-wifi-home.tsx`
- Modify: `nister-org/src/app/globals.css`
- Create: all public route files listed in File Structure

- [ ] **Step 1: Implement content exports**

Add `EXTERNAL_LINKS.ownerLead`, `leadFormFields`, `publicRoutes`, `faqItems`, `coverageAreas`, and `resourceArticles` to `content.ts`. Use the exact Release 1 field names from Task 1 and keep money input name `current_monthly_cost` for the browser form.

- [ ] **Step 2: Implement SEO helpers**

In `seo.ts`, export helpers:

```ts
export const SITE_ORIGIN = "https://nister.org";
export function canonical(path: string): string;
export function organizationJsonLd(): Record<string, unknown>;
export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>): Record<string, unknown>;
export function articleJsonLd(article: ResourceArticle): Record<string, unknown>;
```

- [ ] **Step 3: Build public pages**

Create pages that render real content and link paths:

- `/for-hostels`: owner/operator value proposition.
- `/how-it-works`: deployment process and billing model explanation.
- `/plans`: owner-facing commercial models without unsupported live metrics.
- `/request-installation`: full lead form, ordinary POST to `EXTERNAL_LINKS.ownerLead`.
- `/resources`: list all resources.
- `/resources/[slug]`: render article content with Article JSON-LD.
- `/faq`, `/coverage`, `/about`: public acquisition support pages.

- [ ] **Step 4: Build sitemap and robots**

Add `sitemap.ts` for public routes/resources and `robots.ts` that allows public pages, disallows `/owner/` and `/admin/`, and allows OAI-SearchBot access to public pages.

- [ ] **Step 5: Run tests**

Run:

```bash
cd nister-org && npm test && npm run typecheck && npm run lint && npm run test:e2e
```

Expected: all pass.

- [ ] **Step 6: Commit public site**

```bash
git add nister-org/src
git commit -m "feat: add owner acquisition and seo pages"
```

---

### Task 3: Owner Schema And Lead Services

**Files:**
- Create: `pay-portal/lib/owner_schema.php`
- Create: `pay-portal/lib/property_leads.php`
- Modify: `tests/regression/run.sh`

- [ ] **Step 1: Add schema assertions**

Extend `tests/regression/run.sh` to assert owner schema contains:

- `property_leads`
- `property_owners`
- `property_owner_status_events`
- `owner_otp_challenges`
- `property_service_requests`
- `property_service_request_events`
- `properties`
- `property_memberships`
- `property_location_links`
- `property_financial_terms`
- `property_transaction_allocations`
- `property_allocation_attempts`
- `deployment_model`
- `billing_model`
- `setup_fee_cents`
- `recurring_fee_cents`
- expanded CRM statuses

- [ ] **Step 2: Implement additive schema bootstrap**

In `owner_schema.php`, implement:

```php
function owner_schema_table_exists(PDO $pdo, string $table): bool;
function owner_schema_column_exists(PDO $pdo, string $table, string $column): bool;
function owner_schema_bootstrap(PDO $pdo): void;
function owner_schema_require_purchase_location(PDO $pdo): array;
```

Use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN` helpers. Do not drop, rename, truncate, or require existing data migration beyond additive columns and indexes.
Implement the exact data model from the spec for every owner-platform table: required columns, enum values, indexes/unique keys, effective-window fields, foreign-key-compatible integer types, and UTC-compatible timestamp behavior. Where a table already exists, add missing columns/indexes without destructive rewrites.
`property_owner_status_events` must be created in the same bootstrap pass and must support immutable rows for `approve`, `suspend`, and `reactivate`.
`owner_schema_bootstrap()` must require/reuse `pay-portal/lib/location.php` and call `location_bootstrap()` before checking owner allocation setup, because that existing helper is responsible for adding `purchases.location_id`.

- [ ] **Step 3: Implement lead validation and creation**

In `property_leads.php`, implement:

```php
function property_lead_public_fields(): array;
function property_lead_normalize(array $in): array;
function property_lead_validate(array $lead): array;
function property_lead_create(PDO $pdo, array $in, array $server = []): array;
function property_lead_find(PDO $pdo, int $id): ?array;
function property_lead_mark_otp_pending(PDO $pdo, int $leadId): void;
```

Normalize Ghana phone numbers with `normalize_msisdn()`. Store `current_monthly_cost_cents` from decimal input using `round($amount * 100, 0, PHP_ROUND_HALF_UP)`.

- [ ] **Step 4: Run PHP checks**

Run:

```bash
php -l pay-portal/lib/owner_schema.php
php -l pay-portal/lib/property_leads.php
bash tests/regression/run.sh
```

Expected: syntax passes; regression advances to failures for auth/request files not yet implemented.

- [ ] **Step 5: Commit schema and leads**

```bash
git add pay-portal/lib/owner_schema.php pay-portal/lib/property_leads.php tests/regression/run.sh
git commit -m "feat: add owner schema and lead capture services"
```

---

### Task 4: Owner OTP, Auth, And Lead Conversion

**Files:**
- Create: `pay-portal/lib/owner_auth.php`
- Create: `pay-portal/lib/owner_otp.php`
- Create: `pay-portal/lib/property_requests.php`
- Create: `pay-portal/owner/lead.php`
- Create: `pay-portal/owner/register.php`
- Create: `pay-portal/owner/login.php`
- Create: `pay-portal/owner/logout.php`
- Create: `pay-portal/assets/owner.css`
- Modify: `tests/regression/run.sh`

- [ ] **Step 1: Add auth/request regression assertions**

Assert:

- `owner_auth.php` calls `session_name('nister_owner')`.
- owner login/register call `session_regenerate_id(true)`.
- owner logout destroys only the owner session on POST with owner CSRF.
- owner pages call a noindex helper.
- `property_requests.php` defines only owner statuses `pending`, `approved`, `suspended`.
- service request statuses include the full CRM list.

- [ ] **Step 2: Implement owner auth**

In `owner_auth.php`, implement boot and gate functions:

```php
function owner_boot(): array;
function owner_noindex_headers(): void;
function owner_csrf_token(bool $rotate = false): string;
function owner_verify_csrf(?string $provided): bool;
function owner_require_csrf_post(): void;
function owner_logged_in(): bool;
function owner_current(): ?array;
function owner_require_login(bool $json = false): void;
function owner_require_approved(bool $json = false): void;
function owner_do_login(string $rawMsisdn, string $password): bool;
function owner_logout(): void;
```

Session cookie checklist:

- cookie/session name is `nister_owner`;
- `SameSite=Lax`;
- `HttpOnly=true`;
- `Secure=true` when `HTTPS` is on or `X-Forwarded-Proto=https`;
- successful login/register calls `session_regenerate_id(true)`.

- [ ] **Step 3: Implement owner OTP**

In `owner_otp.php`, implement:

```php
function owner_otp_create(PDO $pdo, string $rawMsisdn, int $leadId, array $env, array $server = []): array;
function owner_otp_verify(PDO $pdo, string $rawMsisdn, string $otp): array;
```

Use `random_int`, `password_hash`, existing SMS settings/sender where possible, and the common rate limit helpers.

- [ ] **Step 4: Implement request conversion**

In `property_requests.php`, implement:

```php
function property_request_statuses(): array;
function property_request_allowed_transitions(): array;
function property_request_create_from_lead(PDO $pdo, int $ownerId, int $leadId): array;
function property_request_create_for_owner(PDO $pdo, int $ownerId, array $in): array;
function property_request_update_by_owner(PDO $pdo, int $ownerId, int $requestId, array $in): array;
function property_request_list_for_owner(PDO $pdo, int $ownerId): array;
function property_owner_convert_lead_after_otp(PDO $pdo, int $leadId, string $password, ?string $existingPassword = null): array;
```

Conversion must be transactional: create/update owner, create service request, update lead conversion fields, then start owner session.
It must implement the owner registration state matrix exactly:

- no owner row: create `pending` owner, require new password, convert lead to a `submitted` request;
- `pending`: verify existing password unless no hash exists, keep `pending`, convert lead to a new `submitted` request;
- `approved`: verify existing password, keep `approved`, convert lead to a new `submitted` request;
- `suspended`: do not convert the lead, do not change owner status, do not start an approved dashboard session, and show admin/support state.

It must never downgrade an approved owner, overwrite an existing password hash during public onboarding, revive a suspended owner, or create a rejected owner state.

- [ ] **Step 5: Implement public/auth pages**

Create `lead.php`, `register.php`, `login.php`, and `logout.php` with server-rendered forms, same-origin POST handling, clear errors, and no placeholders. `lead.php` must insert the lead before OTP and redirect/render the next OTP step with `lead_id`.

- [ ] **Step 6: Run checks**

Run:

```bash
php -l pay-portal/lib/owner_auth.php
php -l pay-portal/lib/owner_otp.php
php -l pay-portal/lib/property_requests.php
php -l pay-portal/owner/lead.php
php -l pay-portal/owner/register.php
php -l pay-portal/owner/login.php
php -l pay-portal/owner/logout.php
bash tests/regression/run.sh
```

Expected: syntax passes; regression advances to admin/revenue failures.

- [ ] **Step 7: Commit auth and conversion**

```bash
git add pay-portal/lib/owner_auth.php pay-portal/lib/owner_otp.php pay-portal/lib/property_requests.php pay-portal/owner pay-portal/assets/owner.css tests/regression/run.sh
git commit -m "feat: add owner phone onboarding"
```

---

### Task 5: Owner Dashboard And Request Management

**Files:**
- Create: `pay-portal/owner/dashboard.php`
- Create: `pay-portal/owner/requests.php`
- Create: `pay-portal/owner/api.php`
- Modify: `pay-portal/lib/property_requests.php`
- Modify: `pay-portal/assets/owner.css`
- Modify: `tests/regression/run.sh`

- [ ] **Step 1: Add owner dashboard assertions**

Assert:

- pending dashboard contains account status and request list.
- pending dashboard does not contain revenue/transaction/property detail blocks.
- approved dashboard contains "My Hostel", "Network online", "Connected Users", "Revenue This Month", "Your Share", and "Transactions".
- owner API requires CSRF for POST mutations.
- `profile_update` accepts only `display_name`.
- `request_update` accepts only owner-editable submitted-request fields from the spec and never accepts status, admin notes, owner id, property id, financial, link, or allocation fields.

- [ ] **Step 2: Implement owner pages**

`dashboard.php` should:

- call `owner_require_login()`;
- show pending-limited view for `pending`;
- block all owner views for `suspended`;
- show approved summary panels for `approved`.

`requests.php` should:

- allow pending/approved owners to create a new request;
- allow editing only while request status is `submitted`;
- show all request statuses read-only otherwise.

`api.php` should expose focused owner actions:

- `profile_update`
- `request_create`
- `request_update`

Allowed owner mutation fields:

- profile: `display_name`;
- submitted request: `property_name`, `country`, `region`, `town`, `address`, `digital_address`, `google_maps_url`, `nearby_campus`, `contact_name`, `contact_phone`, `contact_whatsapp`, `contact_email`, `number_of_buildings`, `number_of_floors`, `number_of_rooms`, `estimated_residents`, `current_occupancy`, `has_wifi`, `current_provider`, `connection_type`, `current_monthly_cost`, `current_speed`, `poor_coverage`, `slow_internet`, `downtime`, `payment_problem`, `user_management_problem`, `shared_password_problem`, `starting_from_scratch`, `deployment_preference`, and `notes`.

All other owner-supplied fields are ignored or rejected with a validation error before any database write.

- [ ] **Step 3: Run checks**

Run:

```bash
php -l pay-portal/owner/dashboard.php
php -l pay-portal/owner/requests.php
php -l pay-portal/owner/api.php
bash tests/regression/run.sh
```

Expected: syntax passes; regression advances to admin/revenue failures.

- [ ] **Step 4: Commit dashboard**

```bash
git add pay-portal/owner/dashboard.php pay-portal/owner/requests.php pay-portal/owner/api.php pay-portal/lib/property_requests.php pay-portal/assets/owner.css tests/regression/run.sh
git commit -m "feat: add owner dashboard and requests"
```

---

### Task 6: Admin Owner CRM And Property Setup

**Files:**
- Modify: `pay-portal/admin/api.php`
- Modify: `pay-portal/admin/index.php`
- Modify: `pay-portal/admin/login.php`
- Modify: `pay-portal/lib/admin_auth.php`
- Modify: `pay-portal/lib/property_requests.php`
- Create/modify: `pay-portal/lib/property_revenue.php`
- Modify: `tests/regression/run.sh`

- [ ] **Step 1: Add admin API/UI assertions**

Assert `admin/api.php` contains cases for:

- `property_lead_list`
- `property_lead_update`
- `owner_list`
- `owner_decision`
- `service_request_list`
- `service_request_decision`
- `property_save`
- `property_membership_save`
- `property_location_link_save`
- `property_terms_save`
- `property_allocations_run`
- `property_allocations_list`
- `service_request_convert_property`

Assert admin UI contains Owner Platform section IDs and controls.
Assert owner/admin noindex controls exist in `owner_auth.php`, owner pages, `admin_auth.php`, and `admin/login.php`.

- [ ] **Step 2: Implement admin owner/request functions**

In `property_requests.php`, add admin functions:

```php
function property_owner_list(PDO $pdo): array;
function property_owner_set_status(PDO $pdo, int $ownerId, string $newStatus, string $adminUser, string $note, string $ip = ''): array;
function property_lead_admin_list(PDO $pdo, array $filters = []): array;
function property_lead_admin_update(PDO $pdo, int $leadId, array $in, string $adminUser): array;
function property_request_admin_list(PDO $pdo, array $filters = []): array;
function property_request_admin_transition(PDO $pdo, int $requestId, string $newStatus, string $adminUser, string $note, string $ip = ''): array;
function property_request_convert_to_property(PDO $pdo, int $requestId, array $propertyInput, string $adminUser, string $note = '', string $ip = ''): array;
```

Validate transitions using the matrix in the spec.
`property_owner_set_status()` must insert one `property_owner_status_events` row for every successful `approve`, `suspend`, and `reactivate` transition. Invalid transitions return an error and do not write audit rows.
Lead admin actions must allow operations to view abandoned/unconverted leads and mark obvious duplicates, spam, closed, or contacted notes without requiring the lead to become an owner.
`property_request_convert_to_property()` must:

- require an eligible request status: `approved`, `agreement_signed`, `equipment_pending`, `installation_scheduled`, `installing`, `testing`, or `active`;
- create or update a `properties` row with `created_from_request_id`;
- copy location/building/business model fields from the request unless admin overrides them;
- add an active owner membership for the request owner;
- set `property_service_requests.converted_property_id`, `converted_at`, and `converted_by`;
- insert a `property_service_request_events` row with `action='convert_property'`, previous/new status equal to the current request status, admin identity, note, request IP, and created property id in the note/detail/metadata available to the implementation;
- be idempotent if the request already has `converted_property_id`.

- [ ] **Step 3: Implement property setup functions**

In `property_revenue.php`, implement:

```php
function property_save(PDO $pdo, array $in, string $adminUser): array;
function property_membership_save(PDO $pdo, array $in, string $adminUser): array;
function property_location_link_save(PDO $pdo, array $in, string $adminUser): array;
function property_terms_save(PDO $pdo, array $in, string $adminUser): array;
function property_list_for_admin(PDO $pdo): array;
```

Enforce non-overlapping active/current links and terms transactionally.
`property_terms_save()` must validate:

- `deployment_model` is `owner_funded` or `nister_funded`;
- `billing_model` is `resident_pays` or `property_pays`;
- `currency` is a three-letter uppercase code, default `GHS`;
- `owner_share_bps` is between `0` and `10000`;
- `setup_fee_cents` and `recurring_fee_cents` are zero or positive integers;
- `recurring_fee_period` is `none`, `monthly`, `term`, or `annual`;
- `recurring_fee_period='none'` requires `recurring_fee_cents=0`.

- [ ] **Step 4: Wire admin API and UI**

Keep `admin/api.php` additive: require the new libraries near existing requires, add new cases in the existing switch, and use existing admin CSRF. Add one `owners` section to `admin/index.php` with tables/forms for captured leads, pending owners, service requests, service-request-to-property conversion, properties, links, terms, allocations, and retry.
Add `admin_noindex_headers()` in `admin_auth.php`, call it from admin boot or admin pages, and ensure `admin/login.php` emits the same noindex control.

- [ ] **Step 5: Run checks**

Run:

```bash
php -l pay-portal/admin/api.php
php -l pay-portal/admin/index.php
php -l pay-portal/admin/login.php
php -l pay-portal/lib/admin_auth.php
php -l pay-portal/lib/property_revenue.php
bash tests/regression/run.sh
```

Expected: syntax passes; regression advances to allocation/owner revenue failures.

- [ ] **Step 6: Commit admin CRM**

```bash
git add pay-portal/admin/api.php pay-portal/admin/index.php pay-portal/admin/login.php pay-portal/lib/admin_auth.php pay-portal/lib/property_requests.php pay-portal/lib/property_revenue.php tests/regression/run.sh
git commit -m "feat: add owner admin crm"
```

---

### Task 7: Reconciliation-Only Revenue Allocation

**Files:**
- Modify: `pay-portal/lib/property_revenue.php`
- Create: `pay-portal/cron/property_allocation_reconcile.php`
- Create: `systemd/nister-property-allocation-reconcile.service`
- Create: `systemd/nister-property-allocation-reconcile.timer`
- Modify: `tests/regression/run.sh`

- [ ] **Step 1: Add allocation assertions**

Assert:

- reconciler uses `nister_require_cli_or_token($ENV)`;
- reconciler calls `property_allocation_reconcile`;
- allocation scans `purchases.status='applied'`;
- allocation uses `purchases.location_id`;
- allocation writes `property_transaction_allocations`;
- allocation writes `property_allocation_attempts`;
- allocation stores `msisdn_hash` and `msisdn_masked`;
- `purchase.php` still has no owner allocation hook.

- [ ] **Step 2: Implement allocation engine**

In `property_revenue.php`, implement:

```php
function property_allocation_reconcile(PDO $pdo, int $limit = 100): array;
function property_allocation_allocate_purchase(PDO $pdo, array $purchase): array;
function property_allocation_record_attempt(PDO $pdo, int $purchaseId, ?int $locationId, ?int $propertyId, string $status, string $reason, string $detail = '', ?int $allocationId = null): void;
function property_revenue_summary_for_owner(PDO $pdo, int $ownerId): array;
function property_transactions_for_owner(PDO $pdo, int $ownerId, array $filters = []): array;
```

Use `activated_at` first, then `created_at`, then attempt time for legacy rows. Use `intdiv($grossCents * $ownerShareBps, 10000)` and set Nister amount to the exact remainder.

Allocation failure/skipped rules:

- `missing_purchase_location`: purchase has no usable `location_id`;
- `missing_purchase_amount`: no usable `price_cents` or legacy numeric `price`;
- `missing_property_link`: no non-void property/location link effective at purchase time;
- `ambiguous_property_link`: more than one non-void link effective at purchase time;
- `missing_financial_terms`: no non-void financial term effective at purchase time;
- `ambiguous_financial_terms`: more than one non-void term effective at purchase time;
- `setup_error`: required schema, especially `purchases.location_id`, is missing after bootstrap;
- `unexpected_error`: caught allocation exception;
- `zero_gross_amount`: skipped, not failed;
- `purchase_not_applied`: skipped, not failed;
- `existing_allocation`: skipped when an allocated row already exists and the purchase is still applied.

Attempt rows are upserted by `purchase_id` with incremented `attempt_count` and updated `last_attempt_at`. A later successful allocation creates `property_transaction_allocations`, marks the attempt `resolved`, and stores `resolved_allocation_id`.
If a purchase allocation exists and the purchase is later no longer `applied`, reconciliation marks the allocation `void` and records a skipped/resolved audit outcome; it never triggers an owner payout.

- [ ] **Step 3: Implement cron entrypoint**

`property_allocation_reconcile.php` should bootstrap env, require CLI/token, call `owner_schema_bootstrap($PDO)`, run reconciliation, output JSON, and exit nonzero only for setup/programming errors that should alert operations.
Because `owner_schema_bootstrap($PDO)` calls `location_bootstrap()`, the reconciler must attempt to add/reuse `purchases.location_id` before returning `setup_error`.

- [ ] **Step 4: Add optional systemd timer**

Use existing systemd style:

```ini
[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
AccuracySec=15s
Persistent=true
```

Service `ExecStart` must be `/usr/bin/php /srv/nister-wisp-repo/pay-portal/cron/property_allocation_reconcile.php`.

- [ ] **Step 5: Run checks**

Run:

```bash
php -l pay-portal/lib/property_revenue.php
php -l pay-portal/cron/property_allocation_reconcile.php
bash tests/regression/run.sh
```

Expected: all PHP/static regression tests pass or only owner revenue page assertions remain.

- [ ] **Step 6: Commit reconciliation**

```bash
git add pay-portal/lib/property_revenue.php pay-portal/cron/property_allocation_reconcile.php systemd/nister-property-allocation-reconcile.service systemd/nister-property-allocation-reconcile.timer tests/regression/run.sh
git commit -m "feat: reconcile owner revenue allocations"
```

---

### Task 8: Approved Owner Revenue And Transactions

**Files:**
- Create: `pay-portal/owner/revenue.php`
- Create: `pay-portal/owner/transactions.php`
- Modify: `pay-portal/owner/dashboard.php`
- Modify: `pay-portal/owner/api.php`
- Modify: `pay-portal/assets/owner.css`
- Modify: `tests/regression/run.sh`

- [ ] **Step 1: Add owner reporting assertions**

Assert approved owner pages:

- include "Revenue This Month", "Your Share", and "Transactions";
- use `property_revenue_summary_for_owner`;
- use `property_transactions_for_owner`;
- never expose raw resident MSISDN.

- [ ] **Step 2: Implement approved-only reporting pages**

`revenue.php` should render monthly gross, owner share, Nister share, property filters, and term metadata. `transactions.php` should render date, property, masked resident, plan, gross, owner amount, and status.

- [ ] **Step 3: Update dashboard summary**

Use the same read functions from `property_revenue.php`. Pending owners see only requests and status. Suspended owners see a blocked account message.

- [ ] **Step 4: Run checks**

Run:

```bash
php -l pay-portal/owner/revenue.php
php -l pay-portal/owner/transactions.php
php -l pay-portal/owner/dashboard.php
bash tests/regression/run.sh
```

Expected: all PHP/static regression tests pass.

- [ ] **Step 5: Commit reporting**

```bash
git add pay-portal/owner/revenue.php pay-portal/owner/transactions.php pay-portal/owner/dashboard.php pay-portal/owner/api.php pay-portal/assets/owner.css tests/regression/run.sh
git commit -m "feat: add owner revenue reporting"
```

---

### Task 9: Full Verification And Deploy

**Files:**
- Verify all changed files.
- Deploy changed `nister-org`, `pay-portal`, `tests/regression`, and optional `systemd` files.

- [ ] **Step 1: Run local verification**

Run:

```bash
git diff --check
cd nister-org && npm test && npm run typecheck && npm run lint && npm run test:e2e && npm run build
cd ..
bash tests/regression/run.sh
```

Expected: all commands pass.

- [ ] **Step 2: Syntax check all new PHP files**

Run:

```powershell
Get-ChildItem -Path pay-portal\lib,pay-portal\owner,pay-portal\cron -Filter *.php -Recurse |
  Where-Object { $_.FullName -match 'owner|property_|property_allocation' } |
  ForEach-Object { php -l $_.FullName }
```

Expected: every file reports `No syntax errors detected`.

- [ ] **Step 3: Prepare deploy artifact**

Build Next standalone:

```bash
cd nister-org && npm run build && npm run standalone:prepare
```

Create a file list from `git diff --name-only main...HEAD` and include only changed public site, pay portal, tests, and systemd files. Exclude captive/router files unless the diff proves none were touched.
Before building the file list, run `git status --short` and ensure every intended implementation change is committed or deliberately included in the deploy copy set.

- [ ] **Step 4: Deploy to VPS**

Use the existing VPS path `/srv/nister-wisp-repo`:

```bash
bash ops/vps_exec.sh 'mkdir -p /root/nister_deploy_backups/owner_platform_20260811'
```

Copy changed files to `/srv/nister-wisp-repo`, preserving paths and backing up overwritten remote files first. If systemd timer files are deployed, copy them to `/etc/systemd/system/`, run `systemctl daemon-reload`, enable/start `nister-property-allocation-reconcile.timer`, and check `systemctl status --no-pager nister-property-allocation-reconcile.timer`.

- [ ] **Step 5: Run remote verification**

Run targeted remote checks:

```bash
bash ops/vps_exec.sh 'cd /srv/nister-wisp-repo && php -l pay-portal/owner/lead.php && php -l pay-portal/cron/property_allocation_reconcile.php'
bash ops/vps_exec.sh 'cd /srv/nister-wisp-repo && bash tests/regression/run.sh'
```

Then verify live HTTP:

```bash
curl -I https://nister.org/request-installation
curl -I https://nister.org/resources
curl -I https://nister.org/sitemap.xml
curl -I https://nister.org/robots.txt
curl -I https://pay.nister.org/owner/login.php
curl -I https://pay.nister.org/admin/login.php
curl -I https://wifi.nister.org/api.json
curl -I https://wifi.nister.org/router-sync/status.html
```

Expected:

- public Nister pages return 200;
- owner/admin pages include `X-Robots-Tag: noindex, nofollow`;
- wifi CAPPORT/router-sync remain unchanged;
- admin stats unauthenticated still returns auth JSON rather than a server error.

- [ ] **Step 6: Commit deploy notes if needed**

If deploy changes any repo-managed systemd/service docs, commit them:

```bash
git status --short
git add systemd docs/superpowers/plans/2026-08-11-owner-platform-implementation.md
git commit -m "docs: record owner platform deployment plan"
```
