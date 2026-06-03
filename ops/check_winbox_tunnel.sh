#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

ROUTER_HOST="${ROUTER_HOST:-10.10.20.2}"
VPS_TUNNEL_IP="${VPS_TUNNEL_IP:-10.99.99.1}"
WINBOX_PORT="${WINBOX_PORT:-8291}"
WINBOX_INTERFACE="${WINBOX_INTERFACE:-l2tp-over-vps}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-4}"

fail() {
  printf 'FAIL %s\n' "$1" >&2
  exit 1
}

contains_line() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]]
}

printf 'Checking Winbox tunnel contract: %s:%s via VPS source %s...\n' \
  "$ROUTER_HOST" "$WINBOX_PORT" "$VPS_TUNNEL_IP"

router_state="$(router_ssh ':local svc [/ip service find where name="winbox"]; :if ([:len $svc] = 0) do={ :put "WINBOX_SERVICE=missing" } else={ :local sid [:pick $svc 0]; :put ("WINBOX_DISABLED=" . [/ip service get $sid disabled]); :put ("WINBOX_PORT=" . [/ip service get $sid port]); :put ("WINBOX_ADDRESS=" . [/ip service get $sid address]) }; :put ("WINBOX_FW_RULES=" . [:len [/ip firewall filter find where comment="Allow Winbox from VPS over L2TP"]])' 2>&1 | tr -d '\r')"
fw_detail="$(router_ssh '/ip firewall filter print detail where comment="Allow Winbox from VPS over L2TP"' 2>&1 | tr -d '\r')"

if ! contains_line "$router_state" "WINBOX_DISABLED=false" &&
   ! contains_line "$router_state" "WINBOX_DISABLED=no"; then
  fail "router winbox service is not enabled"
fi
contains_line "$router_state" "WINBOX_PORT=$WINBOX_PORT" ||
  fail "router winbox service is not on port $WINBOX_PORT"
contains_line "$router_state" "WINBOX_ADDRESS=$VPS_TUNNEL_IP/32" ||
  fail "router winbox service is not restricted to $VPS_TUNNEL_IP/32"

fw_rules="$(printf '%s\n' "$router_state" | awk -F= '/^WINBOX_FW_RULES=/{print $2; exit}')"
[[ "${fw_rules:-0}" =~ ^[0-9]+$ ]] || fail "could not read Winbox firewall rule count"
(( fw_rules > 0 )) || fail "missing enabled firewall allow rule for Winbox from VPS over L2TP"
contains_line "$fw_detail" "chain=input" ||
  fail "Winbox firewall rule is not in input chain"
contains_line "$fw_detail" "action=accept" ||
  fail "Winbox firewall rule does not accept traffic"
contains_line "$fw_detail" "protocol=tcp" ||
  fail "Winbox firewall rule is not TCP"
contains_line "$fw_detail" "src-address=$VPS_TUNNEL_IP" ||
  fail "Winbox firewall rule does not restrict source to $VPS_TUNNEL_IP"
contains_line "$fw_detail" "in-interface=$WINBOX_INTERFACE" ||
  fail "Winbox firewall rule is not bound to $WINBOX_INTERFACE"
contains_line "$fw_detail" "dst-port=$WINBOX_PORT" ||
  fail "Winbox firewall rule does not target TCP $WINBOX_PORT"

if ! vps_ssh "nc -vz -w '$CONNECT_TIMEOUT' '$ROUTER_HOST' '$WINBOX_PORT' >/dev/null 2>&1"; then
  fail "VPS cannot reach router Winbox at $ROUTER_HOST:$WINBOX_PORT"
fi

printf 'PASS Winbox tunnel contract is intact. Use: ssh -N -L 127.0.0.1:18291:%s:%s root@209.97.137.68\n' \
  "$ROUTER_HOST" "$WINBOX_PORT"
