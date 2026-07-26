#!/usr/bin/env bash
set -euo pipefail

ROUTER_HOST="${ROUTER_HOST:-10.10.20.2}"
ROUTER_USER="${ROUTER_USER:-certsync}"
ROUTER_SSH_KEY="${ROUTER_SSH_KEY_ON_VPS:-/root/.ssh/mikrotik_certsync}"
LOG_TAG="${LOG_TAG:-nister-router-catchup}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-6}"
SERVER_ALIVE_INTERVAL="${SERVER_ALIVE_INTERVAL:-5}"
SERVER_ALIVE_COUNT_MAX="${SERVER_ALIVE_COUNT_MAX:-2}"
SUCCESS_STAMP="${SUCCESS_STAMP:-/run/nister_router_catchup.success}"
MIN_SUCCESS_INTERVAL_SEC="${MIN_SUCCESS_INTERVAL_SEC:-1800}"
HOTSPOT_BASE_URL="${HOTSPOT_BASE_URL:-https://wifi.nister.org/router-sync}"
SYNC_HOTSPOT_FILES="${SYNC_HOTSPOT_FILES:-0}"
EXIT_ON_UNREACHABLE="${EXIT_ON_UNREACHABLE:-1}"
CAPPORT_API_URL="${CAPPORT_API_URL:-https://wifi.nister.org/api.json?v=20260601-remote-refresh}"
VPS_TUNNEL_IP="${VPS_TUNNEL_IP:-10.99.99.1}"
WINBOX_PORT="${WINBOX_PORT:-8291}"
WINBOX_INTERFACE="${WINBOX_INTERFACE:-l2tp-over-vps}"

