"""Build and test the candidate without changing the running release."""
import json
import os
from pathlib import Path
import subprocess
import fcntl
import hashlib

release = Path(json.loads(Path("/home/nisterai.com/flight-candidate.json").read_text())["release"])
assert release.parent == Path("/home/nisterai.com/releases") and release.name.startswith("20261029-flight-")
build_lock = open("/home/nisterai.com/flight-build.lock", "w")
fcntl.flock(build_lock, fcntl.LOCK_EX)
source = json.loads((release / "flight-source.json").read_text())
env = dict(os.environ, NODE_OPTIONS="--max-old-space-size=1536", NEXT_TELEMETRY_DISABLED="1")
dependency_marker = release / "flight-dependencies.json"
dependency_ready = dependency_marker.is_file() and json.loads(dependency_marker.read_text()) == {"lock": hashlib.sha256((release / "package-lock.json").read_bytes()).hexdigest(), "schema": hashlib.sha256((release / "prisma/schema.prisma").read_bytes()).hexdigest()}
commands = ([] if (release / "node_modules/.bin/next").exists() else [["npm", "ci", "--no-audit", "--no-fund"]]) + ([] if dependency_ready else [["npx", "prisma", "generate"]]) + [
    ["node", "--env-file=.env.test", "scripts/flight-test-schema.cjs"],
    ["node", "--env-file=.env.test", "--import", "tsx", "scripts/flight-integration.ts"],
    ["node", "--env-file=.env.test", "--import", "tsx", "scripts/flight-mission-integration.ts"],
    ["npm", "run", "typecheck"],
    ["npm", "run", "build"],
]
for command in commands:
    print("Running " + " ".join(command), flush=True)
    subprocess.run(command, cwd=release, env=env, check=True)
    if command == ["npx", "prisma", "generate"]:
        (release / "flight-dependencies.json").write_text(json.dumps({"lock": hashlib.sha256((release / "package-lock.json").read_bytes()).hexdigest(), "schema": hashlib.sha256((release / "prisma/schema.prisma").read_bytes()).hexdigest()}))
assert json.loads((release / "flight-source.json").read_text())["sha256"] == source["sha256"], "Source changed during validation"
(release / "flight-build.json").write_text(json.dumps({"source_sha256": source["sha256"], "typecheck": "passed", "financial_integration": "passed", "build": "passed"}, indent=2))
print(json.dumps({"candidate_built": str(release)}), flush=True)
