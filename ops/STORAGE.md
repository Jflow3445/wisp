# Server storage

The WISP VPS has a 25 GB root disk shared with the public and Flight websites.
Keep the existing disk alerts enabled. Before staging or building, run:

```sh
python3 /usr/local/sbin/nister_storage_preflight.py /
```

The guard requires 3 GiB available and fails if usage cannot be measured. The
Flight staging and build helpers invoke it automatically. Install or update it
from `ops/storage_preflight.py` when preparing a replacement server.

Retain the running release and the previous working release. Before removing an
older release or build directory, verify that no app symlink, process working
directory, command or open descriptor refers to it. Copy it to private storage
outside the VPS; preserve symlinks rather than following shared storage links.
Verify every archived file's bytes, size and checksum against the original
inventory, then recheck that the originals are unchanged and inactive. Remove
only the exact verified directories. Record archive paths and checksums. Restore
only a needed release after checking space; do not restore all old builds at once.

The 2026-11-04 private offload and verification receipts are under:

`C:\Users\FELIXDOLLADIMADO\Documents\Nister-WISP\Access\storage-repair-20261104`

Archives can contain runtime configuration. Do not add them to Git or share them
as source artifacts. Server-side evidence is `/root/nister-storage-20261104`.

Quota sweeps skip correct zero-cap and hotspot-group rows. Missing aliases,
duplicates, incorrect operators, stale address lists and wrong priorities still
repair through the existing transaction. Audit triggers remain enabled. Do not
delete audit history, rebuild live audit tables or weaken retention to remove
the effects of repeated writes; fix the writer first.

`ops/logrotate-nister-operations.conf` is installed as
`/etc/logrotate.d/nister-operations`. It rotates nine operational text logs daily
or when larger than 20 MB at a scheduled check, retaining 90 rotations with
compression. The existing daily logrotate timer remains. It preserves file
ownership and permissions and does not send service signals. These rules exclude
NetFlow captures and RADIUS accounting detail files.

Never leave old capture rules or timestamped backups in `/etc/logrotate.d`.
Names such as `nister-netflow.bak.20260329_043738` are parsed as active rules.
They can repeatedly rotate already-rotated files and target `nfcapd.current`.
The NetFlow installer now moves such capture-rule copies outside the include
directory. Verify with `logrotate -d /etc/logrotate.conf`: there must be no
`considering log /var/log/netflow/` entries. A dry run does not modify captures.

NetFlow cleanup must use the configured Google Drive uploader and its lock,
minimum capture age, enabled/deletion settings and remote size/checksum checks.
The daily cleanup wrapper now calls that verifier; it never uses age-only `rm`.
The hourly archive timer remains unchanged. Manage Drive authorization in the
existing admin console. Never remove captures to make a build fit.

Validation:

```sh
bash tests/regression/run.sh
python3 tests/regression/storage_preflight.py
python3 tests/regression/netflow_setup.py
php tests/quota/idempotence.php
```

The native quota test requires the existing isolated MariaDB fixture on loopback
port 33079 with its test credentials. It creates and removes only
`nister_quota_storage_test`; an existing schema with that name blocks the test.
It executes the actual shell functions against audit triggers and verifies that
repeated sweeps preserve row IDs without suppressing legitimate repairs.
