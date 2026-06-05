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

## Hotspot User Experience Contract

- Paid users should experience NISTER Wi-Fi like normal internet after their
  first successful login on a device. Do not force repeated captive portal login
  for users who are still `HS_ACTIVE` with valid quota/time.
- The captive portal should interrupt a known device only when access state
  requires it: data exhausted, plan expired, admin restriction, password/account
  issue, or device identity changed because the client presents a new MAC.
- Preserve remembered-device login on the active hotspot path:
  `login-by=mac-cookie,http-chap,https` must remain enabled on the active
  MikroTik hotspot profile.
- Only paid/active user profiles should keep a long mac-cookie timeout. Blocked,
  default, limited, and nopaid profiles must use zero-duration cookies so users
  are not silently remembered into a blocked state.
- When moving a user away from `HS_ACTIVE` to `HS_LIMITED` or `HS_NOPAID`, clear
  their MikroTik hotspot cookies before/with disconnect. Expired or exhausted
  users must be asked to top up or log in again; stale cookies must not bypass
  billing.

## Forensic Log Boundaries

- NetFlow files under `/var/log/netflow` are regulatory forensic records. Do not
  delete, truncate, compress away, or shorten their retention just to reclaim
  disk space.
- Local NetFlow cleanup may only remove a capture after it has been uploaded to
  the configured archive target and the uploaded object has been verified
  against the local byte size and checksum.
- The Google Drive archive is admin-controlled from `pay.nister.org/admin`.
  Do not replace it with a terminal-only OAuth flow unless explicitly requested.

## Payment Boundaries

- Manual MoMo payments may require admin approval because the admin is verifying
  an external transfer manually.
- Paystack/MoMo Pay checkout attempts must never be credited through the manual
  admin approval path. They may only credit wallet balance after Paystack
  verification confirms `success`, via callback, webhook, or scheduled
  reconciliation.
- Pending Paystack attempts that verify as `failed`, `reversed`, or `abandoned`
  should be closed as declined, not left in the manual deposit review queue.

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
