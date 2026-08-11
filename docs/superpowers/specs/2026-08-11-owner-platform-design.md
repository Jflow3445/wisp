# Nister Owner Platform Design

Date: 2026-08-11
Branch: feature/owner-platform

## Goal

Extend Nister with a public property acquisition layer and an owner portal while preserving the existing WISP captive portal, resident access, payment, router, RADIUS, and admin behavior.

The first release includes:

- Public acquisition pages on `nister.org`.
- Phone-number based owner registration with OTP verification.
- Pending owner accounts that can submit and track service requests.
- Admin approval before full owner dashboard access.
- Approved owner dashboard on `pay.nister.org/owner/*`.
- Admin-controlled property/location linking and financial terms.
- Read-only owner revenue and transaction reporting from existing confirmed resident purchases.

## Non-Goals

- Do not replace resident login, wallet, package purchase, payment verification, captive portal, or router authorization.
- Do not move existing `pay.nister.org` resident/admin functionality into the Next app.
- Do not add owner controls for MikroTik, firewall, router credentials, plan mutation, user kicks, or payment approval.
- Do not add owner-triggered payouts in the first release.
- Do not make property records mandatory for existing deployments.
- Do not put revenue-sharing logic in captive portal files or resident access authorization.

## Approved Product Decisions

- Use Approach A: public acquisition pages in `nister-org`; authenticated owner portal in the PHP pay portal.
- Owner accounts use the same phone-number identity model as the existing system.
- Owner registration requires OTP verification.
- Newly registered owners remain `pending` until admin approval.
- Pending owners may submit service requests and view request status.
- Full owner dashboard access starts only after admin approval.
- Revenue and transactions are included immediately, but read-only.
- Revenue uses admin-controlled financial terms.
- No owner-triggered payouts until reporting is proven.
- `/request-installation` starts the service request flow publicly, then hands off by ordinary browser navigation to `pay.nister.org/owner/register.php`. OTP, owner account creation, login, and service request creation happen entirely on `pay.nister.org` to avoid cross-origin auth/CORS complexity in the public Next app.

## Existing Production Dependency Map

### Host Boundaries

`api.nister.org` is the canonical hotspot API host. It owns signup, OTP, password reset/change, autopost, and hotspot status contracts. It must not serve public/captive HTML for `/`, `/index.html`, `/login.html`, `/status.html`, or `/api.json`.

`pay.nister.org` owns resident wallet, plan purchase, payment/config surfaces, and admin. It is not a captive API fallback.

`wifi.nister.org` owns the public Wi-Fi guide, public CAPPORT `/api.json`, and static `/router-sync/*` source files. Router-hosted captive pages are still separate from public `wifi.nister.org` routes even when users see the same hostname inside the hotspot.

`nister.org` owns the public website and new marketing/acquisition routes.

### Existing Get Online Route

- `https://wifi.nister.org/`
- `https://wifi.nister.org/api.json`
- `https://wifi.nister.org/router-sync/*`
- Next redirects for legacy public hotspot paths:
  - `/login` -> `https://pay.nister.org/`
  - `/login.html` -> `https://pay.nister.org/`
  - `/pay.html` -> `https://pay.nister.org/`
  - `/signup.html` -> `/`
  - `/reset-password.html` -> `/`
  - `/change-password.html` -> `/`
  - `/status.html` -> `/`

### Existing Manage Access Route

- `https://pay.nister.org/`
- `/login.php`
- `/portal.php`
- `/logout.php`
- `/me.php`
- `/plans.php`
- `/purchase.php`
- `/deposit_request.php`
- `/verify.php`
- `/auto_renew.php`
- `/location.php`
- `/status.php`
- `/topup_config.php`

### Captive Portal Routes And Files

Router-hosted local files under `flash/hotspot` are sourced from:

- `hotspot/login.html`
- `hotspot/signup.html`
- `hotspot/change-password.html`
- `hotspot/reset-password.html`
- `hotspot/status.html`
- `hotspot/pay.html`
- `hotspot/logout.html`
- `hotspot/alogin.html`
- `hotspot/rlogin.html`
- `hotspot/redirect.html`
- `hotspot/registration-success.html`
- `hotspot/error.html`
- `hotspot/config.js`
- `hotspot/common.css`
- `hotspot/md5.js`
- `hotspot/api.json`

Public router-sync copies live under:

- `nister-org/public/router-sync/*`

These are frozen for property-owner work unless an explicit captive change is requested.

### Payment Routes

- `/deposit_request.php`
- `/verify.php`
- `/purchase.php`
- `/paystack_initialize.php`
- `/paystack_callback.php`
- `/paystack_verify.php`
- `/paystack_webhook.php`
- `/cron/paystack_reconcile.php`
- Legacy manual admin payment endpoints:
  - `/admin_deposits.php`
  - `/admin_list_deposits.php`
  - `/admin_mark_payment.php`
  - `/admin_update_deposit.php`

