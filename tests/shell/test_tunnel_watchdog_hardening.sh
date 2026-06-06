#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WATCHDOG_SCRIPT="$REPO_ROOT/nister_tunnel_watchdog.sh"
WATCHDOG_SERVICE="$REPO_ROOT/systemd/nister-tunnel-watchdog.service"
WATCHDOG_TIMER="$REPO_ROOT/systemd/nister-tunnel-watchdog.timer"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_file_has_numeric_kv() {
  local path="$1"
  local key="$2"
  local value=""
  local line k v
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    IFS='=' read -r k v <<<"$line"
    if [[ "$k" == "$key" ]]; then
      value="$v"
      break
    fi
  done <"$path"

  [[ -n "$value" ]] || fail "Missing key '$key' in $path"
  [[ "$value" =~ ^[0-9]+$ ]] || fail "Key '$key' is not numeric in $path: '$value'"
}

assert_file_contains() {
  local name="$1"
  local path="$2"
  local expected="$3"
  grep -Fq "$expected" "$path" || fail "$name: expected '$expected' in $path"
}

setup_stubs() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"

  cat >"$bin_dir/ip" <<'EOS'
#!/usr/bin/env bash
if [[ "${1:-}" == "route" && "${2:-}" == "get" ]]; then
  route_dev="${IP_ROUTE_DEV:-}"
  if [[ -n "${IP_ROUTE_DEV_FILE:-}" && -r "$IP_ROUTE_DEV_FILE" ]]; then
    route_dev="$(cat "$IP_ROUTE_DEV_FILE")"
  fi
  if [[ -n "$route_dev" ]]; then
    printf '%s via 0.0.0.0 dev %s src 0.0.0.0\n' "${3:-10.10.20.2}" "$route_dev"
  fi
  exit 0
fi
if [[ "${1:-}" == "route" && "${2:-}" == "show" ]]; then
  if [[ -n "${IP_ROUTE_LINE:-}" ]]; then
    printf '%s\n' "$IP_ROUTE_LINE"
  fi
  exit 0
fi
if [[ "${1:-}" == "route" && "${2:-}" == "replace" ]]; then
  if [[ -n "${IP_LOG:-}" ]]; then
    printf 'ip %s\n' "$*" >>"$IP_LOG"
  fi
  if [[ "${IP_REPLACE_FAIL:-0}" == "1" ]]; then
    exit 2
  fi
  if [[ -n "${IP_ROUTE_DEV_FILE:-}" && "${3:-}" == "10.10.20.2/32" && "${4:-}" == "dev" && -n "${5:-}" ]]; then
    printf '%s\n' "$5" >"$IP_ROUTE_DEV_FILE"
  fi
  exit 0
fi
if [[ "${1:-}" == "-brief" && "${2:-}" == "address" && "${3:-}" == "show" ]]; then
  if [[ -n "${IP_BRIEF_ADDRESS_DEV:-}" && "${4:-}" == "$IP_BRIEF_ADDRESS_DEV" ]]; then
    printf '%s UNKNOWN 10.99.99.1 peer 10.10.20.2/32\n' "$IP_BRIEF_ADDRESS_DEV"
    exit 0
  fi
  exit 1
fi
exit 0
EOS

  cat >"$bin_dir/systemctl" <<'EOS'
#!/usr/bin/env bash
if [[ -n "${SYSTEMCTL_LOG:-}" ]]; then
  printf 'systemctl %s\n' "$*" >>"$SYSTEMCTL_LOG"
fi
if [[ "${1:-}" == "is-active" ]]; then
  [[ "${SYSTEMCTL_ACTIVE:-0}" == "1" ]] && exit 0
  exit 3
fi
exit 0
EOS

  cat >"$bin_dir/logger" <<'EOS'
#!/usr/bin/env bash
exit 0
EOS

  cat >"$bin_dir/sleep" <<'EOS'
#!/usr/bin/env bash
exit 0
EOS

  cat >"$bin_dir/ping" <<'EOS'
#!/usr/bin/env bash
if [[ "${PING_OK:-1}" == "1" ]]; then
  exit 0
fi
exit 1
EOS

  cat >"$bin_dir/timeout" <<'EOS'
#!/usr/bin/env bash
if [[ "${TCP_PROBE_OK:-1}" == "1" ]]; then
  exit 0
fi
exit 1
EOS

  chmod +x "$bin_dir/ip" "$bin_dir/systemctl" "$bin_dir/logger" "$bin_dir/sleep" "$bin_dir/ping" "$bin_dir/timeout"
}

