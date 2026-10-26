# MikroTik Traffic-Flow Setup (Legal Forensics)

Apply on the hotspot router (RouterOS CLI):

```routeros
/ip traffic-flow set enabled=yes interfaces=all cache-entries=64k active-flow-timeout=1m inactive-flow-timeout=15s
/ip traffic-flow target remove [find]
/ip traffic-flow target add src-address=10.10.20.2 dst-address=10.99.99.1 port=2055 version=9 v9-template-refresh=20 v9-template-timeout=1m
```

Validation checks:

```routeros
/ip traffic-flow print
/ip traffic-flow target print detail
/tool sniffer quick ip-protocol=udp port=2055
```

Server checks:

```bash
systemctl status nister-nfcapd
journalctl -u nister-nfcapd -f
ls -lh /var/log/netflow | tail
```

Notes:
- Use `version=9` (or `ipfix` if available and tested with your collector).
- Prefer the L2TP management tunnel target: router `10.10.20.2` to VPS `10.99.99.1`.
- Avoid the public VPS target for production forensics; public UDP export can silently fail behind Starlink/CGNAT while the collector keeps running.
- Keep NTP enabled on router and server for legal-grade timestamp correlation.
- Ensure collector dir is readable by web app: `chown root:www-data /var/log/netflow && chmod 0750 /var/log/netflow`.
- For MikroTik/Microtik RADIUS, captive portal, hotspot login, or L2TP/IPsec tunnel outage recovery, use `ops/MIKROTIK_RADIUS_RECOVERY.md`.
- For the 2026-06-01 iPhone-only login investigation and known-good state snapshot, use `ops/MIKROTIK_IPHONE_LOGIN_INVESTIGATION.md`.