Payment authority remains:

- Paystack/MoMo Pay credits only after Paystack verification reports success.
- Manual MoMo deposits stay admin-reviewed.
- Existing resident access activation remains in `purchase.php` after wallet debit and plan apply.

### Router And MikroTik Endpoints

- Router-hosted captive pages under `flash/hotspot`.
- `/hotspot/otp_send.php`
- `/hotspot/otp_verify.php`
- `/hotspot/signup.php`
- `/hotspot/change_password.php`
- `/hotspot/reset_password.php`
- `/hotspot/autopost.php`
- `/hotspot-api/status.php`
- System scripts:
  - `/usr/local/sbin/nister_account_queue_sync.sh`
  - `/usr/local/sbin/nister_quota_enforce.sh`
  - `/usr/local/sbin/nister_radacct_cleanup.sh`
  - `/usr/local/sbin/nister_router_catchup.sh`
  - `/usr/local/sbin/nister_tunnel_watchdog.sh`
  - `/usr/local/sbin/nister_mikrotik_guard.sh`

Winbox remains `10.10.20.2:8291` through the VPS/L2TP tunnel from `10.99.99.1`.

### Authentication Architecture

Resident auth:

- PHP session name: `nister_user`.
- Login route: `/login.php`.
- Account key: normalized MSISDN.
- Passwords are read from FreeRADIUS `radcheck`.
- Successful login regenerates session id and captures location context.

Admin auth:

- PHP session name: `nister_admin`.
- Login route: `/admin/login.php`.
- Credentials: `APP_ADMIN_USER` and `APP_ADMIN_PASS_HASH`.
- Mutating admin API calls require CSRF.

Owner auth will be separate:

- PHP session name: `nister_owner`.
- Routes under `/owner/*`.
- Account key: normalized MSISDN.
- OTP verified before account creation.
- Owner password hash stored in new owner table, not in RADIUS.

### Existing Admin Architecture

- `/admin/login.php`
- `/admin/`
- `/admin/api.php?fn=<action>`

Existing admin API actions include settings, health, alerts, locations, NAS/discovery, plans, user lookup, user reset, user purge, force expire/exhaust/kick, quota/rate/group/address-list controls, pending payment review, wallet credit/debit/promo, apply plan, and disconnect user.

Owner admin additions should extend this existing admin UI/API rather than replacing it.

### Existing Tables And Models Involved

RADIUS tables:

- `radcheck`
- `radreply`
- `radusergroup`
- `radgroupreply`
- `radgroupcheck`
- `radacct`

Application tables:

- `app_settings`
- `accounts`
- `ledger`
- `payments`
- `purchases`
- `auto_renew_settings`
- `admin_alerts`
- `health_samples`
- `health_events`
- `locations`
- `location_nas`
- `location_router_discovery`
- `location_plans`
- `user_location_profiles`
- `referral_profiles`
- `referral_links`
- `referral_rewards`
- `signup_otp_challenges`
- `signup_otp_sessions`
- `wallet_promo_grants`

## Production Critical Routes - Do Not Change

```text
Get Online:
https://wifi.nister.org/
https://wifi.nister.org/api.json
https://wifi.nister.org/router-sync/*

Manage Access:
https://pay.nister.org/
/login.php
/portal.php
/logout.php
/me.php
/plans.php
/purchase.php
/deposit_request.php
/verify.php
/auto_renew.php
/location.php
/status.php
/topup_config.php

Captive Portal:
flash/hotspot/login.html
flash/hotspot/signup.html
flash/hotspot/change-password.html
flash/hotspot/reset-password.html
flash/hotspot/status.html
flash/hotspot/pay.html
flash/hotspot/config.js
flash/hotspot/common.css
flash/hotspot/md5.js
flash/hotspot/api.json

Hotspot API:
https://api.nister.org/hotspot/otp_send.php
https://api.nister.org/hotspot/otp_verify.php
https://api.nister.org/hotspot/signup.php
https://api.nister.org/hotspot/change_password.php
https://api.nister.org/hotspot/reset_password.php
https://api.nister.org/hotspot/autopost.php
https://api.nister.org/hotspot-api/status.php

Payment:
/paystack_initialize.php
/paystack_callback.php
/paystack_verify.php
/paystack_webhook.php
/cron/paystack_reconcile.php

Authentication:
/login.php
/logout.php
/admin/login.php

Admin:
/admin/
/admin/api.php?fn=*
/admin/google_drive_callback.php
/admin/alerts_hook.php
/admin/traffic_export.php
```

