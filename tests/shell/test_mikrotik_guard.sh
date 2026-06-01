#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GUARD_SCRIPT="$REPO_ROOT/nister_mikrotik_guard.sh"
GUARD_SERVICE="$REPO_ROOT/systemd/nister-mikrotik-guard.service"
GUARD_TIMER="$REPO_ROOT/systemd/nister-mikrotik-guard.timer"

fail() {
  echo "FAIL: $*" >&2
  exit 1
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
exit 0
EOS

  cat >"$bin_dir/ping" <<'EOS'
#!/usr/bin/env bash
if [[ "${PING_OK:-1}" == "1" ]]; then
  exit 0
fi
exit 1
EOS

  cat >"$bin_dir/systemctl" <<'EOS'
#!/usr/bin/env bash
if [[ -n "${SYSTEMCTL_LOG:-}" ]]; then
  printf 'systemctl %s\n' "$*" >>"$SYSTEMCTL_LOG"
fi
if [[ "${1:-}" == "is-active" ]]; then
  if [[ "${SYSTEMCTL_ACTIVE:-0}" == "1" ]]; then
    exit 0
  fi
  exit 3
fi
exit 0
EOS

  cat >"$bin_dir/logger" <<'EOS'
#!/usr/bin/env bash
exit 0
EOS

  cat >"$bin_dir/flock" <<'EOS'
#!/usr/bin/env bash
if [[ "${1:-}" == "-n" ]]; then
  shift
fi
if [[ "${1:-}" == "-E" ]]; then
  shift 2
fi
lock="${1:-}"
shift || true
"$@"
EOS

  chmod +x "$bin_dir/ip" "$bin_dir/ping" "$bin_dir/systemctl" "$bin_dir/logger" "$bin_dir/flock"
}

test_guard_enables_timers_and_runs_catchup_when_healthy() {
  local case_dir="$1"
  local stubs_bin="$2"
  local log_dir="$case_dir/log"
  local systemctl_log="$case_dir/systemctl.log"
  local catchup_log="$case_dir/catchup.log"
  local watchdog_log="$case_dir/watchdog.log"
  local catchup="$case_dir/catchup.sh"
  local watchdog="$case_dir/watchdog.sh"

  mkdir -p "$log_dir"
  cat >"$catchup" <<EOS
#!/usr/bin/env bash
printf 'catchup\n' >>"$catchup_log"
EOS
  cat >"$watchdog" <<EOS
#!/usr/bin/env bash
printf 'watchdog\n' >>"$watchdog_log"
EOS
  chmod +x "$catchup" "$watchdog"

  (
    export PATH="$stubs_bin:$PATH"
    export LOG_DIR="$log_dir"
    export IP_ROUTE_DEV="ppp0"
    export PING_OK="1"
    export SYSTEMCTL_ACTIVE="0"
    export SYSTEMCTL_LOG="$systemctl_log"
    export WATCHDOG_SCRIPT="$watchdog"
    export ROUTER_CATCHUP_SCRIPT="$catchup"
    export WATCHDOG_LOCK="$case_dir/watchdog.lock"
    export CATCHUP_LOCK="$case_dir/catchup.lock"
    export CRITICAL_TIMERS="nister-tunnel-watchdog.timer,nister-router-catchup.timer"
    export CRITICAL_SERVICES="freeradius"
    bash "$GUARD_SCRIPT"
  )

  assert_file_contains "guard_enables_watchdog_timer" "$systemctl_log" "systemctl enable --now nister-tunnel-watchdog.timer"
  assert_file_contains "guard_enables_catchup_timer" "$systemctl_log" "systemctl enable --now nister-router-catchup.timer"
  assert_file_contains "guard_restarts_freeradius" "$systemctl_log" "systemctl restart freeradius"
  assert_file_contains "guard_runs_catchup" "$catchup_log" "catchup"
  [[ ! -f "$watchdog_log" ]] || fail "healthy tunnel should not invoke watchdog"
}

test_guard_runs_watchdog_when_tunnel_bad() {
  local case_dir="$1"
  local stubs_bin="$2"
  local log_dir="$case_dir/log"
  local catchup_log="$case_dir/catchup.log"
  local watchdog_log="$case_dir/watchdog.log"
  local catchup="$case_dir/catchup.sh"
  local watchdog="$case_dir/watchdog.sh"
  local rc=0

  mkdir -p "$log_dir"
  cat >"$catchup" <<EOS
#!/usr/bin/env bash
printf 'catchup\n' >>"$catchup_log"
EOS
  cat >"$watchdog" <<EOS
#!/usr/bin/env bash
printf 'watchdog\n' >>"$watchdog_log"
exit 1
EOS
  chmod +x "$catchup" "$watchdog"

  if (
    export PATH="$stubs_bin:$PATH"
    export LOG_DIR="$log_dir"
    export IP_ROUTE_DEV=""
    export PING_OK="0"
    export SYSTEMCTL_ACTIVE="1"
    export WATCHDOG_SCRIPT="$watchdog"
    export ROUTER_CATCHUP_SCRIPT="$catchup"
    export WATCHDOG_LOCK="$case_dir/watchdog.lock"
    export CATCHUP_LOCK="$case_dir/catchup.lock"
    export CRITICAL_TIMERS="nister-tunnel-watchdog.timer"
    export CRITICAL_SERVICES=""
    bash "$GUARD_SCRIPT"
  ); then
    rc=0
  else
    rc=$?
  fi

  [[ "$rc" -eq 1 ]] || fail "bad tunnel should make guard fail when watchdog cannot recover, got rc=$rc"
  assert_file_contains "guard_runs_watchdog" "$watchdog_log" "watchdog"
  [[ ! -f "$catchup_log" ]] || fail "unhealthy tunnel should not invoke router catchup"
  assert_file_contains "guard_logs_failed" "$log_dir/mikrotik_guard.log" "status=failed"
}

test_guard_systemd_units_are_periodic_and_locked() {
  [[ -f "$GUARD_SERVICE" ]] || fail "Missing guard systemd service: $GUARD_SERVICE"
  [[ -f "$GUARD_TIMER" ]] || fail "Missing guard systemd timer: $GUARD_TIMER"
  assert_file_contains "guard_service_uses_flock" "$GUARD_SERVICE" "/usr/bin/flock -n /run/nister_mikrotik_guard.lock"
  assert_file_contains "guard_timer_inactive_delay" "$GUARD_TIMER" "OnUnitInactiveSec=5min"
  assert_file_contains "guard_timer_persistent" "$GUARD_TIMER" "Persistent=true"
}

main() {
  local tmp_root
  tmp_root="$(mktemp -d)"
  trap "rm -rf '$tmp_root'" EXIT

  setup_stubs "$tmp_root/bin"
  test_guard_enables_timers_and_runs_catchup_when_healthy "$tmp_root/healthy" "$tmp_root/bin"
  test_guard_runs_watchdog_when_tunnel_bad "$tmp_root/bad_tunnel" "$tmp_root/bin"
  test_guard_systemd_units_are_periodic_and_locked

  echo "PASS: MikroTik guard regression tests"
}

main "$@"
