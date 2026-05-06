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

status_without_token="$(php_run <<'PHP'
<?php
putenv('DB_DSN=sqlite::memory:');
putenv('DB_USER=test');
putenv('DB_PASS=test');
putenv('HOTSPOT_STATUS_TOKEN=regression-secret');
$_SERVER = [
  'REQUEST_METHOD' => 'GET',
  'HTTP_ORIGIN' => 'https://wifi.nister.org',
];
$_GET = ['username' => '233200000000'];
include getcwd() . '/pay-portal/hotspot-api/status.php';
PHP
)"
assert_contains "status_requires_token_even_for_trusted_origin" "$status_without_token" '"error":"forbidden"'

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

otp_send_http_origin="$(php_run <<'PHP'
<?php
$_SERVER = [
  'REQUEST_METHOD' => 'POST',
  'HTTP_ORIGIN' => 'http://wifi.nister.org',
];
$_POST = ['username' => '233200000000'];
include getcwd() . '/api/hotspot/otp_send.php';
PHP
)"
assert_contains "otp_send_rejects_http_origin" "$otp_send_http_origin" '"error":"origin_not_allowed"'

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

change_password_fallback="$(php_run <<'PHP'
<?php
$_SERVER = ['REQUEST_METHOD' => 'POST'];
$_POST = [
  'link_login_only' => 'javascript://wifi.nister.org/login',
];
include getcwd() . '/api/hotspot/change_password.php';
PHP
)"
assert_contains "change_password_falls_back_to_https_portal_base" "$change_password_fallback" "https://wifi.nister.org/change-password.html"
assert_not_contains "change_password_rejects_javascript_scheme" "$change_password_fallback" "javascript://wifi.nister.org"

scope_block="$(awk '/function admin_user_scope_check/,/function admin_emit_scope_error/' pay-portal/admin/api.php)"
assert_not_contains "admin_scope_check_no_profile_side_effect" "$scope_block" "location_profile_set"

location_filter_block="$(awk '/function location_filter_msisdns/,/^}/' pay-portal/lib/location.php)"
assert_not_contains "location_filter_no_unbound_default_fallback" "$location_filter_block" 'if ($isDefault)'

netflow_setup_content="$(cat nister_netflow_setup.sh)"
assert_not_contains "netflow_setup_no_source_exec" "$netflow_setup_content" 'source "$ENV_FILE"'
assert_contains "netflow_setup_checks_gid" "$netflow_setup_content" 'file_gid()'
assert_contains "netflow_setup_secure_file_check" "$netflow_setup_content" 'env_file_is_secure()'
assert_not_contains "netflow_setup_no_hup_kill" "$netflow_setup_content" 'kill -s HUP nister-nfcapd.service'
assert_contains "netflow_setup_retention_cron" "$netflow_setup_content" 'RETENTION_CRON_FILE='

tunnel_watchdog_content="$(cat nister_tunnel_watchdog.sh)"
assert_not_contains "watchdog_no_source_exec" "$tunnel_watchdog_content" 'source "$STATE_FILE"'
assert_contains "watchdog_atomic_state_write" "$tunnel_watchdog_content" 'write_state_file_atomic()'

set_policy_content="$(cat nister_set_policy_and_kick.sh)"
assert_contains "set_policy_group_validation_active" "$set_policy_content" 'validate_group_name HS_ACTIVE "$HS_ACTIVE"'

user_admin_content="$(cat nister_user_admin.sh)"
assert_contains "user_admin_group_validation_active" "$user_admin_content" 'validate_group_name HS_ACTIVE "$HS_ACTIVE"'

quota_enforce_content="$(cat nister_quota_enforce.sh)"
assert_contains "quota_enforce_group_validation_active" "$quota_enforce_content" 'validate_group_name HS_ACTIVE "$HS_ACTIVE"'

printf 'All regression tests passed (%d).\n' "$pass_count"
