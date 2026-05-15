#!/usr/bin/env bash
set -euo pipefail

TARGET_IP="${TARGET_IP:-10.10.20.2}"
REQUIRED_DEV="${REQUIRED_DEV:-}"
REQUIRED_DEVS="${REQUIRED_DEVS:-ppp0,ppp1}"
if [[ -n "${REQUIRED_DEV:-}" ]]; then
  REQUIRED_DEVS="$REQUIRED_DEV"
fi
PING_COUNT="${PING_COUNT:-2}"
PING_WAIT="${PING_WAIT:-1}"
REQUIRE_PING="${REQUIRE_PING:-1}"
COOLDOWN_SEC="${COOLDOWN_SEC:-300}"
RESTART_WINDOW_SEC="${RESTART_WINDOW_SEC:-900}"
MAX_RESTARTS_PER_WINDOW="${MAX_RESTARTS_PER_WINDOW:-3}"
STILL_DOWN_EXIT_CODE="${STILL_DOWN_EXIT_CODE:-1}"
ROUTER_LAN_CIDR="${ROUTER_LAN_CIDR:-192.168.88.0/24}"
ROUTER_LAN_VIA="${ROUTER_LAN_VIA:-10.10.20.2}"
ROUTER_LAN_DEV="${ROUTER_LAN_DEV:-ppp0}"
RECOVERY_SERVICES="${RECOVERY_SERVICES:-unbound.service}"

STATE_FILE="${STATE_FILE:-/run/nister_tunnel_watchdog.state}"
LOG_DIR="${LOG_DIR:-/var/log/nister}"
LOG_FILE="${LOG_DIR}/tunnel_watchdog.log"

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

log() {
  local msg="$1"
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$msg" >>"$LOG_FILE"
  logger -t nister-tunnel-watchdog -- "$msg" || true
}

file_uid() {
  local path="$1"
  stat -c '%u' "$path" 2>/dev/null || stat -f '%u' "$path" 2>/dev/null
}

