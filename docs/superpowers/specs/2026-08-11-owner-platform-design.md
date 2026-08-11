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
- `/request-installation` captures a property lead before OTP, password, or account creation so abandoned onboarding still produces an operations lead.
- Lead capture is handled by ordinary browser navigation to `pay.nister.org/owner/lead.php`; verified account creation converts `property_leads` into `property_service_requests` and `property_owners`.
- Release 1 owner revenue allocation must not modify or hook `pay-portal/purchase.php`. Allocation runs from a separate reconciliation worker/cron and from explicit admin retry.
- Rejected service requests and properties are allowed; rejected owner identity is not. Owner accounts use `pending`, `approved`, and `suspended` only.
- Release 1 includes SEO/AEO public content routes for resources, FAQ, coverage, about, sitemap, robots, canonical metadata, structured data, OpenGraph, and Search Console readiness. Authenticated owner/admin surfaces must be `noindex,nofollow`.

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

- `/`
- `/for-hostels`
- `/how-it-works`
- `/plans`
- `/request-installation`
- `/resources`
- `/resources/[slug]`
- `/faq`
- `/coverage`
- `/about`
- `/sitemap.xml`
- `/robots.txt`

Owner PHP routes on `pay.nister.org`:

- `/owner/lead.php`
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
- `status ENUM('pending','approved','suspended') NOT NULL DEFAULT 'pending'`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at DATETIME NULL`
- `approved_at DATETIME NULL`
- `approved_by VARCHAR(120) NULL`
- `suspended_at DATETIME NULL`
- `suspended_by VARCHAR(120) NULL`
- `suspended_reason TEXT NULL`
- `admin_notes TEXT NULL`

### `property_owner_status_events`

Immutable audit trail for owner approval, suspension, and reactivation.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `owner_id BIGINT UNSIGNED NOT NULL`
- `action ENUM('approve','suspend','reactivate') NOT NULL`
- `previous_status ENUM('pending','approved','suspended') NOT NULL`
- `new_status ENUM('pending','approved','suspended') NOT NULL`
- `note TEXT NULL`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_by VARCHAR(120) NOT NULL`
- `request_ip VARCHAR(64) NULL`

Rules:

- Insert one row for every successful admin owner status change.
- Do not insert a status event for an invalid transition that does not mutate the owner.
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

### `property_leads`

