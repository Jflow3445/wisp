"""Activate only a built candidate, with account checks and automatic rollback."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import time
import urllib.request
import uuid
import sys
from urllib.parse import urlparse

app = Path("/home/nisterai.com/app")
backup = Path("/home/nisterai.com/archives/before-flight-2026-10-29")
baseline = json.loads((backup / "manifest.json").read_text())
release = Path(json.loads(Path("/home/nisterai.com/flight-candidate.json").read_text())["release"])
assert release.parent == Path("/home/nisterai.com/releases") and release.name.startswith("20261029-flight-")
source = json.loads((release / "flight-source.json").read_text())
build = json.loads((release / "flight-build.json").read_text())
assert build["source_sha256"] == source["sha256"] and build["build"] == "passed" and build["financial_integration"] == "passed"
assert app.is_symlink() and str(app.resolve()) in [source["previous_release"], str(release)], "Live release changed independently"
settings = {}
for line in (release / ".env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        raw = value.strip()
        if raw.startswith('"') and raw.endswith('"'):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                raw = raw[1:-1]
        elif raw.startswith("'") and raw.endswith("'"):
            raw = raw[1:-1]
        settings[key.strip()] = raw
database = urlparse(settings["DATABASE_URL"]).path.lstrip("/")
assert database == "nister_ai", "Unexpected production database"

def sql(statement):
    return subprocess.check_output(["mysql", "-N", "--batch", database, "-e", statement], text=True).strip()

def accounts():
    rows = sql("SELECT id, SHA2(CONCAT_WS('|',email,passwordHash,role),256) FROM User ORDER BY id")
    return dict(row.split("\t") for row in rows.splitlines())

before = accounts()
tables = ["FlightControl", "FlightPlayer", "FlightRound", "FlightWithdrawal", "FlightWalletEntry", "FlightAudit"]
existing = sql("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (" + ",".join("'" + t + "'" for t in tables) + ")")
if not existing:
    print("Applying additive Flight tables; existing accounts and balances stay in place…", flush=True)
    migration = release / "prisma/migrations/202610290001_nister_flight/migration.sql"
    subprocess.run(["mysql", "--binary-mode", database], input=migration.read_bytes(), check=True)
elif set(existing.splitlines()) != set(tables):
    raise RuntimeError("Partial Flight migration: keep the current release active and inspect before proceeding")
after = accounts()
assert all(after.get(user_id) == value for user_id, value in before.items()), "Account integrity changed during migration"
migration_name = "202610290001_nister_flight"
has_migrations = sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='_prisma_migrations'") == "1"
if has_migrations and sql("SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='" + migration_name + "' AND finished_at IS NOT NULL") == "0":
    subprocess.run(["npx", "prisma", "migrate", "resolve", "--applied", migration_name], cwd=release, check=True)

sys.path.insert(0, str(release / "ops"))
from growth_migrate import migrate_growth
migrate_growth(release, database, sql)
assert all(accounts().get(user_id) == value for user_id, value in before.items()), "Account integrity changed during growth migration"

standalone = release / ".next/standalone"
assert (standalone / "server.js").is_file(), "Standalone build is missing"
shutil.copytree(release / ".next/static", standalone / ".next/static", dirs_exist_ok=True)
if (release / "public").is_dir():
    shutil.copytree(release / "public", standalone / "public", dirs_exist_ok=True)
shutil.copy2(release / ".env", standalone / ".env")
os.chmod(standalone / ".env", 0o600)
for cache in [release / ".next/cache", standalone / ".next/cache"]:
    cache.mkdir(parents=True, exist_ok=True)
service_user = subprocess.check_output(["systemctl", "show", "nisterai-web", "-p", "User", "--value"], text=True).strip()
owner = pwd.getpwnam(service_user)
for directory, directories, files in os.walk(release):
    os.chown(directory, owner.pw_uid, owner.pw_gid)
    for name in files:
        os.chown(Path(directory) / name, owner.pw_uid, owner.pw_gid)

def request(path, port, cookie=None):
    headers = {"Host": "nisterai.com", "X-Forwarded-Proto": "https", "X-Forwarded-For": "127.0.0.1", "Cache-Control": "no-cache"}
    if cookie:
        headers["Cookie"] = cookie
    with urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}" + path, headers=headers), timeout=20) as response:
        return response.status, response.read().decode("utf-8", "replace")

def wait_for(port):
    for attempt in range(20):
        try:
            status, html = request("/", port)
            if status == 200 and "Nister Flight" in html:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("Candidate did not pass HTTP health checks")

def encoded(value):
    return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).decode().rstrip("=")

admin_id = sql("SELECT u.id FROM User u LEFT JOIN UserTradingProfile p ON p.userId=u.id WHERE u.role='ADMIN' AND (p.accountState IS NULL OR p.accountState NOT IN ('SUSPENDED','CLOSED')) ORDER BY u.createdAt LIMIT 1")
assert admin_id, "No existing administrator account"
issued = int(time.time())
unsigned = encoded({"alg": "HS256"}) + "." + encoded({"sub": admin_id, "role": "ADMIN", "iat": issued, "exp": issued + 300})
signature = base64.urlsafe_b64encode(hmac.new(settings["SESSION_SECRET"].encode(), unsigned.encode(), hashlib.sha256).digest()).decode().rstrip("=")
admin_cookie = "nister_session=" + unsigned + "." + signature
candidate_env = dict(os.environ, **settings, NODE_ENV="production", HOSTNAME="127.0.0.1", PORT="3012")
log = (release / "flight-candidate.log").open("ab")
candidate = subprocess.Popen(["/usr/bin/node", str(standalone / "server.js")], cwd=release, env=candidate_env, stdout=log, stderr=log, user=owner.pw_uid, group=owner.pw_gid)
try:
    wait_for(3012)
    for path in ["/login", "/signup", "/terms", "/privacy", "/risk-disclosure"]:
        assert request(path, 3012)[0] == 200, path
    assert request("/admin", 3012, admin_cookie)[0] == 200
    admin_data = json.loads(request("/api/flight/admin", 3012, admin_cookie)[1])
    assert admin_data["userCount"] >= len(before)
    print("Candidate HTTP and existing administrator checks passed.", flush=True)
finally:
    candidate.terminate()
    candidate.wait(timeout=20)
    log.close()

old_release = source["previous_release"]
new_units = ["nisterai-flight-settle", "nisterai-crypto-watch"]
previous_timers = {name: subprocess.run(["systemctl", "is-active", "--quiet", name + ".timer"]).returncode == 0 for name in new_units}
changed = False
previous_cursor = None
try:
    temporary = app.with_name("app.flight-next")
    if temporary.is_symlink():
        temporary.unlink()
    os.symlink(str(release), temporary)
    os.replace(temporary, app)
    changed = True
    subprocess.run(["systemctl", "restart", "nisterai-web"], check=True)
    wait_for(3011)
    # The retained scanner was last advanced in May. No invoice is currently
    # active, so start at a recent finalized window instead of delaying new
    # deposits behind months of expired invoices. Keep the old cursor for audit;
    # historical invoice hashes remain independently verifiable.
    active_invoices = int(sql("SELECT COUNT(*) FROM PaymentOrder WHERE status='PENDING' AND graceExpiresAt>UTC_TIMESTAMP()"))
    if active_invoices == 0:
        js = """const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
