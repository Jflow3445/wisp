"""Limit only Nister Flight's runtime permissions; retain shared WISP services."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse, unquote

def harden(release, settings, sql, health):
    owner = (release / ".env").stat()
    for cache in [release / ".next/cache", release / ".next/standalone/.next/cache"]:
        cache.mkdir(exist_ok=True)
        os.chown(cache, owner.st_uid, owner.st_gid)
    dropin = Path("/etc/systemd/system/nisterai-web.service.d/flight-hardening.conf")
    dropin.parent.mkdir(exist_ok=True)
    previous = dropin.read_text() if dropin.exists() else None
    text = """[Service]
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=read-only
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ProtectProc=invisible
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
ReadWritePaths=/home/nisterai.com/app/.next/cache /home/nisterai.com/app/.next/standalone/.next/cache
UMask=0077
TasksMax=128
MemoryHigh=512M
MemoryMax=640M
LimitNOFILE=65536
Environment=NODE_OPTIONS=--max-old-space-size=448
"""
    try:
        dropin.write_text(text)
        subprocess.run(["systemctl", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "restart", "nisterai-web"], check=True)
        health(3011)
    except Exception:
        if previous is None:
            dropin.unlink(missing_ok=True)
        else:
            dropin.write_text(previous)
        subprocess.run(["systemctl", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "restart", "nisterai-web"], check=True)
        raise
    user = unquote(urlparse(settings["DATABASE_URL"]).username or "")
    assert user == "nister_ai_user", "Unexpected database account; leave grants unchanged"
    hosts = sql("SELECT Host FROM mysql.user WHERE User='nister_ai_user'").splitlines()
    tables = sql("SELECT table_name FROM information_schema.tables WHERE table_schema='nister_ai'").splitlines()
    assert hosts and tables
    for host in hosts:
        assert host in ["localhost", "127.0.0.1"]
        principal = "'nister_ai_user'@'" + host + "'"
        if sql("SELECT COUNT(*) FROM mysql.db WHERE User='nister_ai_user' AND Host='" + host + "' AND Db='nister_ai'") != "0":
            sql("REVOKE ALL PRIVILEGES ON nister_ai.* FROM " + principal)
        grant_option = sql("SELECT Grant_priv FROM mysql.db WHERE User='nister_ai_user' AND Host='" + host + "' AND Db='nister_ai'")
        if grant_option == "Y":
            sql("REVOKE GRANT OPTION ON nister_ai.* FROM " + principal)
        for table in tables:
            assert table.replace("_", "").isalnum()
            permissions = "SELECT,INSERT,UPDATE,DELETE"
            if table in ["FlightWalletEntry", "FlightAudit"]:
                permissions = "SELECT,INSERT"
            elif table in ["FlightRound", "FlightMatch", "FlightWithdrawal", "FlightReferralReward", "PaymentOrder", "ProcessedTransfer"]:
                permissions = "SELECT,INSERT,UPDATE"
            elif table == "_prisma_migrations":
                permissions = "SELECT"
            if sql("SELECT COUNT(*) FROM mysql.tables_priv WHERE User='nister_ai_user' AND Host='" + host + "' AND Db='nister_ai' AND Table_name='" + table + "'") != "0":
                sql("REVOKE ALL PRIVILEGES ON nister_ai.`" + table + "` FROM " + principal)
            sql("GRANT " + permissions + " ON nister_ai.`" + table + "` TO " + principal)
    print(json.dumps({"service_isolation": "enabled", "database_runtime_ddl": "removed", "audit_and_wallet_ledger": "append only for runtime", "shared_services": "unchanged"}), flush=True)
