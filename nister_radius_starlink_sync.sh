#!/usr/bin/env bash
set -euo pipefail

CLIENT_NAME="${CLIENT_NAME:-mikrotik-starlink-current}"
RIGHT_ID="${RIGHT_ID:-100.81.142.44}"
CONF="${FREERADIUS_CLIENTS_CONF:-/etc/freeradius/3.0/clients.conf}"
CHECK_CMD="${FREERADIUS_CHECK_CMD:-freeradius -CX}"
RESTART_CMD="${FREERADIUS_RESTART_CMD:-systemctl restart freeradius}"
LOG_TAG="${LOG_TAG:-nister-radius-starlink-sync}"

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
  ipsec status 2>/dev/null | awk -v id="[$RIGHT_ID]" '
    /ESTABLISHED/ && index($0, id) {
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

rewrite_client_ip() {
  local new_ip="$1"
  local tmp
  tmp="$(mktemp)"
  awk -v name="$CLIENT_NAME" -v ip="$new_ip" '
    /^[[:space:]]*client[[:space:]]+mikrotik-starlink-[0-9]+[[:space:]]*\{/ {
      skip=1
      next
    }
    skip && /^[[:space:]]*}/ {
      skip=0
      next
    }
    skip {
      next
    }
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

peer_ip="$(current_peer_ip | head -n 1 | tr -d '[:space:]')"
if ! valid_ipv4 "$peer_ip"; then
  log "status=skipped reason=no_established_peer right_id=$RIGHT_ID"
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
