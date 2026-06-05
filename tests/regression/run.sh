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
assert_contains "router_status_page_prefers_api_base" "$router_status_page_content" "var base = (apiOverride || safeCfg || 'https://api.nister.org')"
assert_contains "router_status_candidates_use_api_host" "$router_status_candidates_block" "'https://api.nister.org'"
assert_contains "router_status_candidates_keep_router_local_context" "$router_status_candidates_block" "sameOrigin"
assert_not_contains "router_status_candidates_do_not_use_pay_host" "$router_status_candidates_block" "pay.nister.org"
assert_not_contains "router_status_candidates_do_not_use_pay_base" "$router_status_candidates_block" "safePay"
assert_not_contains "router_status_must_not_default_to_pay_api" "$router_status_page_content" "var base = (apiOverride || safePay || 'https://pay.nister.org')"

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

tunnel_watchdog_content="$(cat nister_tunnel_watchdog.sh)"
assert_not_contains "watchdog_no_source_exec" "$tunnel_watchdog_content" 'source "$STATE_FILE"'
assert_contains "watchdog_atomic_state_write" "$tunnel_watchdog_content" 'write_state_file_atomic()'

starlink_sync_content="$(cat nister_radius_starlink_sync.sh)"
assert_contains "starlink_sync_adopt_failure_exits" "$starlink_sync_content" 'reason=adopt_unknown_failed'
assert_contains "starlink_sync_restart_failure_visible" "$starlink_sync_content" 'action=restart_after_update'

router_catchup_content="$(cat ops/router_catchup.sh)"
assert_contains "router_catchup_capport_url_configurable" "$router_catchup_content" 'CAPPORT_API_URL="${CAPPORT_API_URL:-https://wifi.nister.org/api.json?v=20260601-remote-refresh}"'
assert_contains "router_catchup_capport_url_sanitized" "$router_catchup_content" 'invalid CAPPORT_API_URL: unsafe RouterOS characters'
assert_contains "router_catchup_winbox_port_guardrail" "$router_catchup_content" 'WINBOX_PORT="${WINBOX_PORT:-8291}"'
assert_contains "router_catchup_winbox_firewall_guardrail" "$router_catchup_content" 'Allow Winbox from VPS over L2TP'
assert_contains "router_catchup_management_refresh_logged" "$router_catchup_content" 'action=management_refreshed'
assert_contains "router_catchup_enables_mac_cookie_login" "$router_catchup_content" 'login-by=mac-cookie,http-chap,https'
assert_contains "router_catchup_logs_hotspot_login_refresh" "$router_catchup_content" 'action=hotspot_login_refreshed'
assert_contains "router_catchup_refreshes_active_cookie_profile" "$router_catchup_content" 'name="active"] add-mac-cookie=yes mac-cookie-timeout=4w2d'
assert_contains "router_catchup_zeroes_blocked_cookie_profiles" "$router_catchup_content" '"default";"limited";"nopaid"'
assert_contains "router_catchup_logs_user_profile_refresh" "$router_catchup_content" 'action=hotspot_user_profiles_refreshed'

cookie_cleanup_content="$(cat ops/clear_hotspot_cookies.sh nister_quota_enforce.sh nister_user_admin.sh nister_set_policy_and_kick.sh pay-portal/lib/radius.php pay-portal/admin/api.php)"
assert_contains "hotspot_cookie_cleanup_helper_validates_users" "$cookie_cleanup_content" '^[0-9]{9,12}$'
assert_contains "hotspot_cookie_cleanup_removes_router_cookies" "$cookie_cleanup_content" '/ip hotspot cookie remove'
assert_contains "quota_enforce_clears_cookies_before_kick" "$cookie_cleanup_content" 'clear_hotspot_cookies'
assert_contains "admin_limited_paths_clear_cookies" "$cookie_cleanup_content" 'radius_clear_hotspot_cookies'

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

radius_content="$(cat pay-portal/lib/radius.php)"
assert_not_contains "radius_disconnect_no_suffix_like" "$radius_content" 'username LIKE CONCAT'
assert_not_contains "radius_force_kick_no_blank_user" "$radius_content" "\$tryUsers[] = '';"
assert_contains "radius_force_kick_requires_fresh_session" "$radius_content" "'error'=>'no_fresh_session'"

printf 'All regression tests passed (%d).\n' "$pass_count"