## Proposed New Routes

Public Next routes on `nister.org`:

- `/for-hostels`
- `/how-it-works`
- `/plans`
- `/request-installation`

Owner PHP routes on `pay.nister.org`:

- `/owner/register.php`
- `/owner/login.php`
- `/owner/logout.php`
- `/owner/dashboard.php`
- `/owner/requests.php`
- `/owner/revenue.php`
- `/owner/transactions.php`
- `/owner/api.php?fn=*`

Admin additions:

- Existing `/admin/` gains owner/service/property/revenue panels.
- Existing `/admin/api.php?fn=*` gains owner approval, service request, property link, financial term, and allocation actions.

No new owner route should be added under `api.nister.org`, `wifi.nister.org/hotspot-api`, or router-hosted captive files.

## Proposed Data Model

All new owner-platform `DATETIME` fields must be written and compared in UTC-compatible server/database time. Where existing pay-portal flows already use database `NOW()` on the production UTC server, new owner code may follow that convention; otherwise use `UTC_TIMESTAMP()` for new owner-platform timestamps. Allocation decisions must not use browser-local timestamps.

### `property_owners`

Stores phone-number based owner identity.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `msisdn VARCHAR(16) NOT NULL UNIQUE`
- `display_name VARCHAR(120) NOT NULL`
- `password_hash VARCHAR(255) NOT NULL`
- `status ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending'`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at DATETIME NULL`
- `approved_at DATETIME NULL`
- `approved_by VARCHAR(120) NULL`
- `rejected_at DATETIME NULL`
- `rejected_by VARCHAR(120) NULL`
- `admin_notes TEXT NULL`

### `property_owner_status_events`

Immutable audit trail for owner approval, rejection, suspension, and reactivation.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `owner_id BIGINT UNSIGNED NOT NULL`
- `action ENUM('approve','reject','suspend','reactivate') NOT NULL`
- `previous_status ENUM('pending','approved','rejected','suspended') NOT NULL`
- `new_status ENUM('pending','approved','rejected','suspended') NOT NULL`
- `note TEXT NULL`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_by VARCHAR(120) NOT NULL`
- `request_ip VARCHAR(64) NULL`

Rules:

- Insert one row for every successful admin owner status change.
- Do not insert a status event for a rejected invalid transition that does not mutate the owner.
- Owner rows keep convenient current-state fields; this table is the audit source.

### `owner_otp_challenges`

Separate OTP table for owner registration and service request verification. Password reset is out of scope for the first release unless implemented and tested as a distinct later slice.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `msisdn VARCHAR(16) NOT NULL`
- `otp_hash VARCHAR(255) NOT NULL`
- `purpose ENUM('register_request') NOT NULL DEFAULT 'register_request'`
- `expires_at DATETIME NOT NULL`
- `verified_at DATETIME NULL`
- `attempts INT NOT NULL DEFAULT 0`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `ip VARCHAR(64) NULL`
- `user_agent VARCHAR(255) NULL`

### `property_service_requests`

Stores service requests from public and owner flows.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `owner_id BIGINT UNSIGNED NOT NULL`
- `property_name VARCHAR(160) NOT NULL`
- `area VARCHAR(160) NOT NULL`
- `address TEXT NULL`
- `contact_name VARCHAR(120) NULL`
- `contact_phone VARCHAR(16) NULL`
- `expected_residents INT NULL`
- `expected_rooms INT NULL`
- `notes TEXT NULL`
- `status ENUM('submitted','reviewing','approved','rejected','converted') NOT NULL DEFAULT 'submitted'`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at DATETIME NULL`
- `reviewed_at DATETIME NULL`
- `reviewed_by VARCHAR(120) NULL`
- `converted_at DATETIME NULL`
- `converted_by VARCHAR(120) NULL`
- `converted_property_id BIGINT UNSIGNED NULL`
- `admin_notes TEXT NULL`

### `property_service_request_events`

Immutable audit trail for service request review and conversion decisions.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `service_request_id BIGINT UNSIGNED NOT NULL`
- `action ENUM('start_review','approve','reject','convert') NOT NULL`
- `previous_status ENUM('submitted','reviewing','approved','rejected','converted') NOT NULL`
- `new_status ENUM('submitted','reviewing','approved','rejected','converted') NOT NULL`
- `note TEXT NULL`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_by VARCHAR(120) NOT NULL`
- `request_ip VARCHAR(64) NULL`

Rules:

- Insert one row for every successful admin service request status change.
- Do not insert an event for an invalid transition that does not mutate the request.

### `properties`

