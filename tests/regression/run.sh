#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

pass_count=0

pass() {
  local name="$1"
  pass_count=$((pass_count + 1))
  printf 'PASS %s\n' "$name"
}

fail() {
  local name="$1"
  local detail="$2"
  printf 'FAIL %s: %s\n' "$name" "$detail" >&2
  exit 1
}

assert_eq() {
  local name="$1"
  local got="$2"
  local expected="$3"
  if [[ "$got" != "$expected" ]]; then
    fail "$name" "expected '$expected' got '$got'"
  fi
  pass "$name"
}

assert_contains() {
  local name="$1"
  local got="$2"
  local needle="$3"
  if [[ "$got" != *"$needle"* ]]; then
    fail "$name" "missing substring '$needle'"
  fi
  pass "$name"
}

assert_not_contains() {
  local name="$1"
  local got="$2"
  local needle="$3"
  if [[ "$got" == *"$needle"* ]]; then
    fail "$name" "unexpected substring '$needle'"
  fi
  pass "$name"
}

assert_no_owner_rejected_status_enum() {
  local name="$1"
  local got="$2"
  local flattened
  local enum
  flattened="$(printf '%s\n' "$got" | tr '\r\n' '  ')"
  while IFS= read -r enum; do
    if [[ "$enum" == *pending* && "$enum" == *approved* && "$enum" == *rejected* ]]; then
      fail "$name" "owner status enum includes rejected: $enum"
    fi
  done < <(printf '%s\n' "$flattened" | grep -Eio '`?(status|previous_status|new_status)`?[[:space:]]+ENUM[[:space:]]*\([^)]*\)' || true)
  pass "$name"
}

assert_owner_pages_each_noindex() {
  local name="$1"
  local files=()
  local file
  local content
  while IFS= read -r -d '' file; do
    files+=("$file")
  done < <(find pay-portal/owner -maxdepth 1 -type f -name '*.php' -print0 2>/dev/null || true)
  if [[ "${#files[@]}" -eq 0 ]]; then
    fail "$name" "no pay-portal/owner/*.php files found"
  fi
  for file in "${files[@]}"; do
    content="$(cat "$file")"
    if [[ "$content" != *"noindex, nofollow"* && "$content" != *"owner_noindex_headers"* ]]; then
      fail "$name" "$file missing noindex protection"
    fi
  done
  pass "$name"
}

php_run() {
  php -d error_reporting=E_ERROR -d display_errors=0 "$@"
}

same_origin_post_no_headers="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/common.php';
$_SERVER = ['REQUEST_METHOD' => 'POST', 'HTTP_HOST' => 'pay.nister.org'];
echo nister_is_same_origin_request() ? '1' : '0';
PHP
)"
assert_eq "same_origin_post_requires_origin_or_referer" "$same_origin_post_no_headers" "0"

same_origin_post_with_origin="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/common.php';
$_SERVER = [
  'REQUEST_METHOD' => 'POST',
  'HTTP_HOST' => 'pay.nister.org',
  'HTTP_ORIGIN' => 'https://pay.nister.org',
];
echo nister_is_same_origin_request() ? '1' : '0';
PHP
)"
assert_eq "same_origin_post_allows_matching_origin" "$same_origin_post_with_origin" "1"

same_origin_get_no_headers="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/common.php';
$_SERVER = ['REQUEST_METHOD' => 'GET', 'HTTP_HOST' => 'pay.nister.org'];
echo nister_is_same_origin_request() ? '1' : '0';
PHP
)"
assert_eq "same_origin_get_still_allowed" "$same_origin_get_no_headers" "1"

transaction_resolution="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/transaction_safety.php';
$a = nister_apply_failure_resolution(false);
$b = nister_apply_failure_resolution(true);
$ok = $a['should_refund'] === true
  && $a['purchase_status'] === 'failed'
  && $a['error'] === 'apply_failed'
  && $b['should_refund'] === false
  && $b['purchase_status'] === 'applied'
  && $b['error'] === 'reconcile_required';
echo $ok ? 'OK' : 'BAD';
PHP
)"
assert_eq "transaction_resolution_refund_gate" "$transaction_resolution" "OK"

status_trusted_origin_without_token="$(php_run <<'PHP'
<?php
putenv('DB_DSN=sqlite::memory:');
putenv('DB_USER=test');
putenv('DB_PASS=test');
putenv('HOTSPOT_STATUS_TOKEN=regression-secret');
$_SERVER = [
  'REQUEST_METHOD' => 'GET',
  'HTTP_ORIGIN' => 'https://wifi.nister.org',
];
$_GET = [];
include getcwd() . '/pay-portal/hotspot-api/status.php';
PHP
)"
assert_contains "status_trusted_origin_without_token_reaches_validation" "$status_trusted_origin_without_token" '"error":"username required"'

status_null_origin_without_token="$(php_run <<'PHP'
<?php
putenv('DB_DSN=sqlite::memory:');
putenv('DB_USER=test');
putenv('DB_PASS=test');
putenv('HOTSPOT_STATUS_TOKEN=regression-secret');
$_SERVER = [
  'REQUEST_METHOD' => 'GET',
  'HTTP_ORIGIN' => 'null',
];
$_GET = [];
include getcwd() . '/pay-portal/hotspot-api/status.php';
PHP
)"
assert_contains "status_null_origin_without_token_reaches_validation" "$status_null_origin_without_token" '"error":"username required"'

status_no_origin_without_token="$(php_run <<'PHP'
<?php
putenv('DB_DSN=sqlite::memory:');
putenv('DB_USER=test');
putenv('DB_PASS=test');
putenv('HOTSPOT_STATUS_TOKEN=regression-secret');
$_SERVER = [
  'REQUEST_METHOD' => 'GET',
];
$_GET = [];
include getcwd() . '/pay-portal/hotspot-api/status.php';
PHP
)"
assert_contains "status_no_origin_still_requires_token" "$status_no_origin_without_token" '"error":"forbidden"'

status_with_token="$(php_run <<'PHP'
<?php
putenv('DB_DSN=sqlite::memory:');
putenv('DB_USER=test');
putenv('DB_PASS=test');
putenv('HOTSPOT_STATUS_TOKEN=regression-secret');
$_SERVER = [
  'REQUEST_METHOD' => 'GET',
  'HTTP_ORIGIN' => 'https://wifi.nister.org',
  'HTTP_X_STATUS_TOKEN' => 'regression-secret',
];
$_GET = [];
include getcwd() . '/pay-portal/hotspot-api/status.php';
PHP
)"
assert_contains "status_allows_valid_token" "$status_with_token" '"error":"username required"'

status_page_content="$(cat hotspot/status.html)"
router_status_page_content="$(cat nister-org/public/router-sync/status.html)"
status_candidates_block="$(awk '/function apiCandidates\(username\)/,/function pickPayLoginUrl/' hotspot/status.html)"
router_status_candidates_block="$(awk '/function apiCandidates\(username\)/,/function pickPayLoginUrl/' nister-org/public/router-sync/status.html)"
assert_contains "status_page_prefers_api_base" "$status_page_content" "var base = (apiOverride || safeCfg || 'https://api.nister.org')"
assert_contains "status_page_candidates_use_api_host" "$status_candidates_block" "'https://api.nister.org'"
assert_contains "status_page_candidates_keep_router_local_context" "$status_candidates_block" "sameOrigin"
assert_not_contains "status_page_candidates_do_not_use_pay_host" "$status_candidates_block" "pay.nister.org"
assert_not_contains "status_page_candidates_do_not_use_pay_base" "$status_candidates_block" "safePay"
assert_not_contains "status_page_must_not_default_to_pay_api" "$status_page_content" "var base = (apiOverride || safePay || 'https://pay.nister.org')"
assert_contains "status_page_has_verified_status_cache" "$status_page_content" "function statusCacheKey(username)"
assert_contains "status_page_restores_cached_status_before_api" "$status_page_content" "restoreCachedStatus(user)"
assert_contains "status_page_stores_verified_status" "$status_page_content" "storeCachedStatus(user, j)"
assert_contains "status_page_has_router_session_fallback" "$status_page_content" "function setRouterSessionFallback(username)"
assert_contains "status_page_does_not_reset_verified_status_on_poll" "$status_page_content" "if (!state.lastGoodAt && !state.routerFallbackShown)"
assert_contains "router_status_page_prefers_api_base" "$router_status_page_content" "var base = (apiOverride || safeCfg || 'https://api.nister.org')"
assert_contains "router_status_candidates_use_api_host" "$router_status_candidates_block" "'https://api.nister.org'"
assert_contains "router_status_candidates_keep_router_local_context" "$router_status_candidates_block" "sameOrigin"
assert_not_contains "router_status_candidates_do_not_use_pay_host" "$router_status_candidates_block" "pay.nister.org"
assert_not_contains "router_status_candidates_do_not_use_pay_base" "$router_status_candidates_block" "safePay"
assert_not_contains "router_status_must_not_default_to_pay_api" "$router_status_page_content" "var base = (apiOverride || safePay || 'https://pay.nister.org')"
assert_contains "router_status_page_has_verified_status_cache" "$router_status_page_content" "function statusCacheKey(username)"
assert_contains "router_status_page_restores_cached_status_before_api" "$router_status_page_content" "restoreCachedStatus(user)"
assert_contains "router_status_page_stores_verified_status" "$router_status_page_content" "storeCachedStatus(user, j)"
assert_contains "router_status_page_has_router_session_fallback" "$router_status_page_content" "function setRouterSessionFallback(username)"
assert_contains "router_status_page_does_not_reset_verified_status_on_poll" "$router_status_page_content" "if (!state.lastGoodAt && !state.routerFallbackShown)"