run_watchdog_down_path() {
  local stubs_bin="$1"
  local state_file="$2"
  local log_dir="$3"
  local rc=0

  if (
    export PATH="$stubs_bin:$PATH"
    export STATE_FILE="$state_file"
    export LOG_DIR="$log_dir"
    export TARGET_IP="10.10.20.2"
    export REQUIRED_DEVS="ppp0,ppp1"
    export REQUIRE_PING="0"
    export COOLDOWN_SEC="0"
    export RESTART_WINDOW_SEC="900"
    export MAX_RESTARTS_PER_WINDOW="3"
    export STILL_DOWN_EXIT_CODE="1"
    export POST_RESTART_WAIT_SEC="0"
    export IP_ROUTE_DEV=""
    bash "$WATCHDOG_SCRIPT"
  ); then
    rc=0
  else
    rc=$?
  fi

  return "$rc"
}

test_rejects_code_injection() {
  local case_dir="$1"
  local stubs_bin="$2"
  local state_file="$case_dir/state"
  local log_dir="$case_dir/log"
  local marker_a="$case_dir/injected_a"
  local marker_b="$case_dir/injected_b"
  local rc=0

  mkdir -p "$log_dir"
  cat >"$state_file" <<EOF_STATE
last_restart=\$(touch "$marker_a")
window_start=0
window_restarts=\$(touch "$marker_b")
EOF_STATE
  chmod 0600 "$state_file"

  if run_watchdog_down_path "$stubs_bin" "$state_file" "$log_dir"; then
    rc=0
  else
    rc=$?
  fi

  [[ "$rc" -eq 1 ]] || fail "Expected exit code 1 for down path, got $rc"
  [[ ! -e "$marker_a" ]] || fail "Parser executed injected command for last_restart"
  [[ ! -e "$marker_b" ]] || fail "Parser executed injected command for window_restarts"
}

test_invalid_numeric_state_defaults_without_crash() {
  local case_dir="$1"
  local stubs_bin="$2"
  local state_file="$case_dir/state"
  local log_dir="$case_dir/log"
  local rc=0

  mkdir -p "$log_dir"
  cat >"$state_file" <<'EOF_STATE'
last_restart=not_a_number
window_start=also_bad
window_restarts=bad_value
EOF_STATE
  chmod 0600 "$state_file"

  if run_watchdog_down_path "$stubs_bin" "$state_file" "$log_dir"; then
    rc=0
  else
    rc=$?
  fi

  [[ "$rc" -eq 1 ]] || fail "Expected exit code 1 for down path, got $rc"
  assert_file_has_numeric_kv "$state_file" "last_restart"
  assert_file_has_numeric_kv "$state_file" "window_start"
  assert_file_has_numeric_kv "$state_file" "window_restarts"
}

test_healthy_path_repairs_route_and_service() {
  local case_dir="$1"
  local stubs_bin="$2"
  local state_file="$case_dir/state"
  local log_dir="$case_dir/log"
  local ip_log="$case_dir/ip.log"
  local systemctl_log="$case_dir/systemctl.log"

  mkdir -p "$log_dir"

  (
    export PATH="$stubs_bin:$PATH"
    export STATE_FILE="$state_file"
    export LOG_DIR="$log_dir"
    export TARGET_IP="10.10.20.2"
    export REQUIRED_DEVS="ppp0,ppp1"
    export PROBE_MODE="tcp"
    export TCP_PORTS="22"
    export TCP_PROBE_OK="1"
    export IP_ROUTE_DEV="ppp0"
    export IP_ROUTE_LINE=""
    export IP_LOG="$ip_log"
    export SYSTEMCTL_LOG="$systemctl_log"
    export SYSTEMCTL_ACTIVE="0"
    export ROUTER_LAN_CIDR="192.168.88.0/24"
    export ROUTER_LAN_VIA="10.10.20.2"
    export ROUTER_LAN_DEV="ppp0"
    export RECOVERY_SERVICES="unbound.service"
    bash "$WATCHDOG_SCRIPT"
  )

  assert_file_contains "healthy_path_repairs_router_lan_route" "$ip_log" "ip route replace 192.168.88.0/24 via 10.10.20.2 dev ppp0"
  assert_file_contains "healthy_path_repairs_radius_loopback_route" "$ip_log" "ip route replace 10.10.20.4/32 via 10.10.20.2 dev ppp0"
  assert_file_contains "healthy_path_repairs_hotspot_lan_route" "$ip_log" "ip route replace 192.168.80.0/20 via 10.10.20.2 dev ppp0"
  assert_file_contains "healthy_path_starts_unbound" "$systemctl_log" "systemctl start unbound.service"
}

