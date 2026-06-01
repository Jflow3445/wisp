#!/usr/bin/env bash
set -euo pipefail

ROUTER_HOST="${ROUTER_HOST:-10.10.20.2}"
ROUTER_USER="${ROUTER_USER:-certsync}"
ROUTER_SSH_KEY="${ROUTER_SSH_KEY_ON_VPS:-/root/.ssh/mikrotik_certsync}"
LOG_TAG="${LOG_TAG:-nister-router-catchup}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-6}"
HOTSPOT_BASE_URL="${HOTSPOT_BASE_URL:-https://wifi.nister.org/router-sync}"

log() {
  local msg="$1"
  logger -t "$LOG_TAG" -- "$msg" || true
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$msg"
}

ssh_base=(
  ssh
  -i "$ROUTER_SSH_KEY"
  -o BatchMode=yes
  -o ConnectTimeout="$CONNECT_TIMEOUT"
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  "${ROUTER_USER}@${ROUTER_HOST}"
)

ros() {
  "${ssh_base[@]}" "$1"
}

if [[ ! -r "$ROUTER_SSH_KEY" ]]; then
  log "status=skipped reason=missing_router_key key=$ROUTER_SSH_KEY"
  exit 0
fi

if ! out="$(ros ':put "ROUTER_OK"; /system identity print' 2>&1)"; then
  log "status=skipped reason=router_unreachable host=$ROUTER_HOST"
  exit 0
fi

if [[ "$out" != *"ROUTER_OK"* ]]; then
  log "status=skipped reason=router_probe_unexpected host=$ROUTER_HOST"
  exit 0
fi

log "status=reachable host=$ROUTER_HOST"

self_heal_cmd=':do { /ip cloud set ddns-enabled=yes update-time=yes } on-error={ :log warning "nister: ip cloud enable failed" }; /system script remove [find where name="nister_vpn_self_heal"]; /system script add name=nister_vpn_self_heal policy=read,write,test source=":local n \"l2tp-over-vps\"; :local i [/interface l2tp-client find where name=\$n]; :if ([:len \$i] = 0) do={ :log error \"nister_vpn_self_heal: missing l2tp client\"; :return; }; :if ([/interface l2tp-client get \$i disabled]) do={ /interface l2tp-client enable \$i; :log warning \"nister_vpn_self_heal: enabled l2tp\"; }; :if (![/interface l2tp-client get \$i running]) do={ :log warning \"nister_vpn_self_heal: restarting l2tp\"; /interface l2tp-client disable \$i; :delay 5; /interface l2tp-client enable \$i; }"; /system scheduler remove [find where name="nister_vpn_self_heal"]; /system scheduler add name=nister_vpn_self_heal interval=2m start-time=startup on-event="/system script run nister_vpn_self_heal"; /system script run nister_vpn_self_heal'
if ros "$self_heal_cmd" >/dev/null 2>&1; then
  log "status=ok action=self_heal_installed"
else
  log "status=warn action=self_heal_install_failed"
fi

radius_cmd=':do { /radius set [find where address="10.99.99.1"] src-address=10.10.20.4 timeout=2s } on-error={ :log warning "nister: radius tunnel source refresh failed" }; :do { /radius set [find where address="209.97.137.68"] src-address=0.0.0.0 timeout=2s } on-error={ :log warning "nister: radius public fallback refresh failed" }; :do { /radius incoming set accept=yes port=3799 } on-error={ :log warning "nister: radius incoming refresh failed" }'
if ros "$radius_cmd" >/dev/null 2>&1; then
  log "status=ok action=radius_refreshed"
else
  log "status=warn action=radius_refresh_failed"
fi

files=(
  alogin.html
  api.json
  change-password.html
  common.css
  config.js
  login.html
  logout.html
  md5.js
  pay.html
  radvert.html
  redirect.html
  registration-success.html
  reset-password.html
  rlogin.html
  signup.html
  status.html
  error.html
)

updated=0
failed=0
for file in "${files[@]}"; do
  cmd=":do { /tool fetch url=\"${HOTSPOT_BASE_URL}/${file}\" dst-path=\"flash/hotspot/${file}\" keep-result=yes; :put \"FETCH_OK:${file}\" } on-error={ :put \"FETCH_FAIL:${file}\" }"
  if fetch_out="$(ros "$cmd" 2>&1)" && [[ "$fetch_out" == *"FETCH_OK:${file}"* ]]; then
    updated=$((updated + 1))
  else
    failed=$((failed + 1))
  fi
done

log "status=done hotspot_updated=$updated hotspot_failed=$failed"