Stores public property interest before OTP, password, or account creation. This table is the first write in the request-installation funnel.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `public_ref VARCHAR(32) NOT NULL UNIQUE`
- `contact_name VARCHAR(120) NOT NULL`
- `contact_phone VARCHAR(16) NOT NULL`
- `contact_whatsapp VARCHAR(16) NULL`
- `contact_email VARCHAR(160) NULL`
- `property_name VARCHAR(160) NOT NULL`
- `country VARCHAR(80) NOT NULL`
- `region VARCHAR(120) NOT NULL`
- `town VARCHAR(120) NOT NULL`
- `address TEXT NULL`
- `digital_address VARCHAR(80) NULL`
- `google_maps_url VARCHAR(500) NULL`
- `nearby_campus VARCHAR(160) NULL`
- `number_of_buildings INT NULL`
- `number_of_floors INT NULL`
- `number_of_rooms INT NULL`
- `estimated_residents INT NULL`
- `current_occupancy INT NULL`
- `has_wifi TINYINT(1) NOT NULL DEFAULT 0`
- `current_provider VARCHAR(160) NULL`
- `connection_type VARCHAR(120) NULL`
- `current_monthly_cost_cents INT NULL`
- `current_monthly_cost_currency CHAR(3) NOT NULL DEFAULT 'GHS'`
- `current_speed VARCHAR(120) NULL`
- `poor_coverage TINYINT(1) NOT NULL DEFAULT 0`
- `slow_internet TINYINT(1) NOT NULL DEFAULT 0`
- `downtime TINYINT(1) NOT NULL DEFAULT 0`
- `payment_problem TINYINT(1) NOT NULL DEFAULT 0`
- `user_management_problem TINYINT(1) NOT NULL DEFAULT 0`
- `shared_password_problem TINYINT(1) NOT NULL DEFAULT 0`
- `starting_from_scratch TINYINT(1) NOT NULL DEFAULT 0`
- `deployment_preference ENUM('owner_funded','request_nister_funding','property_paid_wifi','recommend_for_me') NOT NULL DEFAULT 'recommend_for_me'`
- `status ENUM('new','otp_pending','verified','converted','closed','spam') NOT NULL DEFAULT 'new'`
- `source VARCHAR(80) NOT NULL DEFAULT 'request-installation'`
- `utm_source VARCHAR(120) NULL`
- `utm_medium VARCHAR(120) NULL`
- `utm_campaign VARCHAR(120) NULL`
- `referrer VARCHAR(500) NULL`
- `ip VARCHAR(64) NULL`
- `user_agent VARCHAR(255) NULL`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at DATETIME NULL`
- `verified_at DATETIME NULL`
- `converted_at DATETIME NULL`
- `converted_owner_id BIGINT UNSIGNED NULL`
- `converted_service_request_id BIGINT UNSIGNED NULL`
- `admin_notes TEXT NULL`

Rules:

- Lead creation must not require an existing owner account, password, OTP verification, or session.
- A lead is never deleted during failed or abandoned onboarding.
- Successful OTP/password onboarding updates the lead to `converted` and links it to the owner and service request in the same transaction that creates the service request.
- Public pages must not expose lead lists or raw lead data.

### `property_service_requests`

Stores operational CRM requests from converted leads and authenticated owner flows.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `owner_id BIGINT UNSIGNED NOT NULL`
- `lead_id BIGINT UNSIGNED NULL`
- `property_name VARCHAR(160) NOT NULL`
- `country VARCHAR(80) NOT NULL`
- `region VARCHAR(120) NOT NULL`
- `town VARCHAR(120) NOT NULL`
- `address TEXT NULL`
- `digital_address VARCHAR(80) NULL`
- `google_maps_url VARCHAR(500) NULL`
- `nearby_campus VARCHAR(160) NULL`
- `contact_name VARCHAR(120) NULL`
- `contact_phone VARCHAR(16) NULL`
- `contact_whatsapp VARCHAR(16) NULL`
- `contact_email VARCHAR(160) NULL`
- `number_of_buildings INT NULL`
- `number_of_floors INT NULL`
- `number_of_rooms INT NULL`
- `estimated_residents INT NULL`
- `current_occupancy INT NULL`
- `has_wifi TINYINT(1) NOT NULL DEFAULT 0`
- `current_provider VARCHAR(160) NULL`
- `connection_type VARCHAR(120) NULL`
- `current_monthly_cost_cents INT NULL`
- `current_monthly_cost_currency CHAR(3) NOT NULL DEFAULT 'GHS'`
- `current_speed VARCHAR(120) NULL`
- `poor_coverage TINYINT(1) NOT NULL DEFAULT 0`
- `slow_internet TINYINT(1) NOT NULL DEFAULT 0`
- `downtime TINYINT(1) NOT NULL DEFAULT 0`
- `payment_problem TINYINT(1) NOT NULL DEFAULT 0`
- `user_management_problem TINYINT(1) NOT NULL DEFAULT 0`
- `shared_password_problem TINYINT(1) NOT NULL DEFAULT 0`
- `starting_from_scratch TINYINT(1) NOT NULL DEFAULT 0`
- `deployment_preference ENUM('owner_funded','request_nister_funding','property_paid_wifi','recommend_for_me') NOT NULL DEFAULT 'recommend_for_me'`
- `deployment_model ENUM('owner_funded','nister_funded') NULL`
- `billing_model ENUM('resident_pays','property_pays') NULL`
- `notes TEXT NULL`
- `status ENUM('submitted','contacted','qualified','site_survey_required','site_survey_scheduled','site_survey_completed','quote_prepared','quote_sent','negotiating','approved','agreement_signed','equipment_pending','installation_scheduled','installing','testing','active','rejected','lost') NOT NULL DEFAULT 'submitted'`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at DATETIME NULL`
- `reviewed_at DATETIME NULL`
- `reviewed_by VARCHAR(120) NULL`
- `converted_at DATETIME NULL`
- `converted_by VARCHAR(120) NULL`
- `converted_property_id BIGINT UNSIGNED NULL`
- `admin_notes TEXT NULL`

### `property_service_request_events`