file_mode() {
  local path="$1"
  stat -c '%a' "$path" 2>/dev/null || stat -f '%Lp' "$path" 2>/dev/null
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

strip_matching_quotes() {
  local s="$1"
  local len="${#s}"
  local first last
  if (( len < 2 )); then
    printf '%s' "$s"
    return
  fi
  first="${s:0:1}"
  last="${s:len-1:1}"
  if [[ "$first" == "$last" && ( "$first" == "'" || "$first" == '"' ) ]]; then
    printf '%s' "${s:1:len-2}"
    return
  fi
  printf '%s' "$s"
}

is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

normalize_uint_or_default() {
  local var_name="$1"
  local fallback="$2"
  local raw="${!var_name:-}"
  if ! is_uint "$raw"; then
    printf -v "$var_name" '%s' "$fallback"
    return 1
  fi
  printf -v "$var_name" '%s' "$((10#$raw))"
  return 0
}

state_file_is_secure() {
  local path="$1"
  local uid mode mode_int
  [[ -f "$path" && ! -L "$path" ]] || return 1
  uid="$(file_uid "$path")" || return 1
  [[ "$uid" == "$(id -u)" ]] || return 1
  mode="$(file_mode "$path")" || return 1
  mode="$(trim "$mode")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  if ((${#mode} > 3)); then
    mode="${mode:${#mode}-3}"
  fi
  mode_int="$((8#$mode))"
  (( (mode_int & 8#022) == 0 ))
}

load_state_file() {
  local path="$1"
  local line key value lineno=0
  [[ -f "$path" ]] || return 0
  if ! state_file_is_secure "$path"; then
    log "state=ignored reason=insecure_permissions file=$path"
    return 0
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
    line="${line%$'\r'}"
    line="$(trim "$line")"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    if [[ ! "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      log "state=ignored reason=invalid_line file=$path line=$lineno"
      continue
    fi
    key="${BASH_REMATCH[1]}"
    value="$(strip_matching_quotes "${BASH_REMATCH[2]}")"
    case "$key" in
      last_restart|window_start|window_restarts)
        printf -v "$key" '%s' "$value"
        ;;
      *)
        log "state=ignored reason=unknown_key file=$path key=$key line=$lineno"
        ;;
    esac
  done <"$path"
}

write_state_file_atomic() {
  local dir base tmp
  dir="$(dirname "$STATE_FILE")"
  base="$(basename "$STATE_FILE")"
  tmp="$(mktemp "$dir/.${base}.tmp.XXXXXX")" || return 1
  if ! {
    printf 'last_restart=%s\n' "$last_restart"
    printf 'window_start=%s\n' "$window_start"
    printf 'window_restarts=%s\n' "$window_restarts"
  } >"$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  chmod 0600 "$tmp"
  if ! mv -f "$tmp" "$STATE_FILE"; then
    rm -f "$tmp"
    return 1
  fi
  return 0
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

ensure_recovery_helpers() {
  local route_line services service

  if [[ -n "$ROUTER_LAN_CIDR" && -n "$ROUTER_LAN_VIA" && -n "$ROUTER_LAN_DEV" ]]; then
    route_line="$(ip route show "$ROUTER_LAN_CIDR" 2>/dev/null | head -n 1 || true)"
    if [[ "$route_line" != *"via $ROUTER_LAN_VIA dev $ROUTER_LAN_DEV"* ]]; then
      if ip route replace "$ROUTER_LAN_CIDR" via "$ROUTER_LAN_VIA" dev "$ROUTER_LAN_DEV"; then
        log "route=ensured cidr=$ROUTER_LAN_CIDR via=$ROUTER_LAN_VIA dev=$ROUTER_LAN_DEV"
      else
        log "route=ensure_failed cidr=$ROUTER_LAN_CIDR via=$ROUTER_LAN_VIA dev=$ROUTER_LAN_DEV"
      fi
    fi
  fi

  services="${RECOVERY_SERVICES// /,}"
  IFS=',' read -r -a _services <<<"$services"
  for service in "${_services[@]}"; do
    service="${service//[[:space:]]/}"
    [[ -n "$service" ]] || continue
    if ! systemctl is-active --quiet "$service"; then
      if systemctl start "$service"; then
        log "service=started name=$service"
      else
        log "service=start_failed name=$service"
      fi
    fi
  done
}

route_dev_ok() {
  local dev="$1"
  [[ -n "$dev" ]] || return 1
  local list="${REQUIRED_DEVS// /,}"
  local item
  IFS=',' read -r -a _devs <<<"$list"
  for item in "${_devs[@]}"; do
    item="${item//[[:space:]]/}"
    [[ -n "$item" ]] || continue
    [[ "$dev" == "$item" ]] && return 0
  done
  return 1
}

if ! normalize_uint_or_default PING_COUNT 2; then
  log "config=defaulted key=PING_COUNT value=$PING_COUNT"
fi
if ! normalize_uint_or_default PING_WAIT 1; then
  log "config=defaulted key=PING_WAIT value=$PING_WAIT"
fi
if ! normalize_uint_or_default COOLDOWN_SEC 300; then
  log "config=defaulted key=COOLDOWN_SEC value=$COOLDOWN_SEC"
fi
if ! normalize_uint_or_default RESTART_WINDOW_SEC 900; then
  log "config=defaulted key=RESTART_WINDOW_SEC value=$RESTART_WINDOW_SEC"
fi
if ! normalize_uint_or_default MAX_RESTARTS_PER_WINDOW 3; then
  log "config=defaulted key=MAX_RESTARTS_PER_WINDOW value=$MAX_RESTARTS_PER_WINDOW"
fi
if [[ "${REQUIRE_PING}" != "0" && "${REQUIRE_PING}" != "1" ]]; then
  REQUIRE_PING=1
  log "config=defaulted key=REQUIRE_PING value=$REQUIRE_PING"
fi
if ! normalize_uint_or_default STILL_DOWN_EXIT_CODE 1; then
  log "config=defaulted key=STILL_DOWN_EXIT_CODE value=$STILL_DOWN_EXIT_CODE"
fi

now_epoch="$(date +%s)"
rd="$(route_dev || true)"

if route_dev_ok "$rd"; then
  if [[ "$REQUIRE_PING" == "1" ]] && ! ping_ok; then
    log "status=down action=restart reason=ping_failed route_dev=$rd target=$TARGET_IP"
  else
    if [[ -f "$STATE_FILE" ]]; then
      rm -f "$STATE_FILE"
      log "status=recovered route_dev=$rd target=$TARGET_IP"
    fi
    ensure_recovery_helpers
    exit 0
  fi
fi

last_restart=0
window_start=0
window_restarts=0

load_state_file "$STATE_FILE"
if ! normalize_uint_or_default last_restart 0; then
  log "state=defaulted key=last_restart value=$last_restart"
fi
if ! normalize_uint_or_default window_start 0; then
  log "state=defaulted key=window_start value=$window_start"
fi
if ! normalize_uint_or_default window_restarts 0; then
  log "state=defaulted key=window_restarts value=$window_restarts"
fi

if (( now_epoch - window_start > RESTART_WINDOW_SEC )); then
  window_start="$now_epoch"
  window_restarts=0
fi

if (( now_epoch - last_restart < COOLDOWN_SEC )); then
  log "status=down action=skip reason=cooldown route_dev=${rd:-none} target=$TARGET_IP"
  exit 0
fi

if (( MAX_RESTARTS_PER_WINDOW > 0 )) && (( window_restarts >= MAX_RESTARTS_PER_WINDOW )); then
  log "status=down action=skip reason=rate_limit route_dev=${rd:-none} target=$TARGET_IP window_restarts=$window_restarts"
  exit 0
fi

log "status=down action=restart route_dev=${rd:-none} target=$TARGET_IP"
systemctl restart strongswan-starter
systemctl restart xl2tpd
sleep 4

rd_after="$(route_dev || true)"
if route_dev_ok "$rd_after"; then
  if [[ "$REQUIRE_PING" == "1" ]] && ! ping_ok; then
    log "status=still_down reason=ping_failed_after_restart route_dev=${rd_after:-none} target=$TARGET_IP"
  else
    rm -f "$STATE_FILE"
    ensure_recovery_helpers
    log "status=up_after_restart route_dev=$rd_after target=$TARGET_IP"
    exit 0
  fi
fi

last_restart="$now_epoch"
window_restarts=$((window_restarts + 1))
if ! write_state_file_atomic; then
  log "state=write_failed file=$STATE_FILE"
fi

log "status=still_down route_dev=${rd_after:-none} target=$TARGET_IP window_restarts=$window_restarts"
exit "$STILL_DOWN_EXIT_CODE"