Approved owner-visible property records.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `name VARCHAR(160) NOT NULL`
- `area VARCHAR(160) NULL`
- `address TEXT NULL`
- `status ENUM('prospect','active','paused','closed') NOT NULL DEFAULT 'prospect'`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at DATETIME NULL`
- `created_from_request_id BIGINT UNSIGNED NULL`
- `admin_notes TEXT NULL`

### `property_memberships`

Links owners to properties.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `property_id BIGINT UNSIGNED NOT NULL`
- `owner_id BIGINT UNSIGNED NOT NULL`
- `role ENUM('owner','manager') NOT NULL DEFAULT 'owner'`
- `status ENUM('active','disabled') NOT NULL DEFAULT 'active'`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- Unique key on `(property_id, owner_id, role)`

### `property_location_links`

Admin-controlled association between approved property and existing WISP location.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `property_id BIGINT UNSIGNED NOT NULL`
- `location_id INT NOT NULL`
- `status ENUM('active','retired','void') NOT NULL DEFAULT 'active'`
- `effective_from DATETIME NOT NULL`
- `effective_to DATETIME NULL`
- `deactivated_at DATETIME NULL`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_by VARCHAR(120) NULL`

Rules:

- Admin API must enforce at most one currently-active link per `location_id`, defined as `status='active'` and `effective_to IS NULL`, using transactional validation compatible with MySQL/MariaDB.
- A purchase at time `T` matches a property link when `status IN ('active','retired')`, `effective_from <= T`, and (`effective_to IS NULL` or `effective_to > T`).
- Admin deactivation closes the current link by setting `status='retired'`, `effective_to` to the chosen end time, and `deactivated_at` to the action time.
- `void` is reserved for admin-corrected rows that must not be used for historical allocation.
- Creating a new link for a location must either reject an overlapping active/effective window or close the prior window first.
- Historical links are retained for allocation retry and reporting audit.

### `property_financial_terms`

Admin-controlled owner share terms.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `property_id BIGINT UNSIGNED NOT NULL`
- `owner_share_bps INT NOT NULL`
- `effective_from DATETIME NOT NULL`
- `effective_to DATETIME NULL`
- `status ENUM('active','retired','void') NOT NULL DEFAULT 'active'`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_by VARCHAR(120) NULL`
- `notes TEXT NULL`

Rules:

- `owner_share_bps` must be between `0` and `10000`, inclusive.
- Admin API must enforce at most one currently-active term per `property_id`, defined as `status='active'` and `effective_to IS NULL`, using transactional validation compatible with MySQL/MariaDB.
- A purchase at time `T` matches a financial term when `status IN ('active','retired')`, `effective_from <= T`, and (`effective_to IS NULL` or `effective_to > T`).
- Creating or updating terms must reject overlapping active/effective windows for the same property.
- Admin deactivation closes the current term by setting `status='retired'` and `effective_to`; `void` rows are excluded from historical allocation.

### `property_transaction_allocations`

Materialized read-only owner reporting rows.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `property_id BIGINT UNSIGNED NOT NULL`
- `location_id INT NOT NULL`
- `purchase_id BIGINT UNSIGNED NOT NULL UNIQUE`
- `msisdn_hash CHAR(64) NOT NULL`
- `msisdn_masked VARCHAR(24) NULL`
- `plan_code VARCHAR(64) NOT NULL`
- `gross_cents INT NOT NULL`
- `owner_share_bps INT NOT NULL`
- `owner_amount_cents INT NOT NULL`
- `nister_amount_cents INT NOT NULL`
- `purchased_at DATETIME NOT NULL`
- `allocated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `financial_terms_id BIGINT UNSIGNED NOT NULL`
- `status ENUM('allocated','void') NOT NULL DEFAULT 'allocated'`
- `metadata_json JSON NULL`

Owner views must not expose raw resident MSISDN by default. Use hashed or masked identifiers unless admin explicitly approves a future privacy policy change.
First release stores `msisdn_hash` for stable grouping and may display only `msisdn_masked` such as `059***0000`; raw resident phone numbers remain admin-only.

### `property_allocation_attempts`

Stores failed, skipped, and resolved allocation attempts so admins can retry safely and diagnose missing setup.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `purchase_id BIGINT UNSIGNED NOT NULL`
- `location_id INT NULL`
- `property_id BIGINT UNSIGNED NULL`
- `status ENUM('failed','skipped','resolved') NOT NULL DEFAULT 'failed'`
- `reason VARCHAR(64) NOT NULL`
- `detail TEXT NULL`
- `attempt_count INT NOT NULL DEFAULT 1`
- `first_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `resolved_at DATETIME NULL`
- `resolved_allocation_id BIGINT UNSIGNED NULL`
- Unique key on `purchase_id`

## Owner Flows

### Public Request And Registration Flow

1. Visitor opens `nister.org/request-installation`.
2. Page explains the owner request flow and offers a service request form/CTA.
3. Form submits by ordinary browser navigation to `https://pay.nister.org/owner/register.php?intent=request-installation`.
4. All OTP, password, owner session, and service request writes happen on `pay.nister.org`.
5. Owner enters phone number, name, property name, area/address, expected residents/rooms, and notes.
6. Owner requests OTP.
7. Owner verifies OTP.
8. Owner sets or confirms password according to the state matrix below.
9. System creates or updates the owner/request according to the state matrix below.
10. Owner lands in the pending-limited dashboard or existing approved dashboard.