Immutable audit trail for service request CRM progression and conversion decisions.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `service_request_id BIGINT UNSIGNED NOT NULL`
- `action ENUM('advance','reject','lose','convert_property','admin_note') NOT NULL`
- `previous_status ENUM('submitted','contacted','qualified','site_survey_required','site_survey_scheduled','site_survey_completed','quote_prepared','quote_sent','negotiating','approved','agreement_signed','equipment_pending','installation_scheduled','installing','testing','active','rejected','lost') NOT NULL`
- `new_status ENUM('submitted','contacted','qualified','site_survey_required','site_survey_scheduled','site_survey_completed','quote_prepared','quote_sent','negotiating','approved','agreement_signed','equipment_pending','installation_scheduled','installing','testing','active','rejected','lost') NOT NULL`
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
- `country VARCHAR(80) NULL`
- `region VARCHAR(120) NULL`
- `town VARCHAR(120) NULL`
- `address TEXT NULL`
- `digital_address VARCHAR(80) NULL`
- `google_maps_url VARCHAR(500) NULL`
- `nearby_campus VARCHAR(160) NULL`
- `number_of_buildings INT NULL`
- `number_of_floors INT NULL`
- `number_of_rooms INT NULL`
- `estimated_residents INT NULL`
- `deployment_model ENUM('owner_funded','nister_funded') NOT NULL DEFAULT 'owner_funded'`
- `billing_model ENUM('resident_pays','property_pays') NOT NULL DEFAULT 'resident_pays'`
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

Admin-controlled owner share and commercial terms.

Fields:

- `id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT`
- `property_id BIGINT UNSIGNED NOT NULL`
- `deployment_model ENUM('owner_funded','nister_funded') NOT NULL`
- `billing_model ENUM('resident_pays','property_pays') NOT NULL`
- `currency CHAR(3) NOT NULL DEFAULT 'GHS'`
- `setup_fee_cents INT NOT NULL DEFAULT 0`
- `recurring_fee_cents INT NOT NULL DEFAULT 0`
- `recurring_fee_period ENUM('none','monthly','term','annual') NOT NULL DEFAULT 'none'`
- `owner_share_bps INT NOT NULL`
- `effective_from DATETIME NOT NULL`
- `effective_to DATETIME NULL`
- `status ENUM('active','retired','void') NOT NULL DEFAULT 'active'`
- `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `created_by VARCHAR(120) NULL`
- `notes TEXT NULL`

Rules:

- `deployment_model` distinguishes owner-funded deployments from Nister-funded deployments.
- `billing_model` distinguishes resident-paid Wi-Fi from property-paid included service.
- `owner_share_bps` must be between `0` and `10000`, inclusive.
- `setup_fee_cents` and `recurring_fee_cents` must be zero or positive.
- `recurring_fee_period='none'` requires `recurring_fee_cents=0`.
- Admin API must enforce at most one currently-active term per `property_id`, defined as `status='active'` and `effective_to IS NULL`, using transactional validation compatible with MySQL/MariaDB.
- A purchase at time `T` matches a financial term when `status IN ('active','retired')`, `effective_from <= T`, and (`effective_to IS NULL` or `effective_to > T`).
- Creating or updating terms must reject overlapping active/effective windows for the same property.
- Admin deactivation closes the current term by setting `status='retired'` and `effective_to`; `void` rows are excluded from historical allocation.

Business model examples:

- Nister Managed: `owner_funded` plus `resident_pays`.
- Nister Funded: `nister_funded` plus `resident_pays`.
- Nister Included: `owner_funded` plus `property_pays`.

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
- `currency CHAR(3) NOT NULL DEFAULT 'GHS'`
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
2. Page presents the full property lead form with location, building, resident, existing connectivity, pain-point, and deployment preference fields.
3. Form submits by ordinary browser navigation to `https://pay.nister.org/owner/lead.php`.
4. `pay.nister.org` creates a `property_leads` row before OTP, password, owner session, or account creation.
5. Owner requests OTP against the captured lead phone number.
6. Owner verifies OTP.
7. Owner sets or confirms password according to the state matrix below.
8. System creates or updates the owner and converts the lead into a service request according to the state matrix below.
9. Owner lands in the pending-limited dashboard or existing approved dashboard.

No owner registration API is exposed from `nister.org`, `wifi.nister.org`, or `api.nister.org`.

### Owner Registration State Matrix