hotspot_config_content="$(cat hotspot/config.js nister-org/public/router-sync/config.js)"
assert_contains "hotspot_config_default_api_host" "$hotspot_config_content" "var DEFAULT_API_BASE = 'https://api.nister.org';"
assert_contains "hotspot_config_trusted_api_host" "$hotspot_config_content" "var TRUSTED_API_HOSTS = ['api.nister.org'];"
assert_not_contains "hotspot_config_must_not_default_api_to_pay" "$hotspot_config_content" "var DEFAULT_API_BASE = 'https://pay.nister.org';"

otp_send_http_origin_preflight="$(php_run <<'PHP'
<?php
$_SERVER = [
  'REQUEST_METHOD' => 'OPTIONS',
  'HTTP_ORIGIN' => 'http://wifi.nister.org',
];
include getcwd() . '/api/hotspot/otp_send.php';
PHP
)"
assert_eq "otp_send_allows_http_wifi_origin_preflight" "$otp_send_http_origin_preflight" ""

otp_send_unlisted_origin="$(php_run <<'PHP'
<?php
$_SERVER = [
  'REQUEST_METHOD' => 'POST',
  'HTTP_ORIGIN' => 'https://foo.nister.org',
];
$_POST = ['username' => '233200000000'];
include getcwd() . '/api/hotspot/otp_send.php';
PHP
)"
assert_contains "otp_send_rejects_unlisted_subdomain" "$otp_send_unlisted_origin" '"error":"origin_not_allowed"'

referral_token_consume_block="$(awk '/function referrals_consume_signup_token/,/^}/' pay-portal/lib/referrals.php)"
assert_not_contains "referral_consume_token_no_reused_now_placeholder" "$referral_token_consume_block" 'expires_at>=:now'
assert_contains "referral_consume_token_distinct_expiry_placeholder" "$referral_token_consume_block" 'expires_at>=:expires_now'

change_password_fallback="$(php_run <<'PHP'
<?php
$_SERVER = ['REQUEST_METHOD' => 'POST'];
$_POST = [
  'link_login_only' => 'javascript://wifi.nister.org/login',
];
include getcwd() . '/api/hotspot/change_password.php';
PHP
)"
assert_contains "change_password_falls_back_to_router_relative_page" "$change_password_fallback" "/change-password.html"
assert_not_contains "change_password_rejects_javascript_scheme" "$change_password_fallback" "javascript://wifi.nister.org"
assert_not_contains "change_password_no_public_wifi_fallback" "$change_password_fallback" "https://wifi.nister.org/change-password.html"

change_password_router_context="$(php_run <<'PHP'
<?php
$_SERVER = ['REQUEST_METHOD' => 'POST'];
$_POST = [
  'link_login_only' => 'http://192.168.88.1/login',
];
include getcwd() . '/api/hotspot/change_password.php';
PHP
)"
assert_contains "change_password_preserves_router_context_base" "$change_password_router_context" "http://192.168.88.1/change-password.html"

reset_password_fallback="$(php_run <<'PHP'
<?php
$_SERVER = ['REQUEST_METHOD' => 'POST'];
$_POST = [
  'link_login_only' => 'javascript://wifi.nister.org/login',
];
include getcwd() . '/api/hotspot/reset_password.php';
PHP
)"
assert_contains "reset_password_falls_back_to_router_relative_page" "$reset_password_fallback" "/reset-password.html"
assert_not_contains "reset_password_no_public_wifi_fallback" "$reset_password_fallback" "https://wifi.nister.org/reset-password.html"

autopost_fallback="$(php_run <<'PHP'
<?php
$_SERVER = ['REQUEST_METHOD' => 'POST'];
$_POST = [
  'username' => '233200000000',
  'password' => 'secret123',
];
include getcwd() . '/api/hotspot/autopost.php';
PHP
)"
assert_contains "autopost_without_router_context_uses_relative_login" "$autopost_fallback" 'action="/login"'
assert_not_contains "autopost_without_router_context_no_public_login" "$autopost_fallback" 'https://wifi.nister.org/login'

autopost_router_context="$(php_run <<'PHP'
<?php
$_SERVER = ['REQUEST_METHOD' => 'POST'];
$_POST = [
  'username' => '233200000000',
  'password' => 'secret123',
  'link_login_only' => 'http://192.168.88.1/login',
];
include getcwd() . '/api/hotspot/autopost.php';
PHP
)"
assert_contains "autopost_preserves_router_login_action" "$autopost_router_context" 'action="http://192.168.88.1/login"'

hotspot_fallback_sources="$(cat api/hotspot/change_password.php api/hotspot/reset_password.php api/hotspot/signup.php api/hotspot/autopost.php pay-portal/cron/auto_renew.php pay-portal/purchase.php)"
assert_not_contains "fallback_sources_no_public_login_html_default" "$hotspot_fallback_sources" "https://wifi.nister.org/login.html"

owner_schema_content="$(cat pay-portal/lib/owner_schema.php 2>/dev/null || true)"
property_leads_content="$(cat pay-portal/lib/property_leads.php 2>/dev/null || true)"
owner_auth_content="$(cat pay-portal/lib/owner_auth.php 2>/dev/null || true)"
owner_otp_content="$(cat pay-portal/lib/owner_otp.php 2>/dev/null || true)"
property_requests_content="$(cat pay-portal/lib/property_requests.php 2>/dev/null || true)"
property_revenue_content="$(cat pay-portal/lib/property_revenue.php 2>/dev/null || true)"
property_allocation_cron_content="$(cat pay-portal/cron/property_allocation_reconcile.php 2>/dev/null || true)"
property_allocation_service_content="$(cat systemd/nister-property-allocation-reconcile.service 2>/dev/null || true)"
property_allocation_timer_content="$(cat systemd/nister-property-allocation-reconcile.timer 2>/dev/null || true)"
admin_auth_content="$(cat pay-portal/lib/admin_auth.php 2>/dev/null || true)"
admin_login_content="$(cat pay-portal/admin/login.php 2>/dev/null || true)"
admin_api_owner_content="$(cat pay-portal/admin/api.php 2>/dev/null || true)"
admin_index_owner_content="$(cat pay-portal/admin/index.php 2>/dev/null || true)"
owner_lead_content="$(cat pay-portal/owner/lead.php 2>/dev/null || true)"
owner_register_content="$(cat pay-portal/owner/register.php 2>/dev/null || true)"
owner_login_content="$(cat pay-portal/owner/login.php 2>/dev/null || true)"
owner_logout_content="$(cat pay-portal/owner/logout.php 2>/dev/null || true)"
owner_dashboard_content="$(cat pay-portal/owner/dashboard.php 2>/dev/null || true)"
owner_requests_content="$(cat pay-portal/owner/requests.php 2>/dev/null || true)"
owner_revenue_content="$(cat pay-portal/owner/revenue.php 2>/dev/null || true)"
owner_transactions_content="$(cat pay-portal/owner/transactions.php 2>/dev/null || true)"
owner_api_content="$(cat pay-portal/owner/api.php 2>/dev/null || true)"
owner_start_session_block="$(awk '/function owner_start_session_for_owner/,/^}/' pay-portal/lib/owner_auth.php 2>/dev/null || true)"
owner_do_login_block="$(awk '/function owner_do_login/,/^}/' pay-portal/lib/owner_auth.php 2>/dev/null || true)"
property_request_owner_statuses_block="$(awk '/function property_request_statuses/,/^}/' pay-portal/lib/property_requests.php 2>/dev/null || true)"
owner_convert_lead_block="$(awk '/function property_owner_convert_lead_after_otp/,/^}/' pay-portal/lib/property_requests.php 2>/dev/null || true)"
purchase_content="$(cat pay-portal/purchase.php)"

assert_contains "owner_schema_defines_leads" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_leads"
assert_contains "owner_schema_defines_owners" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_owners"
assert_contains "owner_schema_defines_owner_status_events" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_owner_status_events"
assert_contains "owner_schema_defines_owner_otp_challenges" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS owner_otp_challenges"
assert_contains "owner_schema_defines_service_requests" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_service_requests"
assert_contains "owner_schema_defines_service_request_events" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_service_request_events"
assert_contains "owner_schema_defines_properties" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS properties"
assert_contains "owner_schema_defines_property_memberships" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_memberships"
assert_contains "owner_schema_defines_property_location_links" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_location_links"
assert_contains "owner_schema_defines_property_financial_terms" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_financial_terms"
assert_contains "owner_schema_defines_property_transaction_allocations" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_transaction_allocations"
assert_contains "owner_schema_defines_property_allocation_attempts" "$owner_schema_content" "CREATE TABLE IF NOT EXISTS property_allocation_attempts"
assert_contains "owner_schema_no_rejected_owner_status" "$owner_schema_content" "ENUM('pending','approved','suspended')"
assert_contains "owner_schema_supports_owner_status_events" "$owner_schema_content" "ENUM('approve','suspend','reactivate')"
assert_contains "owner_schema_supports_deployment_model" "$owner_schema_content" "deployment_model"
assert_contains "owner_schema_supports_billing_model" "$owner_schema_content" "billing_model"
assert_contains "owner_schema_supports_setup_fee_cents" "$owner_schema_content" "setup_fee_cents"
assert_contains "owner_schema_supports_recurring_fee_cents" "$owner_schema_content" "recurring_fee_cents"
assert_contains "owner_schema_supports_current_cost_cents" "$owner_schema_content" "current_monthly_cost_cents"
assert_contains "owner_schema_supports_resident_pays" "$owner_schema_content" "ENUM('resident_pays','property_pays')"
assert_contains "owner_schema_supports_nister_funded" "$owner_schema_content" "ENUM('owner_funded','nister_funded')"
assert_contains "owner_schema_supports_expanded_crm_statuses" "$owner_schema_content" "site_survey_required','site_survey_scheduled','site_survey_completed','quote_prepared','quote_sent','negotiating','approved','agreement_signed','equipment_pending','installation_scheduled','installing','testing','active','rejected','lost"
assert_contains "owner_schema_supports_location_effective_windows" "$owner_schema_content" "effective_from DATETIME NOT NULL"
assert_contains "owner_schema_supports_financial_terms_windows" "$owner_schema_content" "effective_to DATETIME NULL"
assert_contains "owner_schema_unique_purchase_allocations" "$owner_schema_content" "UNIQUE KEY uq_property_transaction_allocations_purchase"
assert_contains "owner_schema_unique_allocation_attempts" "$owner_schema_content" "UNIQUE KEY uq_property_allocation_attempts_purchase"
assert_contains "owner_schema_calls_location_bootstrap" "$owner_schema_content" "location_bootstrap()"
assert_contains "owner_schema_defines_table_exists_helper" "$owner_schema_content" "function owner_schema_table_exists(PDO \$pdo, string \$table): bool"
assert_contains "owner_schema_defines_column_exists_helper" "$owner_schema_content" "function owner_schema_column_exists(PDO \$pdo, string \$table, string \$column): bool"
assert_contains "owner_schema_defines_bootstrap" "$owner_schema_content" "function owner_schema_bootstrap(PDO \$pdo): void"
assert_contains "owner_schema_requires_purchase_location" "$owner_schema_content" "function owner_schema_require_purchase_location(PDO \$pdo): array"
assert_no_owner_rejected_status_enum "owner_schema_never_defines_rejected_owner_status_enum" "$owner_schema_content"
assert_contains "property_leads_defines_public_fields" "$property_leads_content" "function property_lead_public_fields(): array"
assert_contains "property_leads_defines_normalize" "$property_leads_content" "function property_lead_normalize(array \$in): array"
assert_contains "property_leads_defines_validate" "$property_leads_content" "function property_lead_validate(array \$lead): array"
assert_contains "property_leads_defines_create" "$property_leads_content" "function property_lead_create(PDO \$pdo, array \$in, array \$server = []): array"
assert_contains "property_leads_defines_find" "$property_leads_content" "function property_lead_find(PDO \$pdo, int \$id): ?array"
assert_contains "property_leads_defines_mark_otp_pending" "$property_leads_content" "function property_lead_mark_otp_pending(PDO \$pdo, int \$leadId): void"
assert_contains "property_leads_normalizes_msisdn" "$property_leads_content" "normalize_msisdn("
assert_contains "property_leads_rounds_decimal_costs_to_cents" "$property_leads_content" "round(\$amount * 100, 0, PHP_ROUND_HALF_UP)"