No owner registration API is exposed from `nister.org`, `wifi.nister.org`, or `api.nister.org`.

### Owner Registration State Matrix

| Existing owner state | After OTP verification | Password requirement | Account status result | Service request behavior |
| --- | --- | --- | --- | --- |
| No owner row | Create owner | Set new password | `pending` | Create `submitted` request |
| `pending` | Keep owner | Verify existing password, or set password only if password hash is empty | `pending` | Create additional `submitted` request |
| `approved` | Keep owner | Verify existing password and start owner session | `approved` | Create additional `submitted` request |
| `rejected` | Do not reopen automatically | None | `rejected` | Block request and show support/admin review message |
| `suspended` | Do not reopen automatically | None | `suspended` | Block request and show support/admin review message |

Implementation must never downgrade an approved owner to pending, revive a rejected/suspended owner, or overwrite an existing owner password during a public request flow.

### Pending Owner Dashboard

Allowed:

- View owner account status.
- View submitted service requests.
- Submit additional service requests.
- Update only the owner `display_name` profile field.
- Edit service request fields only while the request is still `submitted`: `property_name`, `area`, `address`, `contact_name`, `contact_phone`, `expected_residents`, `expected_rooms`, and `notes`.

Blocked:

- Properties.
- Network status.
- Revenue.
- Transactions.
- Resident data.
- Router controls.
- Admin/payment controls.

### Approved Owner Dashboard

Allowed:

- View linked properties.
- View service request history.
- View high-level deployment/location status.
- View read-only revenue summary.
- View read-only transaction list from allocation rows.

Blocked:

- Router, firewall, MikroTik, plan, RADIUS, captive portal, resident account mutation, and payment approval controls.
- Payout requests in first release.

### Admin Flow

Admin additions inside existing admin:

- Review pending owners.
- Approve, reject, or suspend owner accounts.
- Review service requests.
- Convert approved request into a property.
- Add owner membership.
- Link property to existing location.
- Manage financial terms.
- Trigger or review transaction allocations.

### Admin Owner State Transition Matrix

| Current status | Allowed admin transitions | Blocked transitions | Audit requirements |
| --- | --- | --- | --- |
| `pending` | `approved`, `rejected`, `suspended` | None | Store decision action, admin identity, timestamp, previous status, new status, and note |
| `approved` | `suspended` | `pending`, `rejected` | Store suspension action, admin identity, timestamp, previous status, new status, and note |
| `suspended` | `approved` | `pending`, `rejected` | Store reactivation action, admin identity, timestamp, previous status, new status, and note |
| `rejected` | None in first release | `pending`, `approved`, `suspended` | Store attempted invalid transition as a rejected API response only; do not mutate the owner |

Rejected owners are terminal in the first release so a public request cannot silently revive a previously rejected owner. If operations later need appeal/reopen behavior, it should be a separate audited admin action.

### Service Request State Transition Matrix

| Current status | Allowed admin transitions | Owner edit access | Audit requirements |
| --- | --- | --- | --- |
| `submitted` | `reviewing`, `approved`, `rejected` | Owner may edit allowed request fields | Store event action, admin identity, timestamp, previous status, new status, and note |
| `reviewing` | `approved`, `rejected` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `approved` | `converted` | Read-only for owner | Store conversion event, admin identity, timestamp, previous status, new status, note, and created property id |
| `rejected` | None in first release | Read-only for owner | Terminal state; invalid transition response must not mutate the request |
| `converted` | None in first release | Read-only for owner | Terminal state; property changes happen through property admin tools |

## Revenue And Transaction Design

Revenue reporting is downstream from existing successful resident access/payment events.

Source of truth remains:

- Existing wallet ledger.
- Existing `purchases`.
- Existing Paystack verification/webhook/callback for wallet crediting.
- Existing `purchase.php` for resident access activation.

Allocation rules:

