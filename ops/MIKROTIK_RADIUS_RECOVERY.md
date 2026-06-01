# MikroTik RADIUS / Captive Portal Recovery

Search terms: MikroTik, Microtik, RADIUS, FreeRADIUS, captive portal, CAPPORT, hotspot, L2TP, IPsec, tunnel, Starlink.

Last full recovery documented: 2026-06-01.

## Symptoms

Use this runbook when users can join the Wi-Fi but cannot reach the login page, the captive portal keeps loading, or the login interface never pops up.

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
ops/vps_exec.sh 'ip -brief address; ip route get 10.10.20.2; ip route get 10.10.20.4; systemctl is-active freeradius mariadb apache2 nister-tunnel-watchdog.timer nister-router-catchup.timer nister-radius-starlink-sync.timer'
```

```bash
ops/router_exec.sh '/radius print detail; /radius monitor [find] once'
```

```bash
ops/router_exec.sh '/ip hotspot active print detail; /ip dhcp-server option print detail where name="capport"; /ip firewall address-list print detail where list="HG3_WG_DST"'
```

```bash
ops/vps_exec.sh 'journalctl -u nister-tunnel-watchdog.service -u nister-router-catchup.service -u nister-radius-starlink-sync.service --since "1 hour ago" --no-pager -n 200'
```

```bash
ops/vps_exec.sh 'tail -n 200 /var/log/nister/tunnel_watchdog.log; tail -n 200 /var/log/freeradius/radius.log'
```

## Known Good State

The recovered state on 2026-06-01 was:

- VPS has a PPP tunnel interface with `10.99.99.1` and peer `10.10.20.2`.
- VPS can route to `10.10.20.2`, `10.10.20.4`, and the router LAN via the tunnel.
- Router primary RADIUS entry points at `10.99.99.1`, uses `src-address=10.10.20.4`, includes hotspot service, and has a short timeout.
- Router public fallback RADIUS entry points at `209.97.137.68` and does not bind to `10.10.20.4`.
- Router has `/radius incoming accept=yes port=3799` for CoA/disconnect.
- DHCP CAPPORT option is `https://wifi.nister.org/api.json`.
- `HG3_WG_DST` contains only infrastructure addresses such as `192.168.88.1` and `209.97.137.68`; it must not contain captive probe domains.
- FreeRADIUS `Acct-Unique-Session-Id` includes at least NAS IP, MikroTik session ID, client MAC, and username.

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

Look for `PROBE_MODE=ping`, `MAX_RESTARTS_PER_WINDOW=3`, and `TUNNEL_ROUTES=10.10.20.4/32,192.168.80.0/20`.

### 2. Refresh router self-heal, RADIUS, and captive settings

```bash
ops/vps_exec.sh '/usr/local/sbin/nister_router_catchup.sh'
```

Expected log messages include:

- `status=ok action=self_heal_installed`
- `status=ok action=radius_refreshed`
- `status=ok action=captive_refreshed`
- `status=done hotspot_sync=skipped`

Verify:

```bash
ops/router_exec.sh '/radius print detail; /radius monitor [find] once; /ip dhcp-server option print detail where name="capport"; /ip firewall address-list print detail where list="HG3_WG_DST"'
```

If `HG3_WG_DST` contains `captive.apple.com`, `connectivitycheck.gstatic.com`, `connectivitycheck.android.com`, `clients3.google.com`, `www.msftconnecttest.com`, `ipv6.msftconnecttest.com`, or `www.msftncsi.com`, remove those entries. They suppress the OS captive portal popup.

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

## Files To Inspect Or Deploy

- `nister_tunnel_watchdog.sh`
- `systemd/nister-tunnel-watchdog.service`
- `ops/router_catchup.sh`
- `ops/push_hotspot_to_router.sh`
- `nister_radacct_cleanup.sh`
- `nister_quota_enforce.sh`
- `nister_set_policy_and_kick.sh`
- `nister_user_admin.sh`
- `pay-portal/lib/radius.php`

`ops/router_catchup.sh` intentionally skips hotspot file sync by default. Use `ops/push_hotspot_to_router.sh` for explicit hotspot file deployment, or set `SYNC_HOTSPOT_FILES=1` only when catchup should fetch hosted hotspot files.

Do not paste secrets into this document. Use `ops/.env.ops` and the live server files for credentials.