property_lead_validation="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/property_leads.php';
$fields = property_lead_public_fields();
$lead = property_lead_normalize([
  'contact_name' => '  Ama Owner  ',
  'contact_phone' => '024 123 4567',
  'contact_whatsapp' => '+233 24 765 4321',
  'contact_email' => 'owner@example.com',
  'property_name' => 'North Gate Hostel',
  'country' => 'Ghana',
  'region' => 'Ashanti',
  'town' => 'Kumasi',
  'address' => 'Near campus gate',
  'has_wifi' => '0',
  'current_monthly_cost' => '1234.565',
  'poor_coverage' => 'yes',
  'deployment_preference' => 'property_paid_wifi',
]);
$errors = property_lead_validate($lead);
$ok = in_array('current_monthly_cost', $fields, true)
  && $lead['contact_name'] === 'Ama Owner'
  && $lead['contact_phone'] === '233241234567'
  && $lead['contact_whatsapp'] === '233247654321'
  && $lead['current_monthly_cost_cents'] === 123457
  && $lead['current_monthly_cost_currency'] === 'GHS'
  && $lead['poor_coverage'] === 1
  && $lead['has_wifi'] === 0
  && $lead['deployment_preference'] === 'property_paid_wifi'
  && $errors === [];
echo $ok ? 'OK' : 'BAD';
PHP
)"
assert_eq "property_lead_normalize_validate_release1_fields" "$property_lead_validation" "OK"

property_lead_invalid_booleans="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/property_leads.php';
$lead = property_lead_normalize([
  'contact_name' => 'Ama Owner',
  'contact_phone' => '0241234567',
  'property_name' => 'North Gate Hostel',
  'country' => 'Ghana',
  'region' => 'Ashanti',
  'town' => 'Kumasi',
  'has_wifi' => 'definitely',
  'poor_coverage' => '2',
  'starting_from_scratch' => 'maybe',
]);
$errors = property_lead_validate($lead);
$ok = ($errors['has_wifi'] ?? null) === 'invalid_boolean'
  && ($errors['poor_coverage'] ?? null) === 'invalid_boolean'
  && ($errors['starting_from_scratch'] ?? null) === 'invalid_boolean';
echo $ok ? 'OK' : 'BAD';
PHP
)"
assert_eq "property_lead_rejects_invalid_boolean_values" "$property_lead_invalid_booleans" "OK"

property_lead_integer_bounds="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/property_leads.php';
$lead = property_lead_normalize([
  'contact_name' => 'Ama Owner',
  'contact_phone' => '0241234567',
  'property_name' => 'North Gate Hostel',
  'country' => 'Ghana',
  'region' => 'Ashanti',
  'town' => 'Kumasi',
  'number_of_buildings' => '100000000000000000000',
  'number_of_floors' => '1000',
  'number_of_rooms' => '250000',
  'estimated_residents' => '500000',
  'current_occupancy' => '500000',
]);
$errors = property_lead_validate($lead);
$ok = ($errors['number_of_buildings'] ?? null) === 'invalid_integer'
  && ($errors['number_of_floors'] ?? null) === 'out_of_range'
  && ($errors['number_of_rooms'] ?? null) === 'out_of_range'
  && ($errors['estimated_residents'] ?? null) === 'out_of_range'
  && ($errors['current_occupancy'] ?? null) === 'out_of_range';
echo $ok ? 'OK' : 'BAD';
PHP
)"
assert_eq "property_lead_rejects_oversized_integer_fields" "$property_lead_integer_bounds" "OK"

property_lead_address_optional="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/property_leads.php';
$lead = property_lead_normalize([
  'contact_name' => 'Ama Owner',
  'contact_phone' => '0241234567',
  'property_name' => 'North Gate Hostel',
  'country' => 'Ghana',
  'region' => 'Ashanti',
  'town' => 'Kumasi',
  'digital_address' => 'AK-000-0000',
]);
$errors = property_lead_validate($lead);
echo array_key_exists('address', $errors) ? 'BAD' : 'OK';
PHP
)"
assert_eq "property_lead_address_is_optional" "$property_lead_address_optional" "OK"

property_lead_metadata_server_only="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/property_leads.php';
$lead = property_lead_normalize([
  'contact_name' => 'Ama Owner',
  'contact_phone' => '0241234567',
  'property_name' => 'North Gate Hostel',
  'country' => 'Ghana',
  'region' => 'Ashanti',
  'town' => 'Kumasi',
  'ip' => '203.0.113.99',
  'referrer' => 'https://attacker.example/form',
  'user_agent' => 'spoofed-agent',
]);
$ok = ($lead['ip'] ?? null) === null
  && ($lead['referrer'] ?? null) === null
  && ($lead['user_agent'] ?? null) === null;
echo $ok ? 'OK' : 'BAD';
PHP
)"
assert_eq "property_lead_metadata_not_accepted_from_form_input" "$property_lead_metadata_server_only" "OK"