if [[ "$CAPPORT_API_URL" == *\"* || "$CAPPORT_API_URL" == *";"* || "$CAPPORT_API_URL" == *$'\n'* || "$CAPPORT_API_URL" == *$'\r'* ]]; then
  printf 'invalid CAPPORT_API_URL: unsafe RouterOS characters\n' >&2
  exit 1
fi
for value_name in VPS_TUNNEL_IP WINBOX_INTERFACE; do
  value="${!value_name}"
  if [[ "$value" == *\"* || "$value" == *";"* || "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    printf 'invalid %s: unsafe RouterOS characters\n' "$value_name" >&2
    exit 1
  fi
done
if [[ ! "$WINBOX_PORT" =~ ^[0-9]+$ ]]; then
  printf 'invalid WINBOX_PORT: must be numeric\n' >&2
  exit 1
fi

log() {
  local msg="$1"
  logger -t "$LOG_TAG" -- "$msg" || true
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$msg"
}

file_age_sec() {
  local file="$1"
  [[ -e "$file" ]] || return 1
  local mtime now
  mtime="$(date -r "$file" +%s 2>/dev/null || stat -f %m "$file" 2>/dev/null || true)"
  [[ "$mtime" =~ ^[0-9]+$ ]] || return 1
  now="$(date +%s)"
  printf '%s' "$((now - mtime))"
}

uptime_to_sec() {
  local raw="$1"
  local total=0
  local num unit rest weeks days hours minutes seconds
  raw="${raw//[[:space:]]/}"

  rest="$raw"
  if [[ "$rest" =~ ^([0-9]+)w(.*)$ ]]; then
    weeks="${BASH_REMATCH[1]}"
    rest="${BASH_REMATCH[2]}"
    total=$((total + 10#$weeks * 7 * 24 * 3600))
  fi
  if [[ "$rest" =~ ^([0-9]+)d(.*)$ ]]; then
    days="${BASH_REMATCH[1]}"
    rest="${BASH_REMATCH[2]}"
    total=$((total + 10#$days * 24 * 3600))
  fi
  if [[ "$rest" =~ ^([0-9]+):([0-9]{2}):([0-9]{2})$ ]]; then
    hours="${BASH_REMATCH[1]}"
    minutes="${BASH_REMATCH[2]}"
    seconds="${BASH_REMATCH[3]}"
    total=$((total + 10#$hours * 3600 + 10#$minutes * 60 + 10#$seconds))
    printf '%s' "$total"
    return 0
  fi

  while [[ "$raw" =~ ^([0-9]+)([wdhms])(.*)$ ]]; do
    num="${BASH_REMATCH[1]}"
    unit="${BASH_REMATCH[2]}"
    raw="${BASH_REMATCH[3]}"
    case "$unit" in
      w) total=$((total + 10#$num * 7 * 24 * 3600)) ;;
      d) total=$((total + 10#$num * 24 * 3600)) ;;
      h) total=$((total + 10#$num * 3600)) ;;
      m) total=$((total + 10#$num * 60)) ;;
      s) total=$((total + 10#$num)) ;;
    esac
  done
  [[ -z "$raw" ]] || return 1
  printf '%s' "$total"
}

ssh_base=(
  ssh
  -i "$ROUTER_SSH_KEY"
  -o BatchMode=yes
  -o ConnectTimeout="$CONNECT_TIMEOUT"
  -o ConnectionAttempts=1
  -o ServerAliveInterval="$SERVER_ALIVE_INTERVAL"
  -o ServerAliveCountMax="$SERVER_ALIVE_COUNT_MAX"
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
  "${ROUTER_USER}@${ROUTER_HOST}"
)

ros() {
  "${ssh_base[@]}" "$1"
}

if [[ ! -r "$ROUTER_SSH_KEY" ]]; then
  log "status=skipped reason=missing_router_key key=$ROUTER_SSH_KEY"
  exit 1
fi

if ! out="$(ros ':put "ROUTER_OK"; :put ("UPTIME=" . [/system resource get uptime]); /system identity print' 2>&1)"; then
  log "status=skipped reason=router_unreachable host=$ROUTER_HOST"
  [[ "$EXIT_ON_UNREACHABLE" == "1" ]] && exit 1
  exit 0
fi

if [[ "$out" != *"ROUTER_OK"* ]]; then
  log "status=skipped reason=router_probe_unexpected host=$ROUTER_HOST"
  [[ "$EXIT_ON_UNREACHABLE" == "1" ]] && exit 1
  exit 0
fi

log "status=reachable host=$ROUTER_HOST"
stamp_age="$(file_age_sec "$SUCCESS_STAMP" || true)"
router_uptime_raw="$(printf '%s\n' "$out" | awk -F= '/^UPTIME=/{print $2; exit}')"
router_uptime_sec="$(uptime_to_sec "${router_uptime_raw:-}" 2>/dev/null || true)"
if [[ "$stamp_age" =~ ^[0-9]+$ &&
      "$router_uptime_sec" =~ ^[0-9]+$ &&
      "$stamp_age" -lt "$MIN_SUCCESS_INTERVAL_SEC" &&
      "$router_uptime_sec" -gt "$stamp_age" ]]; then
  log "status=skipped reason=recent_success age=${stamp_age}s router_uptime=${router_uptime_raw}"
  exit 0
fi

critical_failed=0

self_heal_cmd=':do { /ip cloud set ddns-enabled=yes update-time=yes } on-error={ :log warning "nister: ip cloud enable failed" }; /system script remove [find where name="nister_vpn_self_heal"]; /system script add name=nister_vpn_self_heal policy=read,write,test source=":local n \"l2tp-over-vps\"; :local i [/interface l2tp-client find where name=\$n]; :if ([:len \$i] = 0) do={ :log error \"nister_vpn_self_heal: missing l2tp client\"; :return; }; :if ([/interface l2tp-client get \$i disabled]) do={ /interface l2tp-client enable \$i; :log warning \"nister_vpn_self_heal: enabled l2tp\"; }; :if (![/interface l2tp-client get \$i running]) do={ :log warning \"nister_vpn_self_heal: restarting l2tp\"; /interface l2tp-client disable \$i; :delay 5; /interface l2tp-client enable \$i; }"; /system scheduler remove [find where name="nister_vpn_self_heal"]; /system scheduler add name=nister_vpn_self_heal interval=2m start-time=startup on-event="/system script run nister_vpn_self_heal"; /system script run nister_vpn_self_heal'
if ros "$self_heal_cmd" >/dev/null 2>&1; then
  log "status=ok action=self_heal_installed"
else
  log "status=warn action=self_heal_install_failed"
  critical_failed=1
fi

radius_cmd=':do { /radius set [find where address="10.99.99.1"] src-address=10.10.20.4 timeout=2s } on-error={ :log warning "nister: radius tunnel source refresh failed" }; :do { /radius set [find where address="209.97.137.68"] src-address=0.0.0.0 timeout=2s } on-error={ :log warning "nister: radius public fallback refresh failed" }; :do { /radius incoming set accept=yes port=3799 } on-error={ :log warning "nister: radius incoming refresh failed" }'
if ros "$radius_cmd" >/dev/null 2>&1; then
  log "status=ok action=radius_refreshed"
else
  log "status=warn action=radius_refresh_failed"
  critical_failed=1
fi

management_cmd=':do { :local svc [/ip service find where name="winbox"]; :if ([:len $svc] = 0) do={ :log warning "nister: winbox service missing" } else={ /ip service set [:pick $svc 0] disabled=no port='"$WINBOX_PORT"' address='"$VPS_TUNNEL_IP"'/32 } } on-error={ :log warning "nister: winbox service refresh failed" }; :do { /ip firewall filter remove [find where comment="Allow Winbox from VPS over L2TP"] } on-error={}; :do { :local drop [/ip firewall filter find where comment="DROP WAN -> ROUTER"]; :if ([:len $drop] > 0) do={ /ip firewall filter add chain=input action=accept protocol=tcp src-address='"$VPS_TUNNEL_IP"' in-interface='"$WINBOX_INTERFACE"' dst-port='"$WINBOX_PORT"' comment="Allow Winbox from VPS over L2TP" place-before=$drop } else={ /ip firewall filter add chain=input action=accept protocol=tcp src-address='"$VPS_TUNNEL_IP"' in-interface='"$WINBOX_INTERFACE"' dst-port='"$WINBOX_PORT"' comment="Allow Winbox from VPS over L2TP" } } on-error={ :log warning "nister: winbox firewall refresh failed" }'
if ros "$management_cmd" >/dev/null 2>&1; then
  log "status=ok action=management_refreshed"
else
  log "status=warn action=management_refresh_failed"
  critical_failed=1
fi

hotspot_login_cmd=':local changed 0; :foreach hs in=[/ip hotspot find where disabled=no] do={ :local prof [/ip hotspot get $hs profile]; :if ([:len $prof] > 0) do={ :local profileIds [/ip hotspot profile find where name=$prof]; :if ([:len $profileIds] > 0) do={ :do { /ip hotspot profile set $profileIds login-by=mac-cookie,http-chap,https; :set changed ($changed + 1) } on-error={ :log warning ("nister: hotspot login-by refresh failed profile=" . $prof) } } } }; :if ($changed = 0) do={ :error "nister: no enabled hotspot profile login-by refreshed" }'
if ros "$hotspot_login_cmd" >/dev/null 2>&1; then
  log "status=ok action=hotspot_login_refreshed"
else
  log "status=warn action=hotspot_login_refresh_failed"
  critical_failed=1
fi

hotspot_user_profile_cmd=':local changed 0; :foreach prof in={"active";"default";"limited";"nopaid"} do={ :local ids [/ip hotspot user profile find where name=$prof]; :if ([:len $ids] = 0) do={ :log warning ("nister: hotspot user profile missing profile=" . $prof) } else={ :if ($prof = "active") do={ /ip hotspot user profile set $ids shared-users=1 add-mac-cookie=yes mac-cookie-timeout=4w2d } else={ /ip hotspot user profile set $ids shared-users=1 add-mac-cookie=yes mac-cookie-timeout=0s }; :set changed ($changed + 1) } }; :if ($changed < 4) do={ :error "nister: one or more hotspot user profiles missing" }'
if ros "$hotspot_user_profile_cmd" >/dev/null 2>&1; then
  log "status=ok action=hotspot_user_profiles_refreshed"
else
  log "status=warn action=hotspot_user_profiles_refresh_failed"
  critical_failed=1
fi

anti_share_cmd=':local ids [/ip firewall mangle find where comment="NISTER ANTI-SHARE TTL1"]; :if ([:len $ids] = 0) do={ /ip firewall mangle add chain=postrouting action=change-ttl new-ttl=set:1 passthrough=no dst-address-list=HS_ACTIVE out-interface=bridge comment="NISTER ANTI-SHARE TTL1" } else={ :local keep [:pick $ids 0]; /ip firewall mangle set $keep chain=postrouting action=change-ttl new-ttl=set:1 passthrough=no dst-address-list=HS_ACTIVE out-interface=bridge disabled=no; :foreach id in=$ids do={ :if ($id != $keep) do={ /ip firewall mangle remove $id } } }'
if ros "$anti_share_cmd" >/dev/null 2>&1; then
  log "status=ok action=anti_share_refreshed"
else
  log "status=warn action=anti_share_refresh_failed"
  critical_failed=1
fi

captive_cmd=':do { :if ([:len [/ip dhcp-server option find where name="capport"]] = 0) do={ /ip dhcp-server option add name="capport" code=114 value="'\'''"$CAPPORT_API_URL"''\''" } else={ /ip dhcp-server option set [find where name="capport"] code=114 value="'\'''"$CAPPORT_API_URL"''\''" } } on-error={ :log warning "nister: capport refresh failed" }; :foreach pattern in={"captive.apple.com";"connectivitycheck.gstatic.com";"connectivitycheck.android.com";"clients3.google.com";"www.msftconnecttest.com";"ipv6.msftconnecttest.com";"www.msftncsi.com";"detectportal.firefox.com"} do={ :do { /ip firewall address-list remove [find where list="HG3_WG_DST" and comment~$pattern] } on-error={}; :do { /ip firewall address-list remove [find where list="HG3_WG_DST" and address=$pattern] } on-error={}; :do { /ip hotspot walled-garden remove [find where dst-host~$pattern] } on-error={}; :do { /ip hotspot walled-garden ip remove [find where dst-host~$pattern] } on-error={} }'
if ros "$captive_cmd" >/dev/null 2>&1; then
  log "status=ok action=captive_refreshed"
else
  log "status=warn action=captive_refresh_failed"
  critical_failed=1
fi

if [[ "$SYNC_HOTSPOT_FILES" != "1" ]]; then
  if (( critical_failed != 0 )); then
    log "status=failed hotspot_sync=skipped"
    exit 1
  fi
  touch "$SUCCESS_STAMP" 2>/dev/null || true
  log "status=done hotspot_sync=skipped"
  exit 0
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
fetch_failed=0
for file in "${files[@]}"; do
  cmd=":do { /tool fetch url=\"${HOTSPOT_BASE_URL}/${file}\" dst-path=\"flash/hotspot/${file}\" keep-result=yes; :put \"FETCH_OK:${file}\" } on-error={ :put \"FETCH_FAIL:${file}\" }"
  if fetch_out="$(ros "$cmd" 2>&1)" && [[ "$fetch_out" == *"FETCH_OK:${file}"* ]]; then
    updated=$((updated + 1))
  else
    fetch_failed=$((fetch_failed + 1))
  fi
done

if (( critical_failed != 0 || fetch_failed != 0 )); then
  log "status=failed hotspot_updated=$updated hotspot_failed=$fetch_failed critical_failed=$critical_failed"
  exit 1
fi

touch "$SUCCESS_STAMP" 2>/dev/null || true
log "status=done hotspot_updated=$updated hotspot_failed=$fetch_failed"
