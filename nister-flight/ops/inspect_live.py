"""Read-only inventory. Never print environment values or personal data."""
import hashlib
import json
from pathlib import Path
import subprocess
from urllib.parse import urlparse

app = Path("/home/nisterai.com/app")
settings = {}
for line in (app / ".env").read_text().splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        settings[key.strip()] = value.strip().strip('"').strip("'")
database = urlparse(settings.get("DATABASE_URL", "")).path.lstrip("/")
print(json.dumps({
    "release": str(app.resolve()),
    "package": json.loads((app / "package.json").read_text()),
    "schema_sha256": hashlib.sha256((app / "prisma/schema.prisma").read_bytes()).hexdigest(),
    "env_names": sorted(settings),
    "database_name": database,
    "disk": subprocess.getoutput("df -h /home"),
    "user_count": subprocess.check_output(["mysql", "-N", database, "-e", "SELECT COUNT(*) FROM User"], text=True).strip(),
    "database_mb": subprocess.check_output(["mysql", "-N", "-e", "SELECT ROUND(SUM(data_length+index_length)/1024/1024,2) FROM information_schema.tables WHERE table_schema='" + database.replace("'", "''") + "'"], text=True).strip(),
}), flush=True)