- Only `purchases.status='applied'` can become owner-visible revenue.
- Purchase location attribution uses `purchases.location_id` captured by the resident purchase flow at purchase creation/apply time. `pay-portal/purchase.php` already attempts to insert `location_id` when the column exists; the implementation plan must keep that behavior, ensure owner allocation code only depends on that stored column, and add regression coverage around it.
- First release requires the `purchases.location_id` column. Owner schema setup must reuse or call the existing location schema helper that adds it; if the column still does not exist, allocation setup must fail closed with an admin-visible setup error rather than silently reporting zero owner revenue.
- Allocation purchase time `T` is `purchases.activated_at` when present, otherwise `purchases.created_at`, otherwise the allocation attempt time only for legacy rows that have neither timestamp.
- If a purchase row has no usable `location_id`, allocation records a failed attempt with reason `missing_purchase_location`; it must not infer from the resident's current profile because that can change after purchase. If the column itself is absent despite setup, allocation also exposes an admin-visible setup error.
- `property_location_links` maps `location_id` to property using non-void link windows effective at the purchase time.
- There must be exactly one non-void property link window for the purchase location at the purchase time. No link records `missing_property_link`; multiple links record `ambiguous_property_link`.
- Non-void `property_financial_terms` effective at purchase time determine split.
- There must be exactly one non-void financial term window for the property at the purchase time. No term records `missing_financial_terms`; overlapping terms record `ambiguous_financial_terms`.
- `gross_cents` comes from `purchases.price_cents`, which represents the amount debited or charged for the resident plan purchase. For legacy rows only, if `price_cents` is absent and a numeric `price` column exists, convert `price * 100` to integer cents with PHP `round(..., 0, PHP_ROUND_HALF_UP)`; otherwise record `missing_purchase_amount`.
- Gross owner reporting is net of plan discounts only if those discounts are already reflected in `purchases.price_cents`. It does not use wallet top-up amount, Paystack deposit amount, taxes, manual payout adjustments, or referral rewards.
- Free or zero-value applied purchases are not owner revenue in the first release and are recorded as skipped with reason `zero_gross_amount` when explicitly processed.
- `owner_amount_cents = intdiv(gross_cents * owner_share_bps, 10000)`. This floors fractional cents to the owner side; `nister_amount_cents = gross_cents - owner_amount_cents`, so allocated cents always sum exactly to gross.
- If a purchase allocation exists and the purchase is later no longer `applied`, reconciliation marks the allocation `void`; no owner payout is triggered by this reporting system.
- `property_transaction_allocations.purchase_id` is unique.
- Allocation failure must not roll back resident internet access.
- Admin can retry allocation.
- Owner dashboard reads from allocation rows, not raw payment tables.
- Allocation is point-in-time. Later resident roaming, user profile changes, location reassignment, or property link changes do not mutate existing successful allocation rows. Admin reconciliation may create allocations for previously failed attempts after links/terms are configured.

Integration point:

- Preferred first-release behavior: run allocation after successful purchase apply and also through an admin/cron reconciliation path.
- The resident purchase flow in `pay-portal/purchase.php` must call allocation after access activation, but allocation errors are caught and logged without changing the purchase response.
- Auto-renewal purchase apply paths that create applied purchase rows should be reviewed in the implementation plan and either call the same allocation helper or be included in the admin/cron reconciliation query before deploy.
- Paystack wallet crediting remains unchanged; allocation occurs at purchase/apply time, not top-up time.
- Failed/skipped allocation attempts are upserted in `property_allocation_attempts` by `purchase_id`, with incremented `attempt_count` and updated `last_attempt_at`.
- `failed` means a retry may succeed after admin, data, or schema correction, including missing amount, missing purchase location, missing or ambiguous property link, missing or ambiguous financial terms, setup errors, or unexpected allocation exceptions.
- `skipped` means intentionally no owner revenue should be created for this attempt, including purchase status not `applied`, zero gross amount, existing allocation already present, or purchase explicitly marked void/refunded.
- When retry succeeds, create `property_transaction_allocations`, mark the attempt `resolved`, and set `resolved_allocation_id`.

## Component Design

### Next Public Site

Files expected to change or be added:

- `nister-org/src/app/page.tsx`
- `nister-org/src/app/for-hostels/page.tsx`
- `nister-org/src/app/how-it-works/page.tsx`
- `nister-org/src/app/plans/page.tsx`
- `nister-org/src/app/request-installation/page.tsx`
- `nister-org/src/components/shared/site-nav.tsx`
- `nister-org/src/components/home/*`
- `nister-org/src/components/marketing/*`
- `nister-org/src/lib/content.ts`
- `nister-org/src/lib/hosts.ts` only if host routing needs additive awareness.

Public pages should:

- Keep Get Online and Manage Access prominent.
- Start the request flow with ordinary browser navigation to `pay.nister.org/owner/register.php?intent=request-installation`.
- Avoid cross-origin owner registration XHR from `nister.org`.
- Avoid global middleware that canonicalizes/removes query strings.
- Avoid changes to `/api.json` and `/router-sync/*`.