db_preserves_existing_global_pdo="$(php_run <<'PHP'
<?php
putenv('DB_DSN=mysql:host=invalid.invalid;dbname=should_not_connect');
putenv('DB_USER=bad');
putenv('DB_PASS=bad');
$pdo = new PDO('sqlite::memory:');
$GLOBALS['PDO'] = $pdo;
require getcwd() . '/pay-portal/lib/db.php';
echo isset($GLOBALS['PDO']) && $GLOBALS['PDO'] === $pdo ? 'OK' : 'BAD';
PHP
)"
assert_eq "db_php_preserves_explicit_global_pdo" "$db_preserves_existing_global_pdo" "OK"
assert_contains "owner_auth_uses_owner_session" "$owner_auth_content" "session_name('nister_owner')"
assert_contains "owner_auth_sets_noindex" "$owner_auth_content" "noindex, nofollow"
assert_contains "owner_auth_defines_boot" "$owner_auth_content" "function owner_boot(): array"
assert_contains "owner_auth_defines_require_approved" "$owner_auth_content" "function owner_require_approved(bool \$json = false): void"
assert_contains "owner_auth_login_regenerates_session" "$owner_auth_content" "session_regenerate_id(true)"
assert_contains "owner_auth_uses_lax_samesite" "$owner_auth_content" "'samesite' => 'Lax'"
assert_contains "owner_otp_uses_owner_challenges" "$owner_otp_content" "owner_otp_challenges"
assert_not_contains "owner_otp_never_uses_signup_otp_tables" "$owner_otp_content" "signup_otp_"
assert_contains "owner_login_page_calls_owner_do_login" "$owner_login_content" "owner_do_login("
assert_contains "owner_do_login_starts_owner_session" "$owner_do_login_block" "owner_start_session_for_owner("
assert_contains "owner_start_session_regenerates_owner_session" "$owner_start_session_block" "session_regenerate_id(true)"
assert_contains "owner_register_page_calls_lead_conversion" "$owner_register_content" "property_owner_convert_lead_after_otp("
assert_contains "owner_conversion_starts_owner_session" "$owner_convert_lead_block" "owner_start_session_for_owner("
assert_contains "owner_logout_posts_only" "$owner_logout_content" "REQUEST_METHOD'] === 'POST'"
assert_contains "owner_logout_requires_owner_csrf" "$owner_logout_content" "owner_require_csrf_post()"
assert_contains "owner_logout_destroys_owner_session" "$owner_logout_content" "owner_logout()"
assert_contains "property_requests_defines_statuses" "$property_requests_content" "function property_request_statuses(): array"
assert_contains "property_requests_owner_statuses_pending_approved_suspended" "$property_requests_content" "return ['pending', 'approved', 'suspended'];"
assert_not_contains "property_requests_no_rejected_owner_status" "$property_request_owner_statuses_block" "rejected"
assert_not_contains "property_requests_no_rejected_owner_list_entry" "$property_requests_content" "return ['pending', 'approved', 'suspended', 'rejected']"
assert_contains "property_requests_full_crm_statuses" "$property_requests_content" "submitted','contacted','qualified','site_survey_required','site_survey_scheduled','site_survey_completed','quote_prepared','quote_sent','negotiating','approved','agreement_signed','equipment_pending','installation_scheduled','installing','testing','active','rejected','lost"
assert_contains "property_requests_owner_edits_only_submitted" "$property_requests_content" "return ['submitted'];"
assert_contains "property_requests_submitted_transition_matrix" "$property_requests_content" "'submitted' => ['contacted', 'rejected', 'lost']"
assert_contains "property_requests_contacted_transition_matrix" "$property_requests_content" "'contacted' => ['qualified', 'rejected', 'lost']"
assert_contains "property_requests_terminal_rejected_not_transitioned" "$property_requests_content" "'rejected' => []"
assert_contains "property_requests_terminal_active_not_transitioned" "$property_requests_content" "'active' => []"
assert_contains "property_requests_conversion_transaction" "$property_requests_content" "beginTransaction()"
assert_contains "property_requests_conversion_starts_owner_session" "$property_requests_content$owner_auth_content" "owner_start_session_for_owner"
assert_contains "owner_lead_noindex_helper" "$owner_lead_content" "owner_noindex_headers()"
assert_contains "owner_register_noindex_helper" "$owner_register_content" "owner_noindex_headers()"
assert_contains "owner_login_noindex_helper" "$owner_login_content" "owner_noindex_headers()"
assert_contains "owner_logout_noindex_helper" "$owner_logout_content" "owner_noindex_headers()"
assert_contains "owner_dashboard_route_exists" "$owner_dashboard_content" "owner_require_login()"
assert_contains "owner_dashboard_noindex_helper" "$owner_dashboard_content" "owner_noindex_headers()"
assert_contains "owner_dashboard_uses_current_owner" "$owner_dashboard_content" "owner_current()"
assert_contains "owner_dashboard_lists_service_requests" "$owner_dashboard_content" "property_request_list_for_owner("
assert_contains "owner_dashboard_pending_state_content" "$owner_dashboard_content" "Your request is with Nister"
assert_contains "owner_dashboard_approved_state_content" "$owner_dashboard_content" "Your property at a glance"
assert_contains "owner_dashboard_suspended_state_content" "$owner_dashboard_content" "Your owner account is suspended"
assert_contains "owner_dashboard_has_pending_branch" "$owner_dashboard_content" "ownerStatus === 'pending'"
assert_contains "owner_dashboard_has_approved_branch" "$owner_dashboard_content" "ownerStatus === 'approved'"
assert_contains "owner_dashboard_pending_request_list_label" "$owner_dashboard_content" "Request list"
assert_contains "owner_dashboard_approved_my_hostel" "$owner_dashboard_content" "My Hostel"
assert_contains "owner_dashboard_approved_network_online" "$owner_dashboard_content" "Network online"
assert_contains "owner_dashboard_approved_connected_users" "$owner_dashboard_content" "Connected Users"
assert_contains "owner_dashboard_approved_revenue_this_month" "$owner_dashboard_content" "Revenue This Month"
assert_contains "owner_dashboard_approved_owner_share" "$owner_dashboard_content" "Your Share"
assert_contains "owner_dashboard_approved_transactions" "$owner_dashboard_content" "Transactions"
assert_contains "owner_requests_route_requires_owner" "$owner_requests_content" "owner_require_login()"
assert_contains "owner_requests_uses_create_for_owner" "$owner_requests_content" "property_request_create_for_owner("
assert_contains "owner_requests_uses_update_by_owner" "$owner_requests_content" "property_request_update_by_owner("
assert_contains "owner_requests_uses_editable_status_gate" "$owner_requests_content" "property_request_owner_editable_statuses()"
assert_contains "owner_api_requires_json_owner_session" "$owner_api_content" "owner_require_login(true)"
assert_contains "owner_api_rejects_non_post_mutations" "$owner_api_content" "owner_api_require_post()"
assert_contains "owner_api_requires_same_origin_post" "$owner_api_content" "owner_require_same_origin_post()"
assert_contains "owner_api_requires_owner_csrf" "$owner_api_content" "owner_require_csrf_post()"
assert_contains "owner_api_profile_update_action" "$owner_api_content" "profile_update"
assert_contains "owner_api_request_create_action" "$owner_api_content" "request_create"
assert_contains "owner_api_request_update_action" "$owner_api_content" "request_update"
assert_contains "owner_profile_update_field_helper" "$property_requests_content" "function property_owner_profile_update_fields(): array"
assert_contains "owner_profile_update_only_display_name" "$property_requests_content" "return ['display_name'];"
assert_contains "owner_request_mutation_field_helper" "$property_requests_content" "function property_request_owner_mutation_fields(): array"
assert_contains "owner_request_rejects_forbidden_fields_helper" "$property_requests_content" "function property_request_reject_forbidden_owner_fields"
assert_contains "owner_request_forbidden_status" "$property_requests_content" "'status'"
assert_contains "owner_request_forbidden_admin_notes" "$property_requests_content" "'admin_notes'"
assert_contains "owner_request_forbidden_owner_id" "$property_requests_content" "'owner_id'"
assert_contains "owner_request_forbidden_property_id" "$property_requests_content" "'converted_property_id'"
assert_contains "owner_request_forbidden_financial_terms" "$property_requests_content" "'financial_terms_id'"
assert_contains "owner_request_forbidden_allocation" "$property_requests_content" "'allocation_id'"
assert_not_contains "owner_login_no_future_task_copy" "$owner_login_content" "Task 5"
assert_not_contains "owner_login_no_after_approval_placeholder_copy" "$owner_login_content" "after approval features are added"
assert_owner_pages_each_noindex "owner_pages_are_noindex"

owner_auth_runtime="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/owner_auth.php';
$_SERVER = ['HTTPS' => 'on', 'REQUEST_METHOD' => 'GET'];
owner_boot();
$token = owner_csrf_token();
$rotated = owner_csrf_token(true);
$ok = session_name() === 'nister_owner'
  && $token !== ''
  && $rotated !== ''
  && $token !== $rotated
  && owner_verify_csrf($rotated);
owner_logout();
echo $ok ? 'OK' : 'BAD';
PHP
)"
assert_eq "owner_auth_runtime_session_and_csrf" "$owner_auth_runtime" "OK"

property_requests_runtime="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/property_requests.php';
$ownerStatuses = property_request_statuses();
$transitions = property_request_allowed_transitions();
$crm = property_service_request_statuses();
$ownerEdit = property_request_owner_editable_statuses();
$ok = $ownerStatuses === ['pending', 'approved', 'suspended']
  && $ownerEdit === ['submitted']
  && in_array('submitted', $crm, true)
  && in_array('site_survey_required', $crm, true)
  && in_array('active', $crm, true)
  && in_array('rejected', $crm, true)
  && in_array('lost', $crm, true)
  && !in_array('rejected', $ownerStatuses, true)
  && ($transitions['submitted'] ?? []) === ['contacted', 'rejected', 'lost']
  && ($transitions['contacted'] ?? []) === ['qualified', 'rejected', 'lost']
  && ($transitions['site_survey_scheduled'] ?? []) === ['site_survey_completed', 'rejected', 'lost']
  && ($transitions['active'] ?? []) === []
  && ($transitions['rejected'] ?? []) === []
  && ($transitions['lost'] ?? []) === [];
echo $ok ? 'OK' : 'BAD';
PHP
)"
assert_eq "property_requests_runtime_status_contracts" "$property_requests_runtime" "OK"

property_requests_owner_mutation_contracts="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/property_requests.php';
$profile = property_owner_profile_update_fields();
$request = property_request_owner_mutation_fields();
$forbidden = property_request_forbidden_owner_fields();
$expected = [
  'property_name',
  'country',
  'region',
  'town',
  'address',
  'digital_address',
  'google_maps_url',
  'nearby_campus',
  'contact_name',
  'contact_phone',
  'contact_whatsapp',
  'contact_email',
  'number_of_buildings',
  'number_of_floors',
  'number_of_rooms',
  'estimated_residents',
  'current_occupancy',
  'has_wifi',
  'current_provider',
  'connection_type',
  'current_monthly_cost',
  'current_speed',
  'poor_coverage',
  'slow_internet',
  'downtime',
  'payment_problem',
  'user_management_problem',
  'shared_password_problem',
  'starting_from_scratch',
  'deployment_preference',
  'notes',
];
$ok = $profile === ['display_name']
  && $request === $expected
  && !in_array('status', $request, true)
  && !in_array('admin_notes', $request, true)
  && !in_array('owner_id', $request, true)
  && !in_array('converted_property_id', $request, true)
  && in_array('status', $forbidden, true)
  && in_array('admin_notes', $forbidden, true)
  && in_array('owner_id', $forbidden, true)
  && in_array('converted_property_id', $forbidden, true)
  && in_array('financial_terms_id', $forbidden, true)
  && in_array('allocation_id', $forbidden, true);
