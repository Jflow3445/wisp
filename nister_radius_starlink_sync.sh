#!/usr/bin/env bash
set -euo pipefail

CLIENT_NAME="${CLIENT_NAME:-mikrotik-starlink-current}"
RIGHT_ID="${RIGHT_ID:-}"
CONN_PREFIX="${CONN_PREFIX:-l2tp-mikrotik}"
CONF="${FREERADIUS_CLIENTS_CONF:-/etc/freeradius/3.0/clients.conf}"
CHECK_CMD="${FREERADIUS_CHECK_CMD:-freeradius -CX}"
RESTART_CMD="${FREERADIUS_RESTART_CMD:-systemctl restart freeradius}"
LOG_TAG="${LOG_TAG:-nister-radius-starlink-sync}"
ADOPT_UNKNOWN_RADIUS_CLIENTS="${ADOPT_UNKNOWN_RADIUS_CLIENTS:-1}"
UNKNOWN_RADIUS_LOGS="${UNKNOWN_RADIUS_LOGS:-/var/log/freeradius/radius.log}"
UNKNOWN_RADIUS_LOG_TAIL="${UNKNOWN_RADIUS_LOG_TAIL:-1200}"
MAX_UNKNOWN_ADOPTS="${MAX_UNKNOWN_ADOPTS:-5}"

log() {
  local msg="$1"
  logger -t "$LOG_TAG" -- "$msg" || true
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$msg"
}

valid_ipv4() {
  local ip="$1"
  local a b c d
  [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS=. read -r a b c d <<<"$ip"
  for octet in "$a" "$b" "$c" "$d"; do
    [[ "$octet" =~ ^[0-9]+$ ]] || return 1
    ((10#$octet >= 0 && 10#$octet <= 255)) || return 1
  done
}

current_peer_ip() {
  ipsec status 2>/dev/null | awk -v id="$RIGHT_ID" -v prefix="$CONN_PREFIX" '
    $0 ~ "^[[:space:]]*" prefix "[-_A-Za-z0-9]*\\[[0-9]+\\]:[[:space:]]+ESTABLISHED" {
      if (id != "" && index($0, "[" id "]") == 0) next
      sub(/^.*\.\.\./, "", $0)
      sub(/\[.*$/, "", $0)
      print
      exit
    }
  '
}

client_ip() {
  awk -v name="$CLIENT_NAME" '
    $1 == "client" && $2 == name { inside=1; next }
    inside && $1 == "ipaddr" && $2 == "=" { print $3; exit }
    inside && /^[[:space:]]*}/ { inside=0 }
  ' "$CONF"
}

client_secret_line() {
  awk -v name="$CLIENT_NAME" '
    $1 == "client" && $2 == name { inside=1; next }
    inside && $1 == "secret" && $2 == "=" { print; exit }
    inside && /^[[:space:]]*}/ { inside=0 }
  ' "$CONF"
}

client_ip_exists() {
  local ip="$1"
  awk -v ip="$ip" '
    $1 == "ipaddr" && $2 == "=" && $3 == ip { found=1 }
    END { exit(found ? 0 : 1) }
  ' "$CONF"
}

client_block_name_for_ip() {
  local ip="$1"
  printf 'mikrotik-starlink-auto-%s' "${ip//./-}"
}

unknown_radius_client_ips() {
  local logs=()
  local log
  IFS=',' read -r -a logs <<<"${UNKNOWN_RADIUS_LOGS// /,}"
  for log in "${logs[@]}"; do
    [[ -r "$log" ]] || continue
    tail -n "$UNKNOWN_RADIUS_LOG_TAIL" "$log" 2>/dev/null || true
  done | awk '
    match($0, /unknown client ([0-9]{1,3}(\.[0-9]{1,3}){3})/, m) { print m[1] }
  ' | sort | uniq -c | sort -nr | awk '{ print $2 }'
}

rewrite_client_ip() {
  local new_ip="$1"
  local tmp
  tmp="$(mktemp)"
  awk -v name="$CLIENT_NAME" -v ip="$new_ip" '
    $1 == "client" && $2 == name {
      inside=1
      seen=1
      print
      next
    }
    inside && $1 == "ipaddr" && $2 == "=" {
      print "  ipaddr   = " ip
      changed=1
      next
    }
    inside && /^[[:space:]]*}/ {
      if (!changed) print "  ipaddr   = " ip
      inside=0
      changed=0
      print
      next
    }
    {
      print
    }
    END {
      if (!seen) exit 2
    }
  ' "$CONF" >"$tmp" || {
    local rc=$?
    rm -f "$tmp"
    return "$rc"
  }
  printf '%s' "$tmp"
}

