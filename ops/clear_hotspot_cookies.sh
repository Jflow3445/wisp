#!/usr/bin/env bash
set -euo pipefail

ROUTER_HOST="${ROUTER_HOST:-10.10.20.2}"
ROUTER_USER="${ROUTER_USER:-certsync}"
ROUTER_SSH_KEY="${ROUTER_SSH_KEY_ON_VPS:-/root/.ssh/mikrotik_certsync}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-6}"

if [[ $# -lt 1 ]]; then
  echo "status=skipped reason=no_users"
  exit 0
fi

users=()
for raw in "$@"; do
  user="${raw//[^0-9]/}"
  [[ "$user" =~ ^[0-9]{9,12}$ ]] || continue
  users+=("$user")
  if [[ "$user" =~ ^0[0-9]{9}$ ]]; then
    users+=("233${user:1}")
  elif [[ "$user" =~ ^233[0-9]{9}$ ]]; then
    users+=("0${user:3}")
  fi
done

if [[ ${#users[@]} -eq 0 ]]; then
  echo "status=skipped reason=no_valid_users"
  exit 0
fi

mapfile -t users < <(printf '%s\n' "${users[@]}" | awk 'NF && !seen[$0]++')

if [[ ! -r "$ROUTER_SSH_KEY" ]]; then
  echo "status=skipped reason=missing_router_key key=$ROUTER_SSH_KEY users=${#users[@]}"
  exit 0
fi

ros=':local removed 0;'
for user in "${users[@]}"; do
  ros+=':foreach c in=[/ip hotspot cookie find where user="'"$user"'"] do={ /ip hotspot cookie remove $c; :set removed ($removed + 1) };'
done
ros+=':put ("status=ok action=hotspot_cookie_clear users='"${#users[@]}"' removed=" . $removed)'

ssh \
  -i "$ROUTER_SSH_KEY" \
  -o BatchMode=yes \
  -o ConnectTimeout="$CONNECT_TIMEOUT" \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  "${ROUTER_USER}@${ROUTER_HOST}" \
  "$ros"