| Existing owner state | After OTP verification | Password requirement | Account status result | Lead/request behavior |
| --- | --- | --- | --- | --- |
| No owner row | Create owner | Set new password | `pending` | Convert verified lead to `submitted` request |
| `pending` | Keep owner | Verify existing password, or set password only if password hash is empty | `pending` | Convert verified lead to additional `submitted` request |
| `approved` | Keep owner | Verify existing password and start owner session | `approved` | Convert verified lead to additional `submitted` request |
| `suspended` | Do not reopen automatically | None | `suspended` | Keep lead captured but block conversion until admin reactivates owner |

Implementation must never downgrade an approved owner to pending, revive a suspended owner, or overwrite an existing owner password during a public request flow.
Rejected requests and rejected properties do not block the same owner from submitting a future lead.

### Pending Owner Dashboard

Allowed:

- View owner account status.
- View submitted service requests.
- Submit additional service requests.
- Update only the owner `display_name` profile field.
- Edit service request fields only while the request is still `submitted`: `property_name`, `country`, `region`, `town`, `address`, `digital_address`, `google_maps_url`, `nearby_campus`, `contact_name`, `contact_phone`, `contact_whatsapp`, `contact_email`, `number_of_buildings`, `number_of_floors`, `number_of_rooms`, `estimated_residents`, `current_occupancy`, connectivity fields, pain-point fields, `deployment_preference`, and `notes`.

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
- View "My Hostel" property details.
- View high-level network online state.
- View connected user counts.
- View read-only revenue this month.
- View read-only owner share.
- View read-only transaction list from allocation rows.

Blocked:

- Router, firewall, MikroTik, plan, RADIUS, captive portal, resident account mutation, and payment approval controls.
- Payout requests in first release.

### Admin Flow

Admin additions inside existing admin:

- Review pending owners.
- Approve or suspend owner accounts.
- Reactivate suspended owner accounts.
- Review service requests through the CRM pipeline.
- Reject or mark service requests as lost without rejecting the owner.
- Convert approved/agreement/installation requests into a property.
- Add owner membership.
- Link property to existing location.
- Manage financial terms.
- Trigger or review transaction allocation reconciliation.

### Admin Owner State Transition Matrix

| Current status | Allowed admin transitions | Blocked transitions | Audit requirements |
| --- | --- | --- | --- |
| `pending` | `approved`, `suspended` | None | Store decision action, admin identity, timestamp, previous status, new status, and note |
| `approved` | `suspended` | `pending` | Store suspension action, admin identity, timestamp, previous status, new status, and note |
| `suspended` | `approved` | `pending` | Store reactivation action, admin identity, timestamp, previous status, new status, and note |

Owner identity rejection is not part of Release 1. Use service request `rejected` or `lost` for business disqualification, and reserve owner `suspended` for security, fraud, or abuse.

### Service Request State Transition Matrix

| Current status | Allowed admin transitions | Owner edit access | Audit requirements |
| --- | --- | --- | --- |
| `submitted` | `contacted`, `rejected`, `lost` | Owner may edit allowed request fields | Store event action, admin identity, timestamp, previous status, new status, and note |
| `contacted` | `qualified`, `rejected`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `qualified` | `site_survey_required`, `quote_prepared`, `rejected`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `site_survey_required` | `site_survey_scheduled`, `rejected`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `site_survey_scheduled` | `site_survey_completed`, `rejected`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `site_survey_completed` | `quote_prepared`, `rejected`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `quote_prepared` | `quote_sent`, `rejected`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `quote_sent` | `negotiating`, `approved`, `rejected`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `negotiating` | `approved`, `rejected`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `approved` | `agreement_signed`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `agreement_signed` | `equipment_pending`, `installation_scheduled`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `equipment_pending` | `installation_scheduled`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `installation_scheduled` | `installing`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `installing` | `testing`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `testing` | `active`, `lost` | Read-only for owner | Store event action, admin identity, timestamp, previous status, new status, and note |
| `active` | None in first release | Read-only for owner | Terminal request state; property changes happen through property admin tools |
| `rejected` | None in first release | Read-only for owner | Terminal request state; owner may submit future leads |
| `lost` | None in first release | Read-only for owner | Terminal request state; owner may submit future leads |

## Revenue And Transaction Design

Revenue reporting is downstream from existing successful resident access/payment events.

Source of truth remains:

- Existing wallet ledger.
- Existing `purchases`.
- Existing Paystack verification/webhook/callback for wallet crediting.
- Existing `purchase.php` for resident access activation.

Allocation rules:

- Only `purchases.status='applied'` can become owner-visible revenue.
- Purchase location attribution uses `purchases.location_id` captured by the resident purchase flow at purchase creation/apply time. Release 1 owner accounting must not change `pay-portal/purchase.php`; allocation code only depends on the stored column and must add regression coverage proving `purchase.php` contains no owner allocation hook.
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

- Release 1 behavior: run allocation only through `pay-portal/cron/property_allocation_reconcile.php` and explicit admin retry. The worker should run every minute or every few minutes via the production scheduler.
- The reconciliation query scans existing `purchases` where `status='applied'`, `location_id` is present, and either no allocation attempt exists or the attempt remains retryable.
- `pay-portal/purchase.php` must not call owner allocation code in Release 1. Resident purchase success and "Get Online" latency take precedence over real-time owner reporting.
- Auto-renewal purchase apply paths that create applied purchase rows are covered by the same reconciliation query before deploy.
- Paystack wallet crediting remains unchanged; reconciliation attributes allocation to the purchase/apply time, not wallet top-up time.
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
- `nister-org/src/app/resources/page.tsx`
- `nister-org/src/app/resources/[slug]/page.tsx`
- `nister-org/src/app/faq/page.tsx`
- `nister-org/src/app/coverage/page.tsx`
- `nister-org/src/app/about/page.tsx`
- `nister-org/src/app/sitemap.ts`
- `nister-org/src/app/robots.ts`
- `nister-org/src/components/shared/site-nav.tsx`
- `nister-org/src/components/home/*`
- `nister-org/src/components/marketing/*`
- `nister-org/src/lib/content.ts`
- `nister-org/src/lib/seo.ts`
- `nister-org/src/lib/hosts.ts` only if host routing needs additive awareness.

Public pages should:

- Keep Get Online and Manage Access prominent.
- Start the request flow with ordinary browser navigation to `pay.nister.org/owner/lead.php`.
- Avoid cross-origin owner registration XHR from `nister.org`.
- Avoid global middleware that canonicalizes/removes query strings.
- Avoid changes to `/api.json` and `/router-sync/*`.
- Include canonical metadata, OpenGraph metadata, Organization JSON-LD, BreadcrumbList schema where useful, Article schema for resource articles, sitemap generation, robots rules, and Search Console friendly public paths.
- Keep OAI-SearchBot and ordinary search crawler access open for public acquisition and resources pages.
- Ensure authenticated `/owner/*` and `/admin/*` responses on `pay.nister.org` send `X-Robots-Tag: noindex, nofollow` or equivalent HTML metadata.

### Owner PHP Portal

Expected new files:

- `pay-portal/lib/owner_auth.php`
- `pay-portal/lib/owner_otp.php`
- `pay-portal/lib/owner_schema.php`
- `pay-portal/lib/property_leads.php`
- `pay-portal/lib/property_requests.php`
- `pay-portal/lib/property_revenue.php`
- `pay-portal/owner/lead.php`
- `pay-portal/owner/register.php`
- `pay-portal/owner/login.php`
- `pay-portal/owner/logout.php`
- `pay-portal/owner/dashboard.php`
- `pay-portal/owner/requests.php`
- `pay-portal/owner/revenue.php`
- `pay-portal/owner/transactions.php`
- `pay-portal/owner/api.php`
- `pay-portal/cron/property_allocation_reconcile.php`
- `systemd/nister-property-allocation-reconcile.service` if production uses systemd timers for this worker.
- `systemd/nister-property-allocation-reconcile.timer` if production uses systemd timers for this worker.
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
- Owner status gates apply after CSRF: pending owners may create requests and edit allowed submitted request fields, approved owners may also view approved-only reporting, and suspended owners cannot mutate requests through owner routes.

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

- Lead capture stores the submitted property information before OTP; failed or abandoned verification must not delete the lead.
- Invalid OTP returns a non-specific failure and increments attempts.
- Expired OTP requires a new challenge.
- Existing pending owner may add another request after OTP verification.
- Existing approved/suspended owner receives a clear state-specific response.
- Suspended owners cannot convert new leads to service requests until admin reactivation.

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
- Keep immutable audit fields for approval, suspension, and reactivation.
- Store owner decision audit rows for every successful admin status change.
- Store service request rejection/lost decisions on the request, never on the owner identity.

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
- `/request-installation` renders the full lead form field set and submits to `https://pay.nister.org/owner/lead.php` without cross-origin XHR.
- `/resources`, `/resources/[slug]`, `/faq`, `/coverage`, and `/about` render public SEO/AEO content with canonical and OpenGraph metadata.
- Sitemap and robots routes include public acquisition/resource pages and exclude authenticated owner/admin pages.
- Public resources include Organization JSON-LD, BreadcrumbList where useful, and Article schema for article pages.
- Existing legacy redirects remain unchanged.