append_radius_client_ip() {
  local ip="$1"
  local name secret_line tmp
  name="$(client_block_name_for_ip "$ip")"
  secret_line="$(client_secret_line | head -n 1)"
  [[ -n "$secret_line" ]] || return 2
  tmp="$(mktemp)"
  cp -a "$CONF" "$tmp"
  {
    printf '\nclient %s {\n' "$name"
    printf '  ipaddr   = %s\n' "$ip"
    printf '%s\n' "$secret_line"
    printf '  require_message_authenticator = no\n'
    printf '}\n'
  } >>"$tmp"
  printf '%s' "$tmp"
}

adopt_unknown_radius_clients() {
  [[ "$ADOPT_UNKNOWN_RADIUS_CLIENTS" == "1" ]] || return 0
  local ip tmp backup count=0 changed=0
  while IFS= read -r ip; do
    [[ -n "$ip" ]] || continue
    valid_ipv4 "$ip" || continue
    if client_ip_exists "$ip"; then
      continue
    fi
    tmp="$(append_radius_client_ip "$ip")" || {
      log "status=failed action=adopt_unknown reason=missing_template_secret client=$CLIENT_NAME ip=$ip"
      return 1
    }
    backup="${CONF}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
    cp -a "$CONF" "$backup"
    install -m 0644 "$tmp" "$CONF"
    rm -f "$tmp"
    if ! $CHECK_CMD >/tmp/nister-radius-starlink-sync-check.out 2>&1; then
      cp -a "$backup" "$CONF"
      log "status=failed action=rollback_adopt_unknown reason=freeradius_config_check ip=$ip backup=$backup"
      return 1
    fi
    log "status=ok action=adopted_unknown_client ip=$ip name=$(client_block_name_for_ip "$ip") backup=$backup"
    changed=1
    count=$((count + 1))
    (( count >= MAX_UNKNOWN_ADOPTS )) && break
  done < <(unknown_radius_client_ips)
  if (( changed != 0 )); then
    $RESTART_CMD
  fi
  return 0
}

peer_ip="$(current_peer_ip | head -n 1 | tr -d '[:space:]')"
if ! valid_ipv4 "$peer_ip"; then
  if adopt_unknown_radius_clients; then
    log "status=skipped reason=no_established_peer right_id=$RIGHT_ID"
  fi
  exit 0
fi

existing_ip="$(client_ip | head -n 1 | tr -d '[:space:]')"
if [[ "$existing_ip" == "$peer_ip" ]]; then
  log "status=ok action=none client=$CLIENT_NAME ip=$peer_ip"
  exit 0
fi

tmp="$(rewrite_client_ip "$peer_ip")"
backup="${CONF}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$CONF" "$backup"
install -m 0644 "$tmp" "$CONF"
rm -f "$tmp"

if ! $CHECK_CMD >/tmp/nister-radius-starlink-sync-check.out 2>&1; then
  cp -a "$backup" "$CONF"
  log "status=failed action=rollback reason=freeradius_config_check backup=$backup"
  exit 1
fi

$RESTART_CMD
log "status=ok action=updated client=$CLIENT_NAME old_ip=${existing_ip:-none} new_ip=$peer_ip backup=$backup"
