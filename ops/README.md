# WISP Ops Helpers

These scripts standardize VPS + MikroTik access from this repo so future pushes/checks are one command.

## Recovery Runbooks

- [MikroTik RADIUS / Captive Portal Recovery](./MIKROTIK_RADIUS_RECOVERY.md) - use this when Wi-Fi clients can associate but the login portal does not pop up, keeps loading, or RADIUS/tunnel checks fail. Also searchable as Microtik.

## 1) Create local credential file

```bash
cp ops/.env.ops.example ops/.env.ops
chmod 600 ops/.env.ops
```

`ops/.env.ops` is ignored by git via `.gitignore` (`.env.*`).

## 2) Quick commands

Run arbitrary command on VPS:

```bash
ops/vps_exec.sh 'hostname && ip -brief a'
```

Run arbitrary RouterOS command through VPS:

```bash
ops/router_exec.sh '/system identity print'
ops/router_exec.sh '/radius print detail'
```

Check residual router findings (RADIUS bind + script ownership snapshot):

```bash
ops/check_residuals.sh
```

Run the live MikroTik reliability guard once:

```bash
ops/vps_exec.sh 'systemctl start nister-mikrotik-guard.service; systemctl show nister-mikrotik-guard.service -p Result -p ExecMainStatus'
```

Push hotspot files to router (`flash/hotspot/...`):

```bash
ops/push_hotspot_to_router.sh
```

By default it pushes:
- all default hotspot pages and assets needed by the router, including `hotspot/config.js`, `hotspot/login.html`, `hotspot/status.html`, `hotspot/error.html`, and CSS/error assets.

You can pass custom relative paths:

```bash
ops/push_hotspot_to_router.sh hotspot/login.html hotspot/status.html
```

## 3) Deploy behavior and failure modes

`push_hotspot_to_router.sh` tries two methods:
1. VPS -> router `scp` to `flash/hotspot/...`
2. Fallback: temporary HTTP server on VPS + router `/tool fetch`

If both fail with permission errors, the router account likely lacks `ftp/write` privileges for file writes.

`check_residuals.sh` now enforces the desired tunnel primary source `10.10.20.4` and public fallback source `0.0.0.0` if `AUTO_FIX_RADIUS_BIND=1`.
If it prints `not enough permissions`, the router account lacks policy to modify `/radius`.

## 4) Optional manual tunnel for Winbox/UI

If you need local Winbox forwarding:

```bash
ssh -N -L 8291:10.10.20.2:8291 root@209.97.137.68
```