echo $ok ? 'OK' : 'BAD';
PHP
)"
assert_eq "property_requests_owner_mutation_contracts" "$property_requests_owner_mutation_contracts" "OK"
assert_contains "admin_auth_noindex_helper" "$admin_auth_content" "function admin_noindex_headers(): void"
assert_contains "admin_login_calls_noindex" "$admin_login_content" "admin_noindex_headers()"
assert_contains "admin_index_calls_noindex" "$admin_index_owner_content" "admin_noindex_headers()"
assert_contains "admin_api_requires_property_requests" "$admin_api_owner_content" "property_requests.php"
assert_contains "admin_api_requires_property_revenue" "$admin_api_owner_content" "property_revenue.php"
assert_contains "admin_api_property_lead_list_case" "$admin_api_owner_content" "case 'property_lead_list'"
assert_contains "admin_api_property_lead_update_case" "$admin_api_owner_content" "case 'property_lead_update'"
assert_contains "admin_api_owner_list_case" "$admin_api_owner_content" "case 'owner_list'"
assert_contains "admin_api_owner_decision_case" "$admin_api_owner_content" "case 'owner_decision'"
assert_contains "admin_api_service_request_list_case" "$admin_api_owner_content" "case 'service_request_list'"
assert_contains "admin_api_service_request_decision_case" "$admin_api_owner_content" "case 'service_request_decision'"
assert_contains "admin_api_service_request_convert_property_case" "$admin_api_owner_content" "case 'service_request_convert_property'"
assert_contains "admin_api_property_save_case" "$admin_api_owner_content" "case 'property_save'"
assert_contains "admin_api_property_membership_save_case" "$admin_api_owner_content" "case 'property_membership_save'"
assert_contains "admin_api_property_location_link_save_case" "$admin_api_owner_content" "case 'property_location_link_save'"
assert_contains "admin_api_property_terms_save_case" "$admin_api_owner_content" "case 'property_terms_save'"
assert_contains "admin_api_property_allocations_run_case" "$admin_api_owner_content" "case 'property_allocations_run'"
assert_contains "admin_api_property_allocations_list_case" "$admin_api_owner_content" "case 'property_allocations_list'"
assert_contains "admin_ui_owner_platform_section" "$admin_index_owner_content" "id=\"section-owners\""
assert_contains "admin_ui_owner_platform_menu" "$admin_index_owner_content" "data-section=\"owners\""
assert_contains "admin_ui_owner_platform_loader" "$admin_index_owner_content" "loadOwnerPlatform()"
assert_contains "property_requests_admin_owner_list" "$property_requests_content" "function property_owner_list(PDO \$pdo): array"
assert_contains "property_requests_admin_owner_status" "$property_requests_content" "function property_owner_set_status(PDO \$pdo, int \$ownerId, string \$newStatus, string \$adminUser, string \$note, string \$ip = ''): array"
assert_contains "property_requests_admin_lead_list" "$property_requests_content" "function property_lead_admin_list(PDO \$pdo, array \$filters = []): array"
assert_contains "property_requests_admin_lead_update" "$property_requests_content" "function property_lead_admin_update(PDO \$pdo, int \$leadId, array \$in, string \$adminUser): array"
assert_contains "property_requests_admin_request_list" "$property_requests_content" "function property_request_admin_list(PDO \$pdo, array \$filters = []): array"
assert_contains "property_requests_admin_transition" "$property_requests_content" "function property_request_admin_transition(PDO \$pdo, int \$requestId, string \$newStatus, string \$adminUser, string \$note, string \$ip = ''): array"
assert_contains "property_requests_admin_convert_property" "$property_requests_content" "function property_request_convert_to_property(PDO \$pdo, int \$requestId, array \$propertyInput, string \$adminUser, string \$note = '', string \$ip = ''): array"
assert_contains "property_requests_owner_status_audit_insert" "$property_requests_content" "INSERT INTO property_owner_status_events"
assert_contains "property_requests_service_status_audit_insert" "$property_requests_content" "INSERT INTO property_service_request_events"
assert_contains "property_revenue_property_save" "$property_revenue_content" "function property_save(PDO \$pdo, array \$in, string \$adminUser): array"
assert_contains "property_revenue_membership_save" "$property_revenue_content" "function property_membership_save(PDO \$pdo, array \$in, string \$adminUser): array"
assert_contains "property_revenue_location_link_save" "$property_revenue_content" "function property_location_link_save(PDO \$pdo, array \$in, string \$adminUser): array"
assert_contains "property_revenue_terms_save" "$property_revenue_content" "function property_terms_save(PDO \$pdo, array \$in, string \$adminUser): array"
assert_contains "property_revenue_admin_list" "$property_revenue_content" "function property_list_for_admin(PDO \$pdo): array"
assert_contains "property_revenue_terms_validates_share_bps" "$property_revenue_content" "owner_share_bps"
assert_contains "property_revenue_terms_validates_recurring_none" "$property_revenue_content" "recurring_fee_period='none'"
assert_contains "property_revenue_rejects_location_overlap" "$property_revenue_content" "property_location_link_overlap"
assert_contains "property_revenue_rejects_terms_overlap" "$property_revenue_content" "property_terms_overlap"
assert_contains "property_revenue_has_reconciler_entrypoint" "$property_revenue_content" "property_allocation_reconcile"
assert_contains "property_revenue_reconciler_signature" "$property_revenue_content" "function property_allocation_reconcile(PDO \$pdo, int \$limit = 100): array"
assert_contains "property_revenue_allocation_purchase_function" "$property_revenue_content" "function property_allocation_allocate_purchase(PDO \$pdo, array \$purchase): array"
assert_contains "property_revenue_allocation_attempt_function" "$property_revenue_content" "function property_allocation_record_attempt(PDO \$pdo, int \$purchaseId, ?int \$locationId, ?int \$propertyId, string \$status, string \$reason, string \$detail = '', ?int \$allocationId = null): void"
assert_contains "property_revenue_scans_applied_purchases" "$property_revenue_content" "p.status = 'applied'"
assert_contains "property_revenue_uses_purchase_location" "$property_revenue_content" "p.location_id"
assert_contains "property_revenue_writes_allocations" "$property_revenue_content" "property_transaction_allocations"
assert_contains "property_revenue_writes_attempts" "$property_revenue_content" "property_allocation_attempts"
assert_contains "property_revenue_stores_resident_hash" "$property_revenue_content" "msisdn_hash"
assert_contains "property_revenue_stores_resident_mask" "$property_revenue_content" "msisdn_masked"
assert_contains "property_revenue_integer_split_math" "$property_revenue_content" "intdiv(\$grossCents * \$ownerShareBps, 10000)"
assert_contains "property_revenue_missing_purchase_location_reason" "$property_revenue_content" "missing_purchase_location"
assert_contains "property_revenue_missing_amount_reason" "$property_revenue_content" "missing_purchase_amount"
assert_contains "property_revenue_missing_link_reason" "$property_revenue_content" "missing_property_link"
assert_contains "property_revenue_ambiguous_link_reason" "$property_revenue_content" "ambiguous_property_link"
assert_contains "property_revenue_missing_terms_reason" "$property_revenue_content" "missing_financial_terms"
assert_contains "property_revenue_ambiguous_terms_reason" "$property_revenue_content" "ambiguous_financial_terms"
assert_contains "property_revenue_setup_error_reason" "$property_revenue_content" "setup_error"
assert_contains "property_revenue_unexpected_error_reason" "$property_revenue_content" "unexpected_error"
assert_contains "property_revenue_zero_gross_skipped" "$property_revenue_content" "zero_gross_amount"
assert_contains "property_revenue_purchase_not_applied_skipped" "$property_revenue_content" "purchase_not_applied"
assert_contains "property_revenue_existing_allocation_skipped" "$property_revenue_content" "existing_allocation"
assert_contains "property_allocation_cron_requires_token" "$property_allocation_cron_content" "nister_require_cli_or_token(\$ENV)"
assert_contains "property_allocation_cron_calls_reconcile" "$property_allocation_cron_content" "property_allocation_reconcile"
assert_contains "property_allocation_service_execstart" "$property_allocation_service_content" "ExecStart=/usr/bin/php /srv/nister-wisp-repo/pay-portal/cron/property_allocation_reconcile.php"
assert_contains "property_allocation_timer_onboot" "$property_allocation_timer_content" "OnBootSec=2min"
assert_contains "property_allocation_timer_interval" "$property_allocation_timer_content" "OnUnitActiveSec=2min"
assert_contains "property_allocation_timer_accuracy" "$property_allocation_timer_content" "AccuracySec=15s"
assert_contains "property_allocation_timer_persistent" "$property_allocation_timer_content" "Persistent=true"
assert_contains "owner_revenue_route_requires_owner" "$owner_revenue_content" "owner_require_login()"
assert_contains "owner_revenue_route_requires_approval" "$owner_revenue_content" "owner_require_approved()"
assert_contains "owner_revenue_route_noindex" "$owner_revenue_content" "owner_noindex_headers()"
assert_contains "owner_revenue_uses_summary_function" "$owner_revenue_content" "property_revenue_summary_for_owner("
assert_contains "owner_revenue_gross_label" "$owner_revenue_content" "Gross Resident Purchases"
assert_contains "owner_revenue_owner_share_label" "$owner_revenue_content" "Your Share"
assert_contains "owner_revenue_nister_share_label" "$owner_revenue_content" "Nister Share"
assert_contains "owner_revenue_reporting_period_label" "$owner_revenue_content" "Reporting Period"
assert_contains "owner_transactions_route_requires_owner" "$owner_transactions_content" "owner_require_login()"
assert_contains "owner_transactions_route_requires_approval" "$owner_transactions_content" "owner_require_approved()"
assert_contains "owner_transactions_route_noindex" "$owner_transactions_content" "owner_noindex_headers()"
assert_contains "owner_transactions_uses_read_function" "$owner_transactions_content" "property_transactions_for_owner("
assert_contains "owner_transactions_uses_masked_resident" "$owner_transactions_content" "msisdn_masked"
assert_contains "owner_transactions_gross_label" "$owner_transactions_content" "Gross Resident Purchases"
assert_contains "owner_transactions_owner_share_label" "$owner_transactions_content" "Your Share"
assert_contains "owner_transactions_list_label" "$owner_transactions_content" "Transactions"
assert_contains "owner_dashboard_uses_revenue_summary_function" "$owner_dashboard_content" "property_revenue_summary_for_owner("
assert_not_contains "owner_dashboard_no_raw_allocation_query" "$owner_dashboard_content" "FROM property_transaction_allocations"
assert_not_contains "owner_revenue_no_raw_allocation_query" "$owner_revenue_content" "FROM property_transaction_allocations"
assert_not_contains "owner_transactions_no_raw_allocation_query" "$owner_transactions_content" "FROM property_transaction_allocations"
assert_not_contains "owner_transactions_no_resident_hash_display" "$owner_transactions_content" "msisdn_hash"
assert_not_contains "purchase_has_no_owner_allocation_hook" "$purchase_content" "property_allocation"
assert_not_contains "purchase_has_no_owner_revenue_include" "$purchase_content" "property_revenue.php"

