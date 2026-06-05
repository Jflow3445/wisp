# MikroTik RADIUS / Captive Portal Recovery

Search terms: MikroTik, Microtik, RADIUS, FreeRADIUS, captive portal, CAPPORT, hotspot, L2TP, IPsec, tunnel, Starlink.

Last full recovery documented: 2026-06-01.

## Symptoms

Use this runbook when users can join the Wi-Fi but cannot reach the login page, the captive portal keeps loading, or the login interface never pops up.

For the 2026-06-01 iPhone-only login issue, preserve the known-good Android/laptop state documented in `ops/MIKROTIK_IPHONE_LOGIN_INVESTIGATION.md` before making changes.

Common signals from the 2026-06-01 outage:

- Users reported that the login interface did not appear and the device only kept loading.
- VPS-to-router L2TP/IPsec was down or missing routes to router-side tunnel addresses.
- `nister-tunnel-watchdog` logged `status=down action=skip reason=restart_disabled`.
- Router RADIUS counters showed timeouts, or RADIUS accounting/authentication stopped moving.
- Captive probe domains were accidentally whitelisted in `HG3_WG_DST`, so phones did not trigger the captive portal popup.
- FreeRADIUS accounting reused stale rows because MikroTik reused `Acct-Session-Id` values.

## Quick Triage

Run these from the repo root after `ops/.env.ops` is configured.

```bash
ops/vps_exec.sh 'ip -brief address; ip route get 10.10.20.2; ip route get 10.10.20.4; systemctl is-active freeradius mariadb apache2 nister-tunnel-watchdog.timer nister-router-catchup.timer nister-radius-starlink-sync.timer nister-radacct-cleanup.timer nister-health-check.timer nister-mikrotik-guard.timer'
```

```bash
ops/router_exec.sh '/radius print detail; /radius monitor [find] once'
```

```bash
ops/router_exec.sh '/ip hotspot active print detail; /ip dhcp-server option print detail where name="capport"; /ip firewall address-list print detail where list="HG3_WG_DST"'
```

```bash
ops/vps_exec.sh 'journalctl -u nister-mikrotik-guard.service -u nister-tunnel-watchdog.service -u nister-router-catchup.service -u nister-radius-starlink-sync.service --since "1 hour ago" --no-pager -n 200'
```

```bash
ops/vps_exec.sh 'tail -n 120 /var/log/nister/mikrotik_guard.log; tail -n 120 /var/log/nister/tunnel_watchdog.log; tail -n 120 /var/log/freeradius/radius.log'
```

## Known Good State

The recovered state on 2026-06-01 was:

- VPS has a PPP tunnel interface with `10.99.99.1` and peer `10.10.20.2`.
- VPS can route to `10.10.20.2`, `10.10.20.4`, and the router LAN via the tunnel.
- Router primary RADIUS entry points at `10.99.99.1`, uses `src-address=10.10.20.4`, includes hotspot service, and has a short timeout.
- Router public fallback RADIUS entry points at `209.97.137.68` and does not bind to `10.10.20.4`.
- Router has `/radius incoming accept=yes port=3799` for CoA/disconnect.
- DHCP CAPPORT option is `https://wifi.nister.org/api.json?v=20260601-remote-refresh`.
- Public `https://wifi.nister.org/api.json` returns valid static JSON. It must not be a MikroTik template containing `$(...)` macros; public Apache cannot expand those macros.
- `HG3_WG_DST` contains only infrastructure addresses such as `192.168.88.1` and `209.97.137.68`; it must not contain captive probe domains.
- FreeRADIUS `Acct-Unique-Session-Id` includes at least NAS IP, MikroTik session ID, client MAC, and username.
- `nister-mikrotik-guard.timer` is enabled and runs every 5 minutes after the previous run finishes.

## Recovery Steps

### 1. Recover the tunnel

```bash
ops/vps_exec.sh 'systemctl restart strongswan-starter xl2tpd; sleep 10; systemctl restart nister-tunnel-watchdog.service; ip route get 10.10.20.2; ip route get 10.10.20.4'
```

If the routes are still wrong but `ppp0` is up, force the expected routes:

```bash
ops/vps_exec.sh 'ip route replace 10.10.20.4/32 via 10.10.20.2 dev ppp0; ip route replace 192.168.80.0/20 via 10.10.20.2 dev ppp0; ip route replace 192.168.88.0/24 via 10.10.20.2 dev ppp0; ip route get 10.10.20.2; ip route get 10.10.20.4'
```

