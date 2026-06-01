#!/usr/bin/env bash
set -euo pipefail

LOG_TAG="${LOG_TAG:-nister-mikrotik-guard}"
LOG_DIR="${LOG_DIR:-/var/log/nister}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/mikrotik_guard.log}"

TARGET_IP="${TARGET_IP:-10.10.20.2}"
REQUIRED_DEVS="${REQUIRED_DEVS:-ppp0,ppp1}"
PING_COUNT="${PING_COUNT:-2}"
PING_WAIT="${PING_WAIT:-1}"

WATCHDOG_SCRIPT="${WATCHDOG_SCRIPT:-/usr/local/sbin/nister_tunnel_watchdog.sh}"
ROUTER_CATCHUP_SCRIPT="${ROUTER_CATCHUP_SCRIPT:-/usr/local/sbin/nister_router_catchup.sh}"
WATCHDOG_LOCK="${WATCHDOG_LOCK:-/run/nister_tunnel_watchdog.lock}"
CATCHUP_LOCK="${CATCHUP_LOCK:-/run/nister_router_catchup.lock}"

CRITICAL_TIMERS="${CRITICAL_TIMERS:-nister-tunnel-watchdog.timer,nister-router-catchup.timer,nister-radius-starlink-sync.timer,nister-radacct-cleanup.timer,nister-health-check.timer,nister-mikrotik-guard.timer}"
CRITICAL_SERVICES="${CRITICAL_SERVICES:-freeradius,mariadb,apache2,strongswan-starter,xl2tpd}"

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

log() {
  local msg="$1"
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$msg" >>"$LOG_FILE"
  logger -t "$LOG_TAG" -- "$msg" || true
}

is_required_dev() {
  local dev="$1"
  local item list
  [[ -n "$dev" ]] || return 1
  list="${REQUIRED_DEVS// /,}"
  IFS=',' read -r -a _required_devs <<<"$list"
  for item in "${_required_devs[@]}"; do
    item="${item//[[:space:]]/}"
    [[ -n "$item" ]] || continue
    [[ "$dev" == "$item" ]] && return 0
  done
  return 1
}

route_dev() {
  ip route get "$TARGET_IP" 2>/dev/null | awk '{
    for (i=1; i<=NF; i++) {
      if ($i == "dev" && (i+1) <= NF) { print $(i+1); exit }
    }
  }'
}

ping_ok() {
  ping -c "$PING_COUNT" -W "$PING_WAIT" "$TARGET_IP" >/dev/null 2>&1
}

ensure_timer() {
  local timer="$1"
  [[ -n "$timer" ]] || return 0
  if systemctl is-active --quiet "$timer"; then
    return 0
  fi
  if systemctl enable --now "$timer" >/dev/null 2>&1; then
    log "timer=enabled name=$timer"
    return 0
  fi
  log "timer=enable_failed name=$timer"
  return 1
}

ensure_service() {
  local service="$1"
  [[ -n "$service" ]] || return 0
  if systemctl is-active --quiet "$service"; then
    return 0
  fi
  if systemctl restart "$service" >/dev/null 2>&1; then
    log "service=restarted name=$service"
    return 0
  fi
  log "service=restart_failed name=$service"
  return 1
}

run_locked_script() {
  local label="$1"
  local lock="$2"
  local script="$3"
  shift 3

  if [[ ! -x "$script" ]]; then
    log "script=skipped label=$label reason=missing_or_not_executable path=$script"
    return 1
  fi
  if flock -n -E 75 "$lock" "$script" "$@"; then
    log "script=ok label=$label path=$script"
    return 0
  fi
  local rc=$?
  if [[ "$rc" -eq 75 ]]; then
    log "script=skipped label=$label reason=locked rc=$rc path=$script"
    return 0
  fi
  log "script=failed label=$label rc=$rc path=$script"
  return "$rc"
}

failed=0

timers="${CRITICAL_TIMERS// /,}"
IFS=',' read -r -a _timers <<<"$timers"
for timer in "${_timers[@]}"; do
  timer="${timer//[[:space:]]/}"
  [[ -n "$timer" ]] || continue
  ensure_timer "$timer" || failed=1
done

services="${CRITICAL_SERVICES// /,}"
IFS=',' read -r -a _services <<<"$services"
for service in "${_services[@]}"; do
  service="${service//[[:space:]]/}"
  [[ -n "$service" ]] || continue
  ensure_service "$service" || failed=1
done

rd="$(route_dev || true)"
if is_required_dev "$rd" && ping_ok; then
  log "tunnel=ok route_dev=$rd target=$TARGET_IP"
else
  log "tunnel=bad action=watchdog route_dev=${rd:-none} target=$TARGET_IP"
  if ! PROBE_MODE=ping MAX_RESTARTS_PER_WINDOW="${MAX_RESTARTS_PER_WINDOW:-3}" \
       TUNNEL_ROUTES="${TUNNEL_ROUTES:-10.10.20.4/32,192.168.80.0/20}" \
       run_locked_script watchdog "$WATCHDOG_LOCK" "$WATCHDOG_SCRIPT"; then
    failed=1
  fi
fi

rd_after="$(route_dev || true)"
if is_required_dev "$rd_after" && ping_ok; then
  if ! run_locked_script router_catchup "$CATCHUP_LOCK" "$ROUTER_CATCHUP_SCRIPT"; then
    failed=1
  fi
else
  log "router_catchup=skipped reason=tunnel_unhealthy route_dev=${rd_after:-none} target=$TARGET_IP"
  failed=1
fi

if (( failed != 0 )); then
  log "status=failed"
  exit 1
fi

log "status=ok"