plans_radius_content="$(cat pay-portal/lib/plans_radius.php)"
purchase_content="$(cat pay-portal/purchase.php)"
auto_renew_content="$(cat pay-portal/auto_renew.php)"
auto_renew_cron_content="$(cat pay-portal/cron/auto_renew.php)"
admin_api_content="$(cat pay-portal/admin/api.php)"
admin_index_content="$(cat pay-portal/admin/index.php)"
assert_contains "plan_active_helper_exists" "$plans_radius_content" 'function radius_plan_is_active(?array $p): bool'
assert_contains "purchase_blocks_inactive_plans" "$purchase_content" "error'=>'plan_inactive'"
assert_contains "auto_renew_blocks_inactive_plans" "$auto_renew_content" "'error'=>'plan_inactive'"
assert_contains "auto_renew_cron_marks_inactive_plan" "$auto_renew_cron_content" "auto_renew_mark_attempt(\$msisdn, 'plan_inactive')"
assert_contains "admin_apply_blocks_inactive_plans" "$admin_api_content" "'error'=>'plan_inactive'"
assert_contains "admin_promo_ui_has_plan_access" "$admin_index_content" '<option value="plan">Plan access</option>'
assert_contains "admin_promo_ui_sends_plan_code" "$admin_index_content" 'const plan_code = toolValue('
assert_contains "admin_promo_ui_plan_skips_expiry_requirement" "$admin_index_content" "kind !== 'plan' && !expires_at && !days"
assert_contains "admin_promo_ui_requires_plan_code" "$admin_index_content" 'Plan access promo requires an active plan code.'
assert_contains "admin_promo_options_populated_from_active_plans" "$admin_index_content" 'function populatePromoPlanOptions(plansOrGroups)'
assert_contains "admin_promo_ui_hides_irrelevant_fields" "$admin_index_content" 'function updatePromoKindFields()'
assert_contains "admin_promo_ui_hides_plan_expiry_fields" "$admin_index_content" "setVisible('promo_expires_at', kind !== 'plan')"
assert_contains "admin_api_accepts_plan_promo" "$admin_api_content" "['wallet','data','plan']"
assert_contains "admin_api_rejects_past_promo_expiry" "$admin_api_content" "'error'=>'expiry_in_past'"
assert_contains "admin_api_plan_promo_requires_active_plan" "$admin_api_content" "Choose a current plan before running plan access promo"
assert_contains "admin_api_plan_promo_uses_purchase_entitlement" "$admin_api_content" 'function promo_current_purchase_expiry'
assert_contains "admin_api_plan_promo_does_not_trust_radius_expiry" "$admin_api_content" 'SELECT MAX(expires_at) FROM purchases'
assert_contains "admin_api_plan_promo_creates_zero_cost_purchase" "$admin_api_content" "\$add('price_cents', 0)"
assert_contains "admin_api_plan_promo_clears_legacy_caps" "$admin_api_content" "attribute IN ('Nister-Quota-Bytes','Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')"
assert_contains "admin_api_plan_promo_keeps_canonical_device_limit" "$admin_api_content" "radius_set_check(\$r, \$u, 'Simultaneous-Use', ':=', radius_simultaneous_use_limit())"
assert_not_contains "admin_api_plan_promo_never_sets_per_user_rate_reply" "$admin_api_content" "radius_set_reply(\$r, \$u, 'Mikrotik-Rate-Limit', ':=', \$rateLimit)"
assert_contains "admin_api_promo_targets_remain_strings" "$admin_api_content" "array_map('strval', array_keys(\$out))"
assert_contains "admin_api_plan_promo_casts_target_msisdn" "$admin_api_content" "\$msisdn = (string)\$msisdn;"

scope_block="$(awk '/function admin_user_scope_check/,/function admin_emit_scope_error/' pay-portal/admin/api.php)"
assert_not_contains "admin_scope_check_no_profile_side_effect" "$scope_block" "location_profile_set"

location_filter_block="$(awk '/function location_filter_msisdns/,/^}/' pay-portal/lib/location.php)"
assert_not_contains "location_filter_no_unbound_default_fallback" "$location_filter_block" 'if ($isDefault)'

router_discovery_identity="$(php_run <<'PHP'
<?php
putenv('DB_DSN=sqlite::memory:');
putenv('DB_USER=test');
putenv('DB_PASS=test');
require getcwd() . '/pay-portal/lib/location.php';
$a = location_router_discovery_identity_key([
  'nas_ip' => '10.16.0.5',
  'router_ip_hint' => '10.10.20.2',
  'host_ip' => '10.16.0.1',
]);
$b = location_router_discovery_identity_key([
  'nas_ip' => '10.16.0.5',
  'router_ip_hint' => '10.10.99.2',
  'host_ip' => '10.16.0.254',
]);
$c = location_router_discovery_identity_key([
  'nas_ip' => '10.16.0.6',
  'router_ip_hint' => '10.10.20.2',
  'host_ip' => '10.16.0.1',
]);
echo ($a === $b && $a !== $c) ? 'OK' : 'BAD';
PHP
)"
assert_eq "router_discovery_identity_uses_stable_nas" "$router_discovery_identity" "OK"

location_discovery_content="$(cat pay-portal/lib/location.php)"
assert_contains "location_discovery_reconciles_assigned_rows" "$location_discovery_content" "Legacy rows may have been assigned before a complete router map existed."
assert_contains "location_discovery_unassigned_hides_known_maps" "$location_discovery_content" "AND NOT EXISTS ("

netflow_setup_content="$(cat nister_netflow_setup.sh)"
assert_not_contains "netflow_setup_no_source_exec" "$netflow_setup_content" 'source "$ENV_FILE"'
assert_contains "netflow_setup_checks_gid" "$netflow_setup_content" 'file_gid()'
assert_contains "netflow_setup_secure_file_check" "$netflow_setup_content" 'env_file_is_secure()'
assert_not_contains "netflow_setup_no_hup_kill" "$netflow_setup_content" 'kill -s HUP nister-nfcapd.service'
assert_contains "netflow_setup_retention_cron" "$netflow_setup_content" 'RETENTION_CRON_FILE='
assert_contains "netflow_setup_installs_drive_archive_script" "$netflow_setup_content" 'ARCHIVE_SCRIPT_SRC="$REPO_DIR/ops/netflow_archive_to_drive.php"'
assert_contains "netflow_setup_enables_drive_archive_timer" "$netflow_setup_content" 'systemctl enable --now nister-netflow-archive.timer'

drive_archive_content="$(cat pay-portal/lib/google_drive_archive.php pay-portal/admin/api.php pay-portal/admin/google_drive_callback.php ops/netflow_archive_to_drive.php)"
assert_contains "drive_archive_uses_admin_oauth_cookie_state" "$drive_archive_content" 'nister_drive_oauth_state'
assert_contains "drive_archive_uses_google_consent" "$drive_archive_content" 'https://accounts.google.com/o/oauth2/v2/auth'
assert_contains "drive_archive_verifies_uploaded_file" "$drive_archive_content" 'gdrive_verify_uploaded_file'
assert_contains "drive_archive_blocks_delete_without_existing_verify" "$drive_archive_content" 'existing_drive_file_verification_failed'
assert_contains "drive_archive_deletes_after_verified_upload_only" "$drive_archive_content" 'local_delete_failed_after_verified_upload'
assert_not_contains "drive_archive_no_terminal_only_rclone" "$drive_archive_content" 'rclone'

health_content="$(cat pay-portal/lib/health.php pay-portal/cron/health_check.php pay-portal/admin/index.php)"
assert_contains "health_records_disk_used_pct" "$health_content" 'disk_used_pct'
assert_contains "health_records_disk_free_bytes" "$health_content" 'disk_free_bytes'
assert_contains "health_inserts_disk_alerts" "$health_content" 'health_update_disk_alert'
assert_contains "health_warns_before_disk_full" "$health_content" 'HEALTH_DISK_WARN_PCT'
assert_contains "admin_overview_shows_disk_kpi" "$health_content" 'id="health_disk"'
assert_contains "health_radius_skip_is_unknown" "$health_content" '$radiusOk = null;'
assert_contains "health_failures_are_debounced" "$health_content" 'HEALTH_FAIL_CONSECUTIVE'
assert_contains "health_recovery_is_debounced" "$health_content" 'HEALTH_RECOVER_CONSECUTIVE'
assert_not_contains "health_disk_critical_not_network_overall_fail" "$health_content" 'if (($disk['"'"'disk_status'"'"'] ?? '"'"''"'"') === '"'"'critical'"'"') $overallOk = 0;'

tunnel_watchdog_content="$(cat nister_tunnel_watchdog.sh)"
assert_not_contains "watchdog_no_source_exec" "$tunnel_watchdog_content" 'source "$STATE_FILE"'
assert_contains "watchdog_atomic_state_write" "$tunnel_watchdog_content" 'write_state_file_atomic()'

starlink_sync_content="$(cat nister_radius_starlink_sync.sh)"
assert_contains "starlink_sync_adopt_failure_exits" "$starlink_sync_content" 'reason=adopt_unknown_failed'
assert_contains "starlink_sync_restart_failure_visible" "$starlink_sync_content" 'action=restart_after_update'

session_limit_value="$(php_run <<'PHP'
<?php
require getcwd() . '/pay-portal/lib/radius.php';
echo radius_simultaneous_use_limit();
PHP
)"
assert_eq "radius_session_limit_is_two" "$session_limit_value" "2"