test_target_route_repair_when_ppp_exists() {
  local case_dir="$1"
  local stubs_bin="$2"
  local state_file="$case_dir/state"
  local log_dir="$case_dir/log"
  local ip_log="$case_dir/ip.log"
  local route_dev_file="$case_dir/route_dev"

  mkdir -p "$log_dir"
  printf 'eth0\n' >"$route_dev_file"

  (
    export PATH="$stubs_bin:$PATH"
    export STATE_FILE="$state_file"
    export LOG_DIR="$log_dir"
    export TARGET_IP="10.10.20.2"
    export REQUIRED_DEVS="ppp0,ppp1"
    export PROBE_MODE="none"
    export IP_ROUTE_DEV_FILE="$route_dev_file"
    export IP_BRIEF_ADDRESS_DEV="ppp0"
    export IP_ROUTE_LINE=""
    export IP_LOG="$ip_log"
    export ROUTER_LAN_CIDR=""
    export TUNNEL_ROUTES=""
    export RECOVERY_SERVICES=""
    bash "$WATCHDOG_SCRIPT"
  )

  assert_file_contains "target_route_repair_adds_peer_route" "$ip_log" "ip route replace 10.10.20.2/32 dev ppp0"
  assert_file_contains "target_route_repair_logged" "$log_dir/tunnel_watchdog.log" "route=ensured cidr=10.10.20.2/32 dev=ppp0"
  if [[ "$(cat "$route_dev_file")" != "ppp0" ]]; then
    fail "target route repair did not update route device state"
  fi
}

test_route_repair_failure_fails_watchdog() {
  local case_dir="$1"
  local stubs_bin="$2"
  local state_file="$case_dir/state"
  local log_dir="$case_dir/log"
  local rc=0

  mkdir -p "$log_dir"

  if (
    export PATH="$stubs_bin:$PATH"
    export STATE_FILE="$state_file"
    export LOG_DIR="$log_dir"
    export TARGET_IP="10.10.20.2"
    export REQUIRED_DEVS="ppp0,ppp1"
    export PROBE_MODE="tcp"
    export TCP_PORTS="22"
    export TCP_PROBE_OK="1"
    export IP_ROUTE_DEV="ppp0"
    export IP_ROUTE_LINE=""
    export IP_REPLACE_FAIL="1"
    export SYSTEMCTL_ACTIVE="1"
    export STILL_DOWN_EXIT_CODE="1"
    bash "$WATCHDOG_SCRIPT"
  ); then
    rc=0
  else
    rc=$?
  fi

  [[ "$rc" -eq 1 ]] || fail "Expected route repair failure to exit 1, got $rc"
  assert_file_contains "route_repair_failure_degraded" "$log_dir/tunnel_watchdog.log" "reason=recovery_helper_failed"
}

test_restart_disabled_observes_only() {
  local case_dir="$1"
  local stubs_bin="$2"
  local state_file="$case_dir/state"
  local log_dir="$case_dir/log"
  local systemctl_log="$case_dir/systemctl.log"

  mkdir -p "$log_dir"

  (
    export PATH="$stubs_bin:$PATH"
    export STATE_FILE="$state_file"
    export LOG_DIR="$log_dir"
    export TARGET_IP="10.10.20.2"
    export REQUIRED_DEVS="ppp0,ppp1"
    export PROBE_MODE="none"
    export MAX_RESTARTS_PER_WINDOW="0"
    export ALLOW_PASSIVE_MODE="1"
    export IP_ROUTE_DEV=""
    export SYSTEMCTL_LOG="$systemctl_log"
    bash "$WATCHDOG_SCRIPT"
  )

  if [[ -f "$systemctl_log" ]] && grep -Fq "systemctl restart" "$systemctl_log"; then
    fail "restart_disabled path must not restart services"
  fi
  assert_file_contains "restart_disabled_logged" "$log_dir/tunnel_watchdog.log" "reason=restart_disabled"
}