PHP/static regression:

- Owner session uses `nister_owner`, not resident/admin sessions.
- Successful owner login/register regenerates the session id.
- Owner POST/API mutations require owner CSRF; GET owner routes do not mutate state.
- Owner tables are additive.
- Owner OTP table is separate from `signup_otp_*`.
- Public lead capture creates `property_leads` before OTP/account creation and preserves abandoned leads.
- OTP/password conversion links `property_leads` to `property_owners` and `property_service_requests`.
- Pending owner can create service requests.
- Pending owner can update only `display_name` and submitted request fields listed in the spec.
- Pending owner cannot view revenue/properties/transactions.
- Approved owner can view linked property revenue.
- Owner identity status allows only `pending`, `approved`, and `suspended`; rejected/lost decisions apply to service requests.
- Service request state transitions follow the explicit transition matrix and write audit rows for successful changes.
- Allocation only uses applied purchases.
- Allocation gross source and integer split math follow the spec exactly.
- Allocation uses `purchases.location_id`, point-in-time non-void location-property link windows, and point-in-time non-void financial term windows.
- Allocation records failed/skipped attempts for missing purchase location, missing/ambiguous property link, and missing/ambiguous financial terms.
- `pay-portal/purchase.php` contains no owner allocation hook in Release 1.
- `pay-portal/cron/property_allocation_reconcile.php` scans applied purchases and creates/updates allocations idempotently.
- Allocation does not mutate resident access.
- Admin owner actions require CSRF.
- Admin owner state transitions follow the explicit transition matrix and write audit rows for successful changes.
- Authenticated owner/admin pages emit `noindex,nofollow` controls.

Manual/live verification before deploy:

- `https://wifi.nister.org/api.json` returns existing CAPPORT payload.
- `https://wifi.nister.org/router-sync/status.html` returns captive source file.
- `https://pay.nister.org/admin/api.php?fn=stats` returns auth JSON when unauthenticated, not server error.
- Existing resident login route still responds.
- New owner routes respond without impacting resident routes.

## Rollout Plan

Implementation should be sliced:

1. Route freeze and public Next page tests.
2. Public marketing, SEO/AEO pages, sitemap, robots, and navigation.
3. Lead-first request-installation capture.
4. Owner schema and phone OTP registration.
5. Pending owner login/dashboard and service requests.
6. Admin owner/service request CRM.
7. Properties, memberships, and location links.
8. Financial terms and reconciliation-only allocation engine.
9. Approved owner dashboard revenue/transactions.
10. Full verification and deploy.

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
- `nister-org/src/lib/content.ts`
- `nister-org/src/lib/seo.ts`
- `nister-org/src/app/globals.css`
- `nister-org/src/lib/__tests__/*`
- `nister-org/e2e/host-render.spec.ts`
- `pay-portal/lib/owner_auth.php`
- `pay-portal/lib/owner_otp.php`
- `pay-portal/lib/owner_schema.php`
- `pay-portal/lib/property_leads.php`
- `pay-portal/lib/property_requests.php`
- `pay-portal/lib/property_revenue.php`
- `pay-portal/owner/*`
- `pay-portal/admin/index.php`
- `pay-portal/admin/api.php`
- `pay-portal/cron/property_allocation_reconcile.php`
- `systemd/nister-property-allocation-reconcile.service` if production uses systemd timers for this worker.
- `systemd/nister-property-allocation-reconcile.timer` if production uses systemd timers for this worker.
- `tests/regression/run.sh`

Avoid modifying `pay-portal/purchase.php`, captive files, hotspot API files, Paystack callback/webhook files, and router scripts unless a later release explicitly approves that production-path change.

## Why Each Existing Modification Is Necessary

- Next app files: public acquisition pages and navigation live there.
- Admin files: owner approval, property linking, financial terms, and allocation review belong in existing admin.
- Owner PHP files: lead capture, phone OTP, owner sessions, dashboards, and request forms live outside resident/admin sessions.
- Reconciliation cron/timer files: Release 1 owner accounting runs outside the resident purchase path.
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