signup_content="$(cat api/hotspot/signup.php)"
assert_contains "signup_session_limit_is_two" "$signup_content" '$SIMULTANEOUS_USE = 2;'
assert_not_contains "signup_session_limit_never_one" "$signup_content" '$SIMULTANEOUS_USE = 1;'
assert_not_contains "signup_session_limit_never_three" "$signup_content" '$SIMULTANEOUS_USE = 3;'

hotspot_errors_content="$(cat hotspot/errors.txt)"
assert_contains "hotspot_user_session_limit_mentions_two_devices" "$hotspot_errors_content" 'user-session-limit = This account is already active on 2 devices. Log out on one device and try again.'
assert_not_contains "hotspot_user_session_limit_no_one_device_copy" "$hotspot_errors_content" 'This account is already active on another device. Log out there and try again.'

user_auth_content="$(cat pay-portal/lib/user_auth.php)"
assert_contains "login_sync_uses_canonical_session_limit" "$user_auth_content" '$simVal = radius_simultaneous_use_limit();'
assert_not_contains "login_sync_never_preserves_stale_session_limit" "$user_auth_content" "WHERE username IN (\$ph) AND attribute='Simultaneous-Use'"
assert_not_contains "login_sync_never_falls_back_to_three" "$user_auth_content" '$simVal = '"'"'3'"'"';'

router_catchup_content="$(cat ops/router_catchup.sh)"
assert_contains "router_catchup_capport_url_configurable" "$router_catchup_content" 'CAPPORT_API_URL="${CAPPORT_API_URL:-https://wifi.nister.org/api.json?v=20260601-remote-refresh}"'
assert_contains "router_catchup_capport_url_sanitized" "$router_catchup_content" 'invalid CAPPORT_API_URL: unsafe RouterOS characters'
assert_contains "router_catchup_winbox_port_guardrail" "$router_catchup_content" 'WINBOX_PORT="${WINBOX_PORT:-8291}"'
assert_contains "router_catchup_winbox_firewall_guardrail" "$router_catchup_content" 'Allow Winbox from VPS over L2TP'
assert_contains "router_catchup_management_refresh_logged" "$router_catchup_content" 'action=management_refreshed'
assert_contains "router_catchup_enables_mac_cookie_login" "$router_catchup_content" 'login-by=mac-cookie,http-chap,https'
assert_contains "router_catchup_logs_hotspot_login_refresh" "$router_catchup_content" 'action=hotspot_login_refreshed'
assert_contains "router_catchup_refreshes_active_cookie_profile" "$router_catchup_content" ':if ($prof = "active") do={ /ip hotspot user profile set $ids shared-users=2 add-mac-cookie=yes mac-cookie-timeout=4w2d }'
assert_contains "router_catchup_zeroes_blocked_cookie_profiles" "$router_catchup_content" '"default";"limited";"nopaid"'
assert_contains "router_catchup_logs_user_profile_refresh" "$router_catchup_content" 'action=hotspot_user_profiles_refreshed'
assert_contains "router_catchup_enforces_two_shared_users" "$router_catchup_content" 'shared-users=2'
assert_not_contains "router_catchup_no_longer_enforces_one_shared_user" "$router_catchup_content" 'shared-users=1'
assert_not_contains "router_catchup_never_allows_three_shared_users" "$router_catchup_content" 'shared-users=3'
assert_contains "router_catchup_restores_anti_share_ttl" "$router_catchup_content" 'chain=postrouting action=change-ttl new-ttl=set:1 passthrough=no dst-address-list=HS_ACTIVE out-interface=bridge'
assert_contains "router_catchup_logs_anti_share_refresh" "$router_catchup_content" 'action=anti_share_refreshed'
assert_contains "router_catchup_ssh_server_alive" "$router_catchup_content" 'ServerAliveInterval'
assert_contains "router_catchup_parses_colon_uptime" "$router_catchup_content" '([0-9]+):([0-9]{2}):([0-9]{2})'
assert_contains "router_catchup_success_throttle_30m" "$router_catchup_content" 'MIN_SUCCESS_INTERVAL_SEC="${MIN_SUCCESS_INTERVAL_SEC:-1800}"'

ap_phy_guard_content="$(cat ops/install_ap_phy_guard.sh)"
assert_contains "ap_phy_guard_installs_named_script" "$ap_phy_guard_content" 'GUARD_NAME="${GUARD_NAME:-nister_ap_phy_guard}"'
assert_contains "ap_phy_guard_scoped_to_ether3" "$ap_phy_guard_content" ':local p "ether3";'
assert_contains "ap_phy_guard_scoped_to_ether4" "$ap_phy_guard_content" ':local p "ether4";'
assert_contains "ap_phy_guard_rate_limits_retries" "$ap_phy_guard_content" ':local maxFail 3;'
assert_contains "ap_phy_guard_uses_hold_cycles" "$ap_phy_guard_content" ':local holdCycles 6;'
assert_contains "ap_phy_guard_replaces_old_ether4_only_guard" "$ap_phy_guard_content" 'nister_ether4_phy_self_heal'
assert_not_contains "ap_phy_guard_must_not_touch_wan" "$ap_phy_guard_content" 'ether1'
assert_not_contains "ap_phy_guard_must_not_touch_l2tp" "$ap_phy_guard_content" 'l2tp-over-vps'
assert_not_contains "ap_phy_guard_must_not_touch_winbox" "$ap_phy_guard_content" '8291'

cookie_cleanup_content="$(cat ops/clear_hotspot_cookies.sh nister_quota_enforce.sh nister_user_admin.sh nister_set_policy_and_kick.sh pay-portal/lib/radius.php pay-portal/admin/api.php)"
assert_contains "hotspot_cookie_cleanup_helper_validates_users" "$cookie_cleanup_content" '^[0-9]{9,12}$'
assert_contains "hotspot_cookie_cleanup_removes_router_cookies" "$cookie_cleanup_content" '/ip hotspot cookie remove'
assert_contains "quota_enforce_clears_cookies_before_kick" "$cookie_cleanup_content" 'clear_hotspot_cookies'
assert_contains "admin_limited_paths_clear_cookies" "$cookie_cleanup_content" 'radius_clear_hotspot_cookies'
assert_contains "hotspot_cookie_cleanup_ssh_server_alive" "$cookie_cleanup_content" 'ServerAliveInterval'

paystack_content="$(cat pay-portal/lib/paystack.php pay-portal/paystack_webhook.php pay-portal/cron/paystack_reconcile.php pay-portal/admin/api.php pay-portal/admin/index.php)"
assert_contains "paystack_callback_defaults_https" "$paystack_content" "preg_match('/(^|\\.)nister\\.org$/i', \$host)"
assert_contains "paystack_webhook_validates_signature" "$paystack_content" 'paystack_verify_webhook_signature'
assert_contains "paystack_reconcile_closes_abandoned" "$paystack_content" "'failed', 'reversed', 'abandoned'"
assert_contains "paystack_reconcile_cron_exists" "$paystack_content" 'paystack_reconcile_pending($limit, $minAge)'
assert_contains "paystack_admin_reconciles_pending_list" "$paystack_content" 'paystack_reconcile_pending(3, 120)'
assert_contains "paystack_admin_uses_gateway_verification" "$paystack_content" "if (\$method === 'paystack')"
assert_contains "paystack_admin_ui_no_manual_approve" "$paystack_content" 'data-act="verify"'

winbox_check_content="$(cat ops/check_winbox_tunnel.sh)"
assert_contains "winbox_check_uses_winbox_port" "$winbox_check_content" 'WINBOX_PORT="${WINBOX_PORT:-8291}"'
assert_contains "winbox_check_documents_local_forward" "$winbox_check_content" '127.0.0.1:18291'
assert_not_contains "winbox_check_does_not_use_webfig_port" "$winbox_check_content" '8443:10.10.20.2:443'

set_policy_content="$(cat nister_set_policy_and_kick.sh)"
assert_contains "set_policy_group_validation_active" "$set_policy_content" 'validate_group_name HS_ACTIVE "$HS_ACTIVE"'

user_admin_content="$(cat nister_user_admin.sh)"
assert_contains "user_admin_group_validation_active" "$user_admin_content" 'validate_group_name HS_ACTIVE "$HS_ACTIVE"'

