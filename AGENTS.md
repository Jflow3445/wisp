# NISTER WISP Agent Guardrails

These rules are production boundaries. Do not weaken them while making UI,
copy, captive portal, payment, or deployment changes.

## Domain Boundaries

- `api.nister.org` is the canonical host for hotspot API services:
  signup, OTP, password reset/change, autopost bridges, and hotspot status.
- `pay.nister.org` is the payment and admin portal. It serves payment/config
  surfaces only. Do not use it as a captive API fallback; fallback hosts must
  implement the same API contract as the primary host.
- `wifi.nister.org` is the public Wi-Fi site and CAPPORT `/api.json` host. It is
  not a backend API host; public `wifi.nister.org/hotspot-api/status.php` can be
  absent.
- The MikroTik router serves local captive HTML under `flash/hotspot`. Do not
  assume public `wifi.nister.org` and router-hosted `wifi.nister.org` have the
  same routes.
- `api.nister.org` must not serve public/captive HTML pages. Browser visits to
  `/`, `/index.html`, `/login.html`, `/status.html`, and `/api.json` on the API
  host should not return the old Wi-Fi UI.

Implementation location is not the same as public responsibility. Some status
code lives under `pay-portal/`, but the public hotspot API contract remains
`api.nister.org`.

## Required Checks

- Keep `hotspot/config.js` and `nister-org/public/router-sync/config.js`
  defaulting API actions to `https://api.nister.org`.
- Keep captive `status.html` API candidates on `api.nister.org` or router-local
  same-origin only. Do not include `pay.nister.org` in `apiCandidates()`.
- Run `tests/regression/run.sh` after touching captive pages, status APIs,
  payment config, Apache routing, or MikroTik deployment scripts.
- Run `ops/check_api_host_boundary.sh` after touching Apache/vhost routing for
  `api.nister.org`.
- Preserve the remote Winbox management path. Winbox is
  `10.10.20.2:8291` through the VPS/L2TP tunnel, not router HTTPS/WebFig
  `443`. Keep `/ip service winbox` on port `8291` restricted to
  `10.99.99.1/32`, and keep the input firewall allow rule from
  `10.99.99.1` over `l2tp-over-vps` to TCP `8291` before the WAN drop rule.
- Run `ops/check_winbox_tunnel.sh` after touching VPN, tunnel watchdog,
  router catch-up, MikroTik `/ip service`, or input firewall rules.
- If deploying captive files, verify the MikroTik file size/timestamp after
  upload. Do not assume SCP output means RouterOS replaced the file.
