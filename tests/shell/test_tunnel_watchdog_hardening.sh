#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WATCHDOG_SCRIPT="$REPO_ROOT/nister_tunnel_watchdog.sh"

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
  if [[ -n "${IP_ROUTE_DEV:-}" ]]; then
    printf '%s via 0.0.0.0 dev %s src 0.0.0.0\n' "${3:-10.10.20.2}" "$IP_ROUTE_DEV"
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
  exit 0
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

  cat >"$bin_dir/timeout" <<'EOS'
#!/usr/bin/env bash
if [[ "${TCP_PROBE_OK:-1}" == "1" ]]; then
  exit 0
fi
exit 1
EOS

  chmod +x "$bin_dir/ip" "$bin_dir/systemctl" "$bin_dir/logger" "$bin_dir/sleep" "$bin_dir/timeout"
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
  assert_file_contains "healthy_path_starts_unbound" "$systemctl_log" "systemctl start unbound.service"
}

main() {
  local tmp_root
  tmp_root="$(mktemp -d)"
  trap "rm -rf '$tmp_root'" EXIT

  setup_stubs "$tmp_root/bin"
  test_rejects_code_injection "$tmp_root/case_injection" "$tmp_root/bin"
  test_invalid_numeric_state_defaults_without_crash "$tmp_root/case_invalid_numeric" "$tmp_root/bin"
  test_healthy_path_repairs_route_and_service "$tmp_root/case_recovery_helpers" "$tmp_root/bin"

  echo "PASS: tunnel watchdog hardening regression tests"
}

main "$@"