test_ping_failure_on_existing_ppp_does_not_restart() {
  local case_dir="$1"
  local stubs_bin="$2"
  local state_file="$case_dir/state"
  local log_dir="$case_dir/log"
  local systemctl_log="$case_dir/systemctl.log"
  local rc=0

  mkdir -p "$log_dir"

  if (
    export PATH="$stubs_bin:$PATH"
    export STATE_FILE="$state_file"
    export LOG_DIR="$log_dir"
    export TARGET_IP="10.10.20.2"
    export REQUIRED_DEVS="ppp0,ppp1"
    export PROBE_MODE="ping"
    export PING_OK="0"
    export IP_ROUTE_DEV="ppp0"
    export SYSTEMCTL_LOG="$systemctl_log"
    export STILL_DOWN_EXIT_CODE="1"
    bash "$WATCHDOG_SCRIPT"
  ); then
    rc=0
  else
    rc=$?
  fi

  [[ "$rc" -eq 1 ]] || fail "Expected ping failure on ppp route to exit 1, got $rc"
  if [[ -f "$systemctl_log" ]] && grep -Fq "systemctl restart" "$systemctl_log"; then
    fail "ping failure on existing ppp route must not restart services"
  fi
  assert_file_contains "ping_failure_observed" "$log_dir/tunnel_watchdog.log" "status=degraded action=observe reason=ping_failed probe=ping route_dev=ppp0"
}

test_systemd_unit_recovers_tunnel_with_rate_limits() {
  [[ -f "$WATCHDOG_SERVICE" ]] || fail "Missing watchdog systemd unit: $WATCHDOG_SERVICE"
  assert_file_contains "watchdog_unit_probe_mode" "$WATCHDOG_SERVICE" "Environment=PROBE_MODE=ping"
  assert_file_contains "watchdog_unit_observes_ping_blips" "$WATCHDOG_SERVICE" "Environment=RESTART_ON_PROBE_FAILURE=0"
  assert_file_contains "watchdog_unit_restart_limit" "$WATCHDOG_SERVICE" "Environment=MAX_RESTARTS_PER_WINDOW=3"
  assert_file_contains "watchdog_unit_passive_mode_off" "$WATCHDOG_SERVICE" "Environment=ALLOW_PASSIVE_MODE=0"
  assert_file_contains "watchdog_unit_still_down_fails" "$WATCHDOG_SERVICE" "Environment=STILL_DOWN_EXIT_CODE=1"
  assert_file_contains "watchdog_unit_extra_tunnel_routes" "$WATCHDOG_SERVICE" "Environment=TUNNEL_ROUTES=10.10.20.4/32,192.168.80.0/20"
  if grep -Fq "SuccessExitStatus=2" "$WATCHDOG_SERVICE"; then
    fail "watchdog unit must surface prolonged tunnel failures to systemd"
  fi
  if grep -Fq "Environment=PROBE_MODE=tcp" "$WATCHDOG_SERVICE"; then
    fail "watchdog unit must not use TCP probing for tunnel health"
  fi
  if grep -Fq "Environment=TCP_PORTS=22" "$WATCHDOG_SERVICE"; then
    fail "watchdog unit must not depend on RouterOS SSH for tunnel health"
  fi
}

test_systemd_timer_waits_after_run_finishes() {
  [[ -f "$WATCHDOG_TIMER" ]] || fail "Missing watchdog systemd timer: $WATCHDOG_TIMER"
  assert_file_contains "watchdog_timer_inactive_delay" "$WATCHDOG_TIMER" "OnUnitInactiveSec=120s"
  if grep -Fq "OnUnitActiveSec=60s" "$WATCHDOG_TIMER"; then
    fail "watchdog timer must not fire back-to-back during long recovery runs"
  fi
}

main() {
  local tmp_root
  tmp_root="$(mktemp -d)"
  trap "rm -rf '$tmp_root'" EXIT

  setup_stubs "$tmp_root/bin"
  test_rejects_code_injection "$tmp_root/case_injection" "$tmp_root/bin"
  test_invalid_numeric_state_defaults_without_crash "$tmp_root/case_invalid_numeric" "$tmp_root/bin"
  test_healthy_path_repairs_route_and_service "$tmp_root/case_recovery_helpers" "$tmp_root/bin"
  test_target_route_repair_when_ppp_exists "$tmp_root/case_target_route_repair" "$tmp_root/bin"
  test_route_repair_failure_fails_watchdog "$tmp_root/case_route_repair_failure" "$tmp_root/bin"
  test_restart_disabled_observes_only "$tmp_root/case_restart_disabled" "$tmp_root/bin"
  test_ping_failure_on_existing_ppp_does_not_restart "$tmp_root/case_ping_failure_on_ppp" "$tmp_root/bin"
  test_systemd_unit_recovers_tunnel_with_rate_limits
  test_systemd_timer_waits_after_run_finishes

  echo "PASS: tunnel watchdog hardening regression tests"
}

main "$@"