quota_enforce_content="$(cat nister_quota_enforce.sh)"
assert_contains "quota_enforce_group_validation_active" "$quota_enforce_content" 'validate_group_name HS_ACTIVE "$HS_ACTIVE"'
assert_contains "quota_enforce_broad_coa_fallback_off" "$quota_enforce_content" 'BROAD_COA_FALLBACK="${BROAD_COA_FALLBACK:-0}"'
assert_contains "quota_enforce_requires_strong_coa_match" "$quota_enforce_content" 'required=sid_and_ip_or_mac'
assert_contains "quota_enforce_zero_cap_limited_by_default" "$quota_enforce_content" 'ZERO_CAP_EXHAUST_ACTIVE="${ZERO_CAP_EXHAUST_ACTIVE:-1}"'
assert_contains "quota_enforce_invalid_zero_cap_override_falls_limited" "$quota_enforce_content" '[[ "$ZERO_CAP_EXHAUST_ACTIVE" =~ ^[01]$ ]] || ZERO_CAP_EXHAUST_ACTIVE=1'
assert_contains "quota_enforce_clears_legacy_zero_nister_quota" "$quota_enforce_content" "attribute IN ('Nister-Quota-Bytes','Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')"
assert_contains "quota_enforce_checks_current_purchase" "$quota_enforce_content" 'get_current_purchase_expiry_epoch()'
assert_contains "quota_enforce_purchase_extends_expiry_source" "$quota_enforce_content" 'PURCHASE_EXP_EPOCH="$(get_current_purchase_expiry_epoch)"'
assert_contains "quota_enforce_zero_cap_allows_current_purchase" "$quota_enforce_content" 'CURRENT_PURCHASE == 0'
assert_contains "quota_enforce_purchase_requires_applied_window" "$quota_enforce_content" "status='applied'"
assert_contains "quota_enforce_purchase_requires_unexpired_window" "$quota_enforce_content" 'AND expires_at > UTC_TIMESTAMP()'
assert_contains "quota_enforce_dedupes_duplicate_acct_sessions" "$quota_enforce_content" 'GROUP BY s.session_key, s.mac_key, s.ip_key'
assert_contains "quota_enforce_counts_largest_duplicate_session_counter" "$quota_enforce_content" 'MAX(s.sess_bytes) AS sess_bytes'
assert_contains "quota_enforce_sms_stamps_are_canonical" "$quota_enforce_content" 'SMS_STAMP="$(state_stamp_path "$USER" "sms_expiry_warn")"'
assert_contains "quota_enforce_sms_reserves_before_send" "$quota_enforce_content" 'if sms_reserve "$SMS_STAMP" "$NOW_EPOCH" "$SMS_DEBOUNCE_HOURS" "$TO"; then'
assert_contains "quota_enforce_state_files_shared_with_freerad" "$quota_enforce_content" 'chown freerad:freerad "$path"'
assert_contains "quota_enforce_sms_has_daily_cap" "$quota_enforce_content" 'SMS_DAILY_MAX_PER_USER'
assert_contains "quota_enforce_usage_peak_uses_shared_writer" "$quota_enforce_content" "state_write_shared \"\$file\" '%s\\t%s\\n'"
assert_contains "quota_enforce_already_limited_skips_repeat_kick" "$quota_enforce_content" 'LIMIT_SKIP user=$USER reason=already_limited'
assert_not_contains "quota_enforce_no_raw_user_sms_stamp" "$quota_enforce_content" 'SMS_STAMP="$STATE_DIR/${USER}.sms_expiry_warn"'
assert_not_contains "quota_enforce_no_sms_send_before_stamp_write" "$quota_enforce_content" 'echo "$NOW_EPOCH" >"$SMS_STAMP"'

account_queue_content="$(cat nister_account_queue_sync.sh)"
assert_contains "account_queue_sync_reads_hotspot_active" "$account_queue_content" '/ip hotspot active find'
assert_contains "account_queue_sync_uses_account_shaper_comment" "$account_queue_content" 'NISTER ACCOUNT SHAPER'
assert_contains "account_queue_sync_uses_plan_rate" "$account_queue_content" "Mikrotik-Rate-Limit"
assert_contains "account_queue_sync_repairs_radius_port_limit_two" "$account_queue_content" "'Port-Limit' AS attribute, ':=' AS op, '2' AS value"
assert_contains "account_queue_sync_maps_hs_active_to_active_profile" "$account_queue_content" "UNION ALL SELECT 'HS_ACTIVE', 'Mikrotik-Group', ':=', 'active'"
assert_contains "account_queue_sync_maps_hs_limited_to_limited_profile" "$account_queue_content" "UNION ALL SELECT 'HS_LIMITED', 'Mikrotik-Group', ':=', 'limited'"
assert_contains "account_queue_sync_maps_hs_nopaid_to_nopaid_profile" "$account_queue_content" "UNION ALL SELECT 'HS_NOPAID', 'Mikrotik-Group', ':=', 'nopaid'"
assert_contains "account_queue_sync_reads_location_plan_rate" "$account_queue_content" 'JOIN location_plans lp'
assert_contains "account_queue_sync_prefers_site_plan_rate" "$account_queue_content" 'JOIN user_location_profiles ulp'
assert_contains "account_queue_sync_groups_targets_per_account" "$account_queue_content" 'printf '\''%s\t%s\t%s\n'\'' "$user" "$targets" "$max_limit"'
assert_contains "account_queue_sync_sets_shared_simple_queue_limit" "$account_queue_content" 'max-limit=%s limit-at=0/0'
assert_contains "account_queue_sync_moves_queues_before_dynamic_hotspot_queues" "$account_queue_content" '/queue simple move $q 0'
assert_contains "account_queue_sync_suppresses_known_host_noise" "$account_queue_content" '-o LogLevel=ERROR'
account_queue_timer_content="$(cat systemd/nister-account-queue-sync.timer)"
assert_contains "account_queue_timer_runs_frequently" "$account_queue_timer_content" 'OnUnitActiveSec=20s'
account_queue_service_content="$(cat systemd/nister-account-queue-sync.service)"
assert_contains "account_queue_service_has_timeout" "$account_queue_service_content" 'TimeoutStartSec=25s'

radacct_cleanup_content="$(cat nister_radacct_cleanup.sh)"
assert_contains "radacct_cleanup_uses_ten_minute_default" "$radacct_cleanup_content" 'STALE_MINUTES="${STALE_MINUTES:-10}"'
assert_contains "radacct_cleanup_dedupes_by_canonical_account_device" "$radacct_cleanup_content" 'GROUP BY account_key, device_key'
assert_contains "radacct_cleanup_dedupes_username_variants" "$radacct_cleanup_content" "WHEN username REGEXP '^233[0-9]{9}$' THEN CONCAT('0', SUBSTRING(username,4))"
assert_contains "radacct_cleanup_dedupes_reconnect_session_ids" "$radacct_cleanup_content" 'session IDs, username variants, or NAS identities'
assert_contains "radacct_cleanup_does_not_group_duplicate_key_by_nas" "$radacct_cleanup_content" 'NAS-IP are intentionally not part of the primary device key'
radacct_cleanup_timer_content="$(cat systemd/nister-radacct-cleanup.timer)"
assert_contains "radacct_cleanup_timer_runs_every_five_minutes" "$radacct_cleanup_timer_content" 'OnUnitActiveSec=5m'
radacct_cleanup_service_content="$(cat systemd/nister-radacct-cleanup.service)"
assert_contains "radacct_cleanup_service_uses_ten_minute_stale_window" "$radacct_cleanup_service_content" 'Environment=STALE_MINUTES=10'

sim_use_patch_content="$(cat ops/freeradius_simultaneous_use_dedupe.sh)"
assert_contains "freeradius_sim_use_count_dedupes_devices" "$sim_use_patch_content" "WHEN callingstationid IS NOT NULL AND callingstationid <> '' THEN CONCAT('mac:', callingstationid)"
assert_contains "freeradius_sim_use_counts_username_variants" "$sim_use_patch_content" "username = CONCAT('233', SUBSTRING('%{SQL-User-Name}', 2))"
assert_contains "freeradius_sim_use_ignores_stale_open_rows" "$sim_use_patch_content" 'DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)'
assert_contains "freeradius_sim_use_counts_zero_datetime_as_open" "$sim_use_patch_content" "acctstoptime = '0000-00-00 00:00:00'"

radius_content="$(cat pay-portal/lib/radius.php)"
assert_not_contains "radius_disconnect_no_suffix_like" "$radius_content" 'username LIKE CONCAT'
assert_not_contains "radius_force_kick_no_blank_user" "$radius_content" "\$tryUsers[] = '';"
assert_contains "radius_force_kick_requires_fresh_session" "$radius_content" "'error'=>'no_fresh_session'"
assert_contains "topup_uses_canonical_session_limit" "$radius_content" "radius_set_check(\$r, \$u, 'Simultaneous-Use', ':=', radius_simultaneous_use_limit())"
assert_not_contains "topup_never_resets_session_limit_to_three" "$radius_content" "radius_set_check(\$r, \$u, 'Simultaneous-Use', ':=', '3')"
assert_contains "radius_reads_effective_rate_from_plan_metadata" "$radius_content" 'function nister_effective_rate_limit(PDO $r, array $users, ?string $group): string'
assert_contains "radius_rate_lookup_uses_location_plans" "$radius_content" 'FROM location_plans'
assert_contains "radius_apply_plan_deletes_per_user_rate_reply" "$radius_content" "DELETE FROM radreply WHERE username=:u AND attribute='Mikrotik-Rate-Limit'"
assert_not_contains "radius_apply_plan_never_sets_per_user_rate_reply" "$radius_content" "radius_set_reply(\$r, \$u, 'Mikrotik-Rate-Limit', ':=', \$rateLimit)"
assert_not_contains "radius_old_apply_plan_never_sets_per_user_rate_reply" "$radius_content" "radius_set_reply(\$r, \$__u, 'Mikrotik-Rate-Limit'"
assert_contains "radius_caps_expiry_carryover" "$radius_content" 'function nister_expiry_base_start(DateTimeImmutable $now, ?DateTimeImmutable $currentExpiry): DateTimeImmutable'
assert_contains "radius_expiry_carryover_default_zero_days" "$radius_content" 'return 0;'
assert_contains "radius_apply_plan_uses_capped_expiry_anchor" "$radius_content" '$baseStart = nister_expiry_base_start($now, $currExp);'
assert_contains "radius_zero_quota_not_exhausted_exact_status" "$radius_content" 'if ($quotaBytes !== null && $quotaBytes > 0) {'
assert_contains "radius_status_requires_current_purchase_or_positive_quota" "$radius_content" '$hasCurrentPurchase = nister_has_current_purchase($r, $targets, $now);'
assert_contains "radius_purchase_requires_activation_window" "$radius_content" 'AND (activated_at IS NULL OR activated_at <= ?)'
assert_contains "radius_purchase_requires_expiry_window" "$radius_content" 'AND expires_at > ?'
assert_not_contains "radius_no_future_expiry_active_fallback" "$radius_content" "\$hsGroup === 'HS_ACTIVE' && \$expiry instanceof DateTimeImmutable && \$expiry > \$now"
assert_not_contains "radius_never_marks_zero_quota_exhausted" "$radius_content" 'if ($quotaBytes <= 0) $exhaustedFlag = 1;'
assert_contains "radius_usage_dedupes_duplicate_acct_sessions" "$radius_content" 'GROUP BY q.session_key, q.mac_key, q.ip_key'
assert_contains "radius_usage_counts_largest_duplicate_session_counter" "$radius_content" 'MAX(q.sess_bytes) AS sess_bytes'

printf 'All regression tests passed (%d).\n' "$pass_count"