### Owner PHP Portal

Expected new files:

- `pay-portal/lib/owner_auth.php`
- `pay-portal/lib/owner_otp.php`
- `pay-portal/lib/owner_schema.php`
- `pay-portal/lib/property_requests.php`
- `pay-portal/lib/property_revenue.php`
- `pay-portal/owner/register.php`
- `pay-portal/owner/login.php`
- `pay-portal/owner/logout.php`
- `pay-portal/owner/dashboard.php`
- `pay-portal/owner/requests.php`
- `pay-portal/owner/revenue.php`
- `pay-portal/owner/transactions.php`
- `pay-portal/owner/api.php`
- `pay-portal/assets/owner.css`
- `pay-portal/assets/owner.js` if needed.

Owner session:

- `nister_owner`.
- `SameSite=Lax`.
- `HttpOnly`.
- `Secure` when request is HTTPS or forwarded HTTPS.
- Separate from `nister_user` and `nister_admin`.
- Successful owner login and successful registration-to-session both call `session_regenerate_id(true)`.
- Owner logout requires POST plus owner CSRF, then clears the `nister_owner` session cookie using the active cookie parameters.
- Authenticated owner pages and APIs must not accept `nister_user` or `nister_admin` sessions as owner identity.

Owner mutation security:

- All authenticated owner mutations use POST only and require an owner CSRF token bound to the `nister_owner` session.
- Owner AJAX mutations send the token through `X-CSRF-Token`; form posts may use a hidden `csrf` field.
- `pay-portal/owner/api.php` must reject mutating `fn` calls without an authenticated owner session and valid CSRF.
- GET owner routes are read-only. `owner/logout.php` may render a logout confirmation on GET, but it destroys the session only on POST with a valid owner CSRF token.
- Public registration/OTP steps use one-time OTP challenge state and rate limits; after password verification creates an owner session, subsequent service request writes use the owner CSRF token.
- Owner status gates apply after CSRF: pending owners may create requests and edit allowed submitted request fields, approved owners may also view approved-only reporting, and suspended/rejected owners cannot mutate requests through owner routes.

### Admin Additions

Expected modifications:

- `pay-portal/admin/index.php`
- `pay-portal/admin/api.php`
- Possibly `pay-portal/assets/premium.css` if existing admin styling needs small additive classes.

Admin API functions:

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

Mutating actions must require existing admin CSRF.

## Error Handling

Owner registration:

- Invalid OTP returns a non-specific failure and increments attempts.
- Expired OTP requires a new challenge.
- Existing pending owner may add another request after OTP verification.
- Existing approved/suspended/rejected owner receives a clear state-specific response.

Pending dashboard:

- If owner is pending, hide approved-only sections and show request status.
- If owner is suspended, block access and show support path.
- Owner profile mutations accept only `display_name`.
- Owner request edits are accepted only for the allowed fields while the request is `submitted`.
- Owner mutations without a valid owner CSRF token are rejected without changing state.

Revenue allocation:

- Allocation errors are logged and stored for admin retry.
- Allocation errors must not affect resident access.
- Duplicate purchase allocation is idempotent.
- Missing amount, missing location, missing/ambiguous link, missing/ambiguous terms, setup errors, and unexpected exceptions are `failed` attempts.
- Non-applied purchase status, zero gross amount, and existing/void allocation no-ops are `skipped` attempts when explicitly processed.

Admin:

- Reject invalid state transitions.
- Keep immutable audit fields for approval, rejection, suspension, and reactivation.
- Store owner decision audit rows for every successful admin status change.

## Testing Strategy

### Required Existing Guardrails

Run `tests/regression/run.sh` after touching:

- Captive pages.
- Status APIs.
- Payment config.
- Admin APIs.
- MikroTik deployment scripts.

Run `ops/check_api_host_boundary.sh` after Apache/vhost routing changes.

Run `ops/check_winbox_tunnel.sh` after VPN/router/firewall/tunnel changes.

This project should avoid Apache/vhost, Winbox, captive, and router changes.

### New Test Coverage

Next:

- Host routing still maps `nister.org` to public homepage and `wifi.nister.org` to network guide.
- `/api.json` remains static CAPPORT JSON with no macros.
- `/router-sync/*` still serves captive source files.
- New pages render and keep `Get Online`, `Manage Access`, and `Request Nister` prominent.
- Existing legacy redirects remain unchanged.

PHP/static regression:

- Owner session uses `nister_owner`, not resident/admin sessions.
- Successful owner login/register regenerates the session id.
- Owner POST/API mutations require owner CSRF; GET owner routes do not mutate state.
- Owner tables are additive.
- Owner OTP table is separate from `signup_otp_*`.
- Pending owner can create service requests.
- Pending owner can update only `display_name` and submitted request fields listed in the spec.
- Pending owner cannot view revenue/properties/transactions.
- Approved owner can view linked property revenue.
- Service request state transitions follow the explicit transition matrix and write audit rows for successful changes.
- Allocation only uses applied purchases.
- Allocation gross source and integer split math follow the spec exactly.
- Allocation uses `purchases.location_id`, point-in-time non-void location-property link windows, and point-in-time non-void financial term windows.
- Allocation records failed/skipped attempts for missing purchase location, missing/ambiguous property link, and missing/ambiguous financial terms.
- Allocation hook is present in `pay-portal/purchase.php` after successful resident activation and does not alter activation response on allocation failure.
- Allocation does not mutate resident access.
- Admin owner actions require CSRF.
- Admin owner state transitions follow the explicit transition matrix and write audit rows for successful changes.

Manual/live verification before deploy:

- `https://wifi.nister.org/api.json` returns existing CAPPORT payload.
- `https://wifi.nister.org/router-sync/status.html` returns captive source file.
- `https://pay.nister.org/admin/api.php?fn=stats` returns auth JSON when unauthenticated, not server error.
- Existing resident login route still responds.
- New owner routes respond without impacting resident routes.

## Rollout Plan

Implementation should be sliced:

1. Route freeze and public Next page tests.
2. Public marketing pages and navigation.
3. Owner schema and phone OTP registration.
4. Pending owner login/dashboard and service requests.
5. Admin owner/service request approval.
6. Properties, memberships, and location links.
7. Financial terms and allocation engine.
8. Approved owner dashboard revenue/transactions.
9. Full verification and deploy.

Although revenue is part of the first release, each slice must be independently testable and reversible.

## Files Considered Production-Critical

- `hotspot/*`
- `nister-org/public/router-sync/*`
- `nister-org/public/api.json`
- `nister-org/next.config.ts`
- `api/hotspot/*`
- `pay-portal/login.php`
- `pay-portal/portal.php`
- `pay-portal/me.php`
- `pay-portal/plans.php`
- `pay-portal/purchase.php`
- `pay-portal/deposit_request.php`
- `pay-portal/paystack_*.php`
- `pay-portal/hotspot-api/status.php`
- `pay-portal/admin/api.php`
- `pay-portal/lib/radius.php`
- `pay-portal/lib/wallet.php`
- `pay-portal/lib/paystack.php`
- `pay-portal/lib/user_auth.php`
- `pay-portal/lib/admin_auth.php`
- `ops/*`
- `nister_*` operational scripts
- `systemd/*`

## Existing Files That Actually Need Modification

- `nister-org/src/app/page.tsx`
- `nister-org/src/components/shared/site-nav.tsx`
- `nister-org/src/components/shared/site-footer.tsx`
- `nister-org/src/lib/content.ts`
- `nister-org/src/app/globals.css`
- `nister-org/src/lib/__tests__/*`
- `nister-org/e2e/host-render.spec.ts`
- `pay-portal/admin/index.php`
- `pay-portal/admin/api.php`
- `pay-portal/purchase.php`
- `tests/regression/run.sh`

Avoid modifying captive files, hotspot API files, Paystack callback/webhook files, and router scripts unless implementation proves there is no additive path.

## Why Each Existing Modification Is Necessary

- Next app files: public acquisition pages and navigation live there.
- Admin files: owner approval, property linking, financial terms, and allocation review belong in existing admin.
- `pay-portal/purchase.php`: owner allocation must be triggered after successful resident access activation while preserving the existing purchase response and location capture behavior.
- Regression tests: protect existing route/payment/captive contracts and new owner boundaries.
- `pay-portal/admin/api.php`: needed only for admin owner/property/revenue actions; keep changes additive.

## Regression Tests Protecting Each Change

- Next route tests protect `nister.org`, `wifi.nister.org`, `/api.json`, `/router-sync/*`, and legacy redirects.
- Existing `tests/regression/run.sh` protects captive API candidates, Paystack/manual payment boundaries, admin stats/actions, router scripts, quota/radius behavior, and account queue sync.
- New owner regression assertions protect session separation, pending/approved access gates, additive schema, and revenue allocation isolation.

## Open Risks

- Current `nister-org/e2e/host-render.spec.ts` appears to contain older homepage expectations compared with current component copy/navigation. Implementation should address that drift as part of test-first public page work.
- Existing pay portal PHP uses large files. Owner code should be placed in new focused libraries and pages to avoid expanding shared files unnecessarily.
- Remote VPS CLI PHP may not have every extension needed for local-style regression tests. Local tests remain required; remote deploy verification should use live HTTP and targeted syntax checks unless the server CLI test environment is fixed separately.