The watchdog should now be configured for active recovery, not passive logging:

```bash
ops/vps_exec.sh 'systemctl cat nister-tunnel-watchdog.service; systemctl status --no-pager nister-tunnel-watchdog.timer nister-tunnel-watchdog.service'
```

Look for `PROBE_MODE=ping`, `MAX_RESTARTS_PER_WINDOW=3`, `ALLOW_PASSIVE_MODE=0`, and `TUNNEL_ROUTES=10.10.20.4/32,192.168.80.0/20`.

The watchdog unit should fail visibly if the tunnel is still down, rate-limited, or unable to repair required routes. It should not contain `SuccessExitStatus=2`.

### 1b. Run the reliability guard

The guard keeps critical timers/services enabled, runs the watchdog if the tunnel is bad, and runs router catchup when the tunnel is healthy.

```bash
ops/vps_exec.sh 'systemctl start nister-mikrotik-guard.service; systemctl show nister-mikrotik-guard.service -p Result -p ExecMainStatus -p ActiveState; tail -n 80 /var/log/nister/mikrotik_guard.log'
```

Expected result is `Result=success`, `ExecMainStatus=0`, and recent `status=ok` guard logs.

### 2. Refresh router self-heal, RADIUS, and captive settings

First verify the public CAPPORT JSON. This catches the failure where phones keep loading because they reached Apache's public hostname and received an unexpanded MikroTik template instead of JSON:

```bash
ops/vps_exec.sh 'curl -fsS --max-time 8 https://wifi.nister.org/api.json | python3 -m json.tool'
```

Expected body:

```json
{
  "captive": true,
  "user-portal-url": "http://192.168.88.1/login",
  "venue-info-url": "https://wifi.nister.org/",
  "can-extend-session": false
}
```

If the output contains `$(if logged-in...)`, `$(link-login-only)`, or any other MikroTik macro, replace the public file:

```bash
ops/vps_exec.sh 'cat >/var/www/html/api.json <<EOF
{
  "captive": true,
  "user-portal-url": "http://192.168.88.1/login",
  "venue-info-url": "https://wifi.nister.org/",
  "can-extend-session": false
}
EOF'
```

```bash
ops/vps_exec.sh '/usr/local/sbin/nister_router_catchup.sh'
```

Expected log messages include:

- `status=ok action=self_heal_installed`
- `status=ok action=radius_refreshed`
- `status=ok action=hotspot_login_refreshed`
- `status=ok action=captive_refreshed`
- `status=done hotspot_sync=skipped`

Verify:

```bash
ops/router_exec.sh '/radius print detail; /radius monitor [find] once; /ip dhcp-server option print detail where name="capport"; /ip firewall address-list print detail where list="HG3_WG_DST"'
```

Also verify the active hotspot profile is not HTTPS-only:

```bash
ops/router_exec.sh '/ip hotspot profile print detail where name="hsprof"'
```

Expected profile setting:

```text
login-by=http-chap,https
```

If `HG3_WG_DST` contains `captive.apple.com`, `connectivitycheck.gstatic.com`, `connectivitycheck.android.com`, `clients3.google.com`, `www.msftconnecttest.com`, `ipv6.msftconnecttest.com`, or `www.msftncsi.com`, remove those entries. They suppress the OS captive portal popup.

To remotely nudge clients that cached a bad CAPPORT response, change the DHCP CAPPORT URL to a cache-busted URL and clear only unauthenticated hotspot hosts:

```bash
ops/router_exec.sh ':do { /ip dhcp-server option set [find where name="capport"] code=114 value="'\''https://wifi.nister.org/api.json?v=20260601-remote-refresh'\''" } on-error={ :put "CAPPORT_SET_FAILED" }; :local unauth [/ip hotspot host find where authorized=no]; :put ("UNAUTH_BEFORE=" . [:len $unauth]); :if ([:len $unauth] > 0) do={ /ip hotspot host remove $unauth; }; :put ("UNAUTH_AFTER=" . [/ip hotspot host print count-only where authorized=no]); :put ("AUTH_ACTIVE=" . [/ip hotspot active print count-only])'
```

This does not clear the private cache inside every phone OS, but it forces the router to rediscover unauthenticated clients and gives renewing clients a fresh CAPPORT URL without interrupting authenticated users.

If users are still stuck and a short AP interruption is acceptable, bounce the AP-facing bridge ports. As of 2026-06-01 the affected AP uplinks were `ether3` and `ether4`:

