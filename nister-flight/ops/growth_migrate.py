"""Additive production migration, private backup, and explicit owner allocation."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

def migrate_growth(release, database, sql):
    assert database == "nister_ai"
    archive = Path("/home/nisterai.com/archives") / ("before-growth-" + str(int(time.time())))
    archive.mkdir(mode=0o700)
    with (archive / "database.sql").open("wb") as output:
        subprocess.run(["mysqldump", "--single-transaction", "--routines", "--triggers", "--hex-blob", database], stdout=output, check=True)
    os.chmod(archive / "database.sql", 0o600)
    (archive / "manifest.json").write_text(json.dumps({"release": str(release), "accounts": int(sql("SELECT COUNT(*) FROM User")), "created": int(time.time())}))
    os.chmod(archive / "manifest.json", 0o600)
    for name in ["202610290002_flight_growth_and_insurance", "202610290003_flight_integrity", "202610290004_pilot_physics"]:
        if sql("SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='" + name + "' AND finished_at IS NOT NULL") == "1":
            continue
        path = release / "prisma/migrations" / name / "migration.sql"
        contents = path.read_bytes()
        subprocess.run(["mysql", "--binary-mode", database], input=contents, check=True)
        checksum = hashlib.sha256(contents).hexdigest()
        sql("INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES('" + str(uuid.uuid4()) + "','" + checksum + "',UTC_TIMESTAMP(3),'" + name + "',UTC_TIMESTAMP(3),1)")
        print("Applied " + name, flush=True)
    private = json.loads(Path("/home/nisterai.com/flight-owner-allocation.json").read_text())
    allocation_env = dict(os.environ, FLIGHT_OWNER_TEST_USER_ID=private["test_user_id"])
    subprocess.run(["node", "--env-file=.env", "--import", "tsx", "scripts/flight-owner-allocation.ts"], cwd=release, env=allocation_env, check=True)
    print(json.dumps({"private_backup": str(archive), "growth_migrations": "applied"}), flush=True)