const {prisma}=require('./src/lib/prisma.ts');const {getPlatformSettings}=require('./src/lib/site.ts');
try{const s=await getPlatformSettings();const rows=await prisma.$queryRawUnsafe('SELECT tronApiKey FROM PlatformSetting WHERE id=? LIMIT 1',1);const key=rows[0]?.tronApiKey||process.env.TRON_PRO_API_KEY;const base=(s.tronSolidityNodeUrl||process.env.TRON_SOLIDITY_NODE_URL).replace(/\\/$/,'');const r=await fetch(base+'/walletsolidity/getnowblock',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'TRON-PRO-API-KEY':key}:{})},body:'{}',signal:AbortSignal.timeout(15000)});const b=await r.json();if(!r.ok||!b.block_header?.raw_data?.number)throw Error('TRON head unavailable');console.log(JSON.stringify({height:b.block_header.raw_data.number}));}finally{await prisma.$disconnect();}"""
        head_result = subprocess.check_output(["node", "--env-file=.env", "--import", "tsx", "--input-type=module"], cwd=release, input=js, text=True)
        head = int(json.loads(head_result.strip().splitlines()[-1])["height"])
        cursor = sql("SELECT lastScannedBlock FROM PaymentWatcherCursor WHERE watchKey='usdt_trc20_default'")
        if cursor and head - int(cursor) > 1200:
            previous_cursor = int(cursor)
            cursor_backup = backup / "payment-cursor-before-flight.json"
            cursor_backup.write_text(json.dumps({"previous_block": previous_cursor, "new_block": head - 200, "active_invoices": active_invoices}))
            os.chmod(cursor_backup, 0o600)
            sql("UPDATE PaymentWatcherCursor SET lastScannedBlock=" + str(head - 200) + ",updatedAt=UTC_TIMESTAMP(3) WHERE watchKey='usdt_trc20_default'")
            details = json.dumps({"previous_block": previous_cursor, "new_block": head - 200, "reason": "Archive cutover; no active invoices; historical hashes remain verifiable"}).replace("'", "''")
            sql("INSERT INTO FlightAudit(id,actorId,action,subjectId,details,createdAt) VALUES('" + uuid.uuid4().hex + "','" + admin_id + "','PAYMENT_WATCHER_REBASE','usdt_trc20_default','" + details + "',UTC_TIMESTAMP(3))")
            print("Rebased the dormant chain scanner; previous cursor archived and historical receipts retained.", flush=True)
    for name, mode, interval in [("nisterai-flight-settle", "settle", "10s"), ("nisterai-crypto-watch", "payments", "60s")]:
        service = f"""[Unit]