```bash
ops/router_exec.sh ':put "AP_PORT_BOUNCE_START"; :foreach p in={"ether3";"ether4"} do={ :do { /interface disable [find where name=$p]; :put ("DISABLED=" . $p) } on-error={ :put ("DISABLE_FAILED=" . $p) } }; :delay 8s; :foreach p in={"ether3";"ether4"} do={ :do { /interface enable [find where name=$p]; :put ("ENABLED=" . $p) } on-error={ :put ("ENABLE_FAILED=" . $p) } }; :delay 10s; :put "AP_PORT_BOUNCE_DONE"; /interface print detail where name="ether3"; /interface print detail where name="ether4"; /ip hotspot host print count-only; /ip hotspot active print count-only'
```

Only use this after confirming the AP-facing ports from `/ip hotspot host print detail` or `/interface bridge port print detail`; bouncing the wrong port can interrupt unrelated traffic.

### 3. Refresh Starlink public-IP authorization if needed

If router logs show public fallback RADIUS requests from a new Starlink public IP, run:

```bash
ops/vps_exec.sh 'systemctl start nister-radius-starlink-sync.service; tail -n 120 /var/log/freeradius/radius.log'
```

Then recheck:

```bash
ops/router_exec.sh '/radius monitor [find] once'
```

### 4. Repair accounting collisions and stale sessions

Check that FreeRADIUS accounting is hashing the client MAC and username into `Acct-Unique-Session-Id`:

```bash
ops/vps_exec.sh 'grep -n "Acct-Unique-Session-Id\\|Acct-Session-Id\\|Calling-Station-Id\\|User-Name" /etc/freeradius/3.0/policy.d/accounting | head -n 80'
```

If the policy was changed, validate and restart:

```bash
ops/vps_exec.sh 'freeradius -CX && systemctl restart freeradius && systemctl is-active freeradius'
```

Clean invalid accounting rows:

```bash
ops/vps_exec.sh '/usr/local/sbin/nister_radacct_cleanup.sh'
```

The important invalid pattern is `acctstoptime < acctstarttime`. Those rows can make quota enforcement and CoA disconnects target the wrong user.

## Verification

```bash
ops/vps_exec.sh 'systemctl is-active freeradius mariadb apache2; ip route get 10.10.20.2; ip route get 10.10.20.4'
```

```bash
ops/router_exec.sh '/radius monitor [find] once; /ip hotspot active print detail; /log print where topics~"radius|hotspot"'
```

```bash
ops/vps_exec.sh 'mysql -NBe "SELECT COUNT(*) AS invalid_rows FROM radius.radacct WHERE acctstoptime IS NOT NULL AND acctstoptime < acctstarttime; SELECT COUNT(*) AS open_rows FROM radius.radacct WHERE acctstoptime IS NULL; SELECT username, framedipaddress, callingstationid, acctstarttime, acctstoptime FROM radius.radacct ORDER BY radacctid DESC LIMIT 10;"'
```

Known good signs:

- New `radacct` rows show the current username and client MAC together.
- `invalid_rows` is `0`.
- Open rows correspond to active users.
- Router RADIUS monitor shows recent accepts. Historical timeout counters can remain; do not treat old counters alone as a current outage.
- Test devices may need to toggle Wi-Fi, forget/rejoin the SSID, or open `http://neverssl.com/` after CAPPORT/probe-domain fixes.
- If the captive UI still does not open automatically, test directly from an affected device with `http://192.168.88.1/login`. That bypasses public DNS and proves whether the router-local hotspot page is reachable.

## Files To Inspect Or Deploy

- `nister_tunnel_watchdog.sh`
- `nister_mikrotik_guard.sh`
- `systemd/nister-tunnel-watchdog.service`
- `systemd/nister-mikrotik-guard.service`
- `systemd/nister-mikrotik-guard.timer`
- `ops/router_catchup.sh`
- `ops/push_hotspot_to_router.sh`
- `nister_radacct_cleanup.sh`
- `nister_quota_enforce.sh`
- `nister_set_policy_and_kick.sh`
- `nister_user_admin.sh`
- `pay-portal/lib/radius.php`
- `wifi-portal/api.json`
- `wifi-portal/.htaccess`

`ops/router_catchup.sh` intentionally skips hotspot file sync by default. Use `ops/push_hotspot_to_router.sh` for explicit hotspot file deployment, or set `SYNC_HOTSPOT_FILES=1` only when catchup should fetch hosted hotspot files.

Do not paste secrets into this document. Use `ops/.env.ops` and the live server files for credentials.
