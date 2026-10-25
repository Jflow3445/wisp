#!/usr/bin/env bash
set -euo pipefail

ROUTER_HOST="${ROUTER_HOST:-10.10.20.2}"
ROUTER_USER="${ROUTER_USER:-certsync}"
ROUTER_SSH_KEY="${ROUTER_SSH_KEY_ON_VPS:-/root/.ssh/mikrotik_certsync}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-6}"
SERVER_ALIVE_INTERVAL="${SERVER_ALIVE_INTERVAL:-5}"
SERVER_ALIVE_COUNT_MAX="${SERVER_ALIVE_COUNT_MAX:-2}"

if [[ $# -lt 1 ]]; then
  echo "status=skipped reason=no_users"
  exit 0
fi

users=()
disconnect=0
for raw in "$@"; do
  if [[ "$raw" == "--disconnect" ]]; then disconnect=1; continue; fi
  # Match named RADIUS accounts exactly; never turn a name into a phone number.
  if [[ "$raw" =~ ^\+?[0-9\ \(\)-]+$ ]]; then
    user="${raw//[^0-9]/}"
    if [[ "$user" =~ ^0[0-9]{9}$ ]]; then
      users+=("$user" "233${user:1}")
      continue
    elif [[ "$user" =~ ^233[0-9]{9}$ ]]; then
      users+=("$user" "0${user:3}")
      continue
    fi
  fi
  [[ "$raw" =~ ^[A-Za-z0-9][A-Za-z0-9_.@+-]{0,63}$ ]] || continue
  users+=("$raw")
done

if [[ ${#users[@]} -eq 0 ]]; then
  echo "status=skipped reason=no_valid_users"
  [[ "$disconnect" == "0" ]] || exit 1
  exit 0
fi

mapfile -t users < <(printf '%s\n' "${users[@]}" | awk 'NF && !seen[$0]++')

if [[ ! -r "$ROUTER_SSH_KEY" ]]; then
  echo "status=skipped reason=missing_router_key key=$ROUTER_SSH_KEY users=${#users[@]}"
  [[ "$disconnect" == "0" ]] || exit 1
  exit 0
fi

if [[ "$disconnect" == "1" ]] && ! ip route get "$ROUTER_HOST" 2>/dev/null | grep -Eq ' dev ppp[0-9]+([[:space:]]|$)'; then
  echo 'status=failed reason=tunnel_unavailable'
  exit 1
fi

ros=':local removed 0;'
for user in "${users[@]}"; do
  ros+=':foreach c in=[/ip hotspot cookie find where user="'"$user"'"] do={ /ip hotspot cookie remove $c; :set removed ($removed + 1) };'
done
if [[ "$disconnect" == "1" ]]; then
  ros+=':local disconnected 0; :local remaining 0;'
  for user in "${users[@]}"; do
    ros+=':foreach s in=[/ip hotspot active find where user="'"$user"'"] do={ /ip hotspot active remove $s; :set disconnected ($disconnected + 1) };'
  done
  for user in "${users[@]}"; do
    ros+=':set remaining ($remaining + [:len [/ip hotspot cookie find where user="'"$user"'"]] + [:len [/ip hotspot active find where user="'"$user"'"]]);'
  done
  ros+=':if ($remaining = 0) do={ :put ("status=ok action=hotspot_session_revoke remaining=0 cookies=" . $removed . " sessions=" . $disconnected) } else={ :error "account access revocation incomplete" };'
else
  ros+=':put ("status=ok action=hotspot_cookie_clear users='"${#users[@]}"' removed=" . $removed)'
fi

ssh \
  -i "$ROUTER_SSH_KEY" \
  -o BatchMode=yes \
  -o ConnectTimeout="$CONNECT_TIMEOUT" \
  -o ConnectionAttempts=1 \
  -o ServerAliveInterval="$SERVER_ALIVE_INTERVAL" \
  -o ServerAliveCountMax="$SERVER_ALIVE_COUNT_MAX" \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  "${ROUTER_USER}@${ROUTER_HOST}" \
  "$ros"
