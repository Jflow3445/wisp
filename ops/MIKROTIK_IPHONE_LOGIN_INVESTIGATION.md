# MikroTik iPhone Login Investigation - 2026-06-01

Purpose: preserve the known-good state while investigating iPhone-only login complaints.

## Current Known-Good State

- User report: Android and laptop users can connect and log in.
- Do not restart RADIUS, MariaDB, Apache, IPsec/L2TP, or bounce AP ports for this iPhone-only issue unless new evidence shows a general outage.
- Do not clear active hotspot users. Active sessions are working.
- VPS services checked active: `freeradius`, `mariadb`, `apache2`, `nister-mikrotik-guard.timer`, `nister-router-catchup.timer`.
- `nister-mikrotik-guard.service` and `nister-router-catchup.service` last showed `Result=success`, `ExecMainStatus=0`.
- RouterOS version observed: `7.20.2`.
- Hotspot profile `hsprof` should allow remembered-device login plus plain
  captive HTTP CHAP and HTTPS login: `login-by=mac-cookie,http-chap,https`.
- Active hotspot certificate: `wifi_nister_org_hotspot_auto_leaf`, SAN includes `wifi.nister.org`, expires `2026-07-26 02:41:11`.
- DHCP option `capport` is attached to the hotspot DHCP network.
- DHCP CAPPORT URL is `https://wifi.nister.org/api.json?v=20260601-remote-refresh`.
- Public base and versioned CAPPORT JSON both return valid JSON with `Cache-Control: no-store`.
- Router-local `flash/hotspot/api.json` is intentionally the MikroTik macro template; RouterOS expands `$(link-login-only)` for hotspot clients.
- `wifi.nister.org` resolves to `192.168.88.1` on the router DNS.
- Apple probe domains are not whitelisted in `HG3_WG_DST`; this is intentional so Apple captive detection is not suppressed.
- Walled garden allows NISTER infrastructure only: `pay.nister.org`, `api.nister.org`, `wifi.nister.org`, and VPS IP `209.97.137.68` on HTTP/HTTPS.
- AP-facing bridge ports observed from hotspot hosts are `ether3` and `ether4`; both were confirmed running after the earlier bounce.
- Open RADIUS accounting sessions observed: 5.
- Router active hotspot users observed: 5.

## iPhone-Focused Hypothesis

The router, RADIUS, CAPPORT, DNS, and Android/laptop login paths are healthy. If iPhone captive browser opening is unreliable, first verify `hsprof` is not HTTPS-only; OS captive portal flows need the plain HTTP router-local login path to work.

The hotspot login page previously used hidden iframe login attempts first, with top-level login only as a later fallback. iOS captive portal browsers are stricter than normal browsers and can stall on hidden-frame login flows. The targeted compatibility change is to use a top-level HTTPS form post immediately for iPhone/iPad/iPod user agents while preserving the existing hidden-frame flow for Android and laptops.

## Safe Verification Checklist

- Confirm Android/laptop users still show active sessions after any iPhone-specific page change.
- Confirm `capport` remains `https://wifi.nister.org/api.json?v=20260601-remote-refresh`.
- Confirm `wifi_nister_org_hotspot_auto_leaf` remains the active `hsprof`
  certificate and `login-by=mac-cookie,http-chap,https` remains set.
- Confirm exhausted/expired users have hotspot cookies cleared before/with CoA.
- Confirm `ether3` and `ether4` remain running.
- Confirm new iPhone attempts create RADIUS access/accounting activity or router hotspot active rows.
