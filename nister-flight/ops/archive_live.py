"""Create a recoverable server backup without changing the running website."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse

app = Path("/home/nisterai.com/app")
backup = Path("/home/nisterai.com/archives/before-flight-2026-10-29")
backup.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(backup, 0o700)
manifest = backup / "manifest.json"
if manifest.exists():
    print(manifest.read_text(), flush=True)
    raise SystemExit(0)
settings = {}
for line in (app / ".env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        settings[key.strip()] = value.strip().strip('"').strip("'")
database = urlparse(settings["DATABASE_URL"]).path.lstrip("/")
source = backup / "release.tar.gz"
print("Archiving existing release and build…", flush=True)
subprocess.run(["tar", "-czf", str(source), "--exclude=node_modules", "--exclude=.git", "--exclude=*.log", "-C", str(app.resolve()), "."], check=True)
os.chmod(source, 0o600)
dump = backup / "database.sql"
print("Backing up database with a consistent transaction…", flush=True)
with dump.open("wb") as stream:
    subprocess.run(["mariadb-dump", "--single-transaction", "--routines", "--triggers", "--events", "--hex-blob", database], stdout=stream, check=True)
os.chmod(dump, 0o600)
service = subprocess.check_output(["systemctl", "cat", "nisterai-web"], text=True)
(backup / "service.txt").write_text(service)
def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()
data = {"previous_release": str(app.resolve()), "source": str(source), "database": str(dump), "source_sha256": digest(source), "database_sha256": digest(dump), "users": int(subprocess.check_output(["mysql", "-N", database, "-e", "SELECT COUNT(*) FROM User"], text=True)), "source_bytes": source.stat().st_size, "database_bytes": dump.stat().st_size}
manifest.write_text(json.dumps(data, indent=2))
print(json.dumps(data), flush=True)
