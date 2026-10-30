# Continue WISP development on another computer

Prepared 2026-10-30. The repository is https://github.com/Jflow3445/wisp.
The active development branch is **commerce**. GitHub's default **main** branch
is older; clone the correct branch explicitly:

```sh
git clone --branch commerce https://github.com/Jflow3445/wisp.git
cd wisp
git fetch --all --prune
git status --short
```

Other preserved branches are `feature/owner-platform`, `fix/forensics-live-flows`
and `feature/sms-gateways`. They contain separate work and were uploaded without
being merged into `commerce`. The SMS implementation and subsequent balance fix
are already committed on `commerce`; the old SMS feature branch is historical.
Use `git switch --track origin/feature/owner-platform` only when intentionally
continuing that branch. A normal clone does not reproduce this computer's
absolute worktree paths; recreate worktrees if needed.

## Offline copy

The external drive labelled **IR5_CCSA_X6** has a dated Nister WISP handoff folder.
It includes a full Git bundle of all local branches/tags, a source ZIP of commerce,
private access material, original ignored operations files and a checksum list.
The Git bundle retains history and is the preferred offline starting point:

```sh
git clone --branch commerce /path/to/handoff/wisp-all-branches.bundle wisp
cd wisp
git remote set-url origin https://github.com/Jflow3445/wisp.git
git fetch origin
git branch -a
```

The source ZIP contains no `.git` directory. Dependency folders and build output
can be reinstalled from the committed manifests/lockfiles; they are not the source
of truth. Ignored production credentials, router exports, certificates and backups
are private operational material, not files to add to this public repository.

## VPS access

- Address: `209.97.137.68`, SSH port 22, user **wispadmin**.
- Existing private key: **famerlio**. Its public-key fingerprint is
  `SHA256:S+/2ZGBbRXgzKG4EHZmBZg/y4r2QHVYIllpECpZwQJk`.
- The handoff contains this exact key and trusted VPS host-key pins. The Windows
  setup script copies them into the new user's profile and restricts the private
  key's NTFS permissions. It does not edit SSH configuration or authorized_keys.
- Use the handoff's connection script, or pass `-i`, `UserKnownHostsFile` and
  `StrictHostKeyChecking=yes` explicitly. The saved host pins must match; investigate
  a host-key mismatch instead of accepting a replacement automatically.
- Authenticate to GitHub separately on the new computer when pushing. The VPS key
  does not imply GitHub access. GitHub tokens and browser sessions are not included.

After connecting, `sudo -n` is available for existing administrative operations.
The MikroTik remains reachable from the VPS as `certsync@10.10.20.2`, using the
existing `/root/.ssh/mikrotik_certsync` key and root's trusted known_hosts:

```sh
sudo -n ssh -b 10.99.99.1 -i /root/.ssh/mikrotik_certsync \
  -o BatchMode=yes -o StrictHostKeyChecking=yes certsync@10.10.20.2 \
  '/system identity print'
```

That router automation key stays on the VPS; a second local copy is not required.
Winbox is `10.10.20.2:8291` through the VPS/L2TP tunnel, restricted to source
`10.99.99.1`. AP management addresses are Wavlink `192.168.88.2:80` and TP-Link
`192.168.88.10:443`, reachable through the existing tunnel. Read the accompanying
private instructions for optional localhost port forwards.

## Development dependencies and checks

Install Git, OpenSSH, Bash (Git Bash on Windows), PHP CLI with curl/PDO MySQL/PDO
SQLite, Python 3, and Node.js. The WISP regression command is:

```sh
bash tests/regression/run.sh
```

The local PHP stack was tested with PHP 8.4; the observed production CLI remains
8.1.34. Use the project's tests to assess a version change rather than upgrading
the production runtime as part of workstation setup.

Optional projects have separate dependency installs:

- `nister-org`: `npm ci`, then its package scripts for test/typecheck/build.
- `commerce-platform`: pinned `pnpm@10.15.1`; run `pnpm install --frozen-lockfile`.
- `nister-flight`: `npm ci`; read its README and AGENTS.md. This application is
  distinct from the WISP Flight/Spin components under `pay-portal`.

No test database is copied. Create isolated local fixtures; never point integration
tests at production. Read each project's current package scripts before running it.

## Production boundaries

Read root `AGENTS.md` before making changes. Current paths include:

- Payment/admin PHP: `/var/www/pay`, resolving to
  `/srv/nister-wisp-repo/pay-portal`.
- Public hotspot API: `/var/www/api/hotspot` on `api.nister.org`.
- MikroTik captive HTML: `flash/hotspot`, separate from public `wifi.nister.org`.
- Existing runtime configuration remains on the server, including `/etc/pay.env`
  and `/etc/nister/radius_db.php`. Credentials are not part of a source clone.

Live files can include changes from the owner-platform branch and deployment
variants. Compare and back up the actual live files before deployment; do not
replace a live tree wholesale with an older branch checkout. Workstation transfer
does not deploy code or restore database dumps.

Preserve `ADOPT_UNKNOWN_RADIUS_CLIENTS=0`, the disabled
`nister-radius-starlink-sync.timer`, remembered-device behavior, two-device policy,
plan rates, payment verification boundaries and verified NetFlow archiving.
Never delete forensic captures to make room. Do not rotate credentials, modify
SSH/firewalls, reboot, or touch unrelated services as part of setup.

Recent WISP references: `ops/SMS_GATEWAYS.md`,
`ops/pilo-balance-fix-2026-10-28.txt`, `ops/SPIN_WIN.md`,
`ops/MIKROTIK_RADIUS_RECOVERY.md` and dated operations reports. Older general
documentation describes previous paths/defaults; the current guardrails and live
configuration take precedence. The pre-existing `certbot.service` failure was
still present at the handoff access check and was not changed during transfer.