Description=Nister AI Flight {mode}
After=nisterai-web.service
[Service]
Type=oneshot
User={service_user}
WorkingDirectory=/home/nisterai.com/app
EnvironmentFile=/home/nisterai.com/app/.env
ExecStart=/usr/bin/node /home/nisterai.com/app/scripts/flight-watch.mjs {mode}
TimeoutStartSec=60
NoNewPrivileges=true
PrivateTmp=true
"""
        timer = f"""[Unit]
Description=Nister AI Flight {mode} schedule
[Timer]
OnBootSec=30s
OnUnitActiveSec={interval}
AccuracySec=1s
Unit={name}.service
[Install]
WantedBy=timers.target
"""
        Path(f"/etc/systemd/system/{name}.service").write_text(service)
        Path(f"/etc/systemd/system/{name}.timer").write_text(timer)
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "enable", "--now", *[name + ".timer" for name in new_units]], check=True)
    subprocess.run(["systemctl", "start", "nisterai-flight-settle.service"], check=True)
    # The chain watcher may be catching up; starting it is nonblocking.
    subprocess.run(["systemctl", "start", "--no-block", "nisterai-crypto-watch.service"], check=True)
    status, page = request("/", 3011)
    assert status == 200 and "Nister Flight" in page
    from harden import harden
    harden(release, settings, sql, wait_for)
    assert request("/api/flight/admin", 3011, admin_cookie)[0] == 200
    result = {"deployed_url": "https://nisterai.com", "release": str(release), "previous_release": old_release, "source_sha256": source["sha256"], "existing_accounts_preserved": len(before), "current_user_count": int(sql("SELECT COUNT(*) FROM User")), "new_flights_enabled": bool(admin_data["control"]["enabled"]), "house_reserve_cents": admin_data["control"]["houseBalanceCents"], "backup_manifest": str(backup / "manifest.json")}
    (release / "flight-deployment.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result), flush=True)
except Exception:
    if changed:
        if previous_cursor is not None:
            sql("UPDATE PaymentWatcherCursor SET lastScannedBlock=" + str(previous_cursor) + ",updatedAt=UTC_TIMESTAMP(3) WHERE watchKey='usdt_trc20_default'")
        for name in new_units:
            if not previous_timers[name]:
                subprocess.run(["systemctl", "disable", "--now", name + ".timer"], check=False, capture_output=True)
        temporary = app.with_name("app.flight-rollback")
        if temporary.is_symlink():
            temporary.unlink()
        os.symlink(old_release, temporary)
        os.replace(temporary, app)
        subprocess.run(["systemctl", "restart", "nisterai-web"], check=True)
        for name in new_units:
            if previous_timers[name]:
                subprocess.run(["systemctl", "enable", "--now", name + ".timer"], check=True)
        print("Activation failed; original release restored. Additive tables retained.", flush=True)
    raise
