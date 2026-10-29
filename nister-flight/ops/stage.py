"""Upload source to a separate release; never replace the live application."""
from pathlib import Path
import hashlib
import json
import tarfile

from remote import connect

root = Path(__file__).resolve().parents[1]
archive = root / "artifacts" / "flight-source.tar.gz"
archive.parent.mkdir(exist_ok=True)
excluded = {"node_modules", ".next", ".git", "artifacts", "test-results", "playwright-report", "__pycache__"}
with tarfile.open(archive, "w:gz") as bundle:
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if not path.is_file() or any(part in excluded for part in rel.parts):
            continue
        if path.name.startswith(".env") and path.name != ".env.example":
            continue
        if path.suffix in {".log", ".tsbuildinfo"}:
            continue
        bundle.add(path, arcname=rel.as_posix(), recursive=False)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
dependency_digest = hashlib.sha256((root / "package-lock.json").read_bytes()).hexdigest()
schema_digest = hashlib.sha256((root / "prisma/schema.prisma").read_bytes()).hexdigest()
release = f"/home/nisterai.com/releases/20261029-flight-{digest[:10]}"
with connect() as client:
    with client.open_sftp() as sftp:
        sftp.put(str(archive), "/home/wispadmin/flight-source.tar.gz")
        if (root / ".env.test").exists():
            sftp.put(str(root / ".env.test"), "/home/wispadmin/flight-test-env")
            sftp.chmod("/home/wispadmin/flight-test-env", 0o600)
    script = f"""
import hashlib,json,os,shutil,tarfile,fcntl
from pathlib import Path
stage_lock=open('/home/nisterai.com/flight-build.lock','w')
fcntl.flock(stage_lock,fcntl.LOCK_EX)
source=Path('/home/wispadmin/flight-source.tar.gz')
assert hashlib.sha256(source.read_bytes()).hexdigest()=={digest!r},'source checksum mismatch'
release=Path({release!r})
release.mkdir(parents=True,exist_ok=True)
with tarfile.open(source) as archive: archive.extractall(release,filter='data')
live=Path('/home/nisterai.com/app')
def carry_type_cache(candidate):
 for relative in ['tsconfig.typecheck.tsbuildinfo','.next/cache/.tsbuildinfo']:
  cached=candidate/relative
  if cached.is_file():
   target=release/relative
   target.parent.mkdir(parents=True,exist_ok=True)
   shutil.copy2(cached,target)

# Reuse unchanged, generated dependencies without touching the active build.
if not (release/'node_modules').exists() and (live/'package-lock.json').is_file() and (live/'prisma/schema.prisma').is_file():
 if hashlib.sha256((live/'package-lock.json').read_bytes()).hexdigest()=={dependency_digest!r} and (live/'prisma/schema.prisma').read_bytes()==(release/'prisma/schema.prisma').read_bytes():
  shutil.copytree((live/'node_modules').resolve(),release/'node_modules',copy_function=os.link,symlinks=True)
  if (live/'flight-dependencies.json').is_file():shutil.copy2(live/'flight-dependencies.json',release/'flight-dependencies.json')
  carry_type_cache(live)
# Reuse a completed build's identical dependency tree in subsequent candidates.
if not (release/'node_modules').exists():
 for candidate in sorted(Path('/home/nisterai.com/releases').glob('20261029-flight-*'),key=lambda p:p.stat().st_mtime,reverse=True):
  marker=candidate/'flight-dependencies.json'
  if marker.is_file() and json.loads(marker.read_text())=={{'lock':{dependency_digest!r},'schema':{schema_digest!r}}} and (candidate/'node_modules/.bin/next').exists():
   shutil.copytree((candidate/'node_modules').resolve(),release/'node_modules',copy_function=os.link,symlinks=True)
   shutil.copy2(marker,release/'flight-dependencies.json')
   carry_type_cache(candidate)
   break
shutil.copy2(live/'.env',release/'.env')
with (release/'.env').open('a') as stream:stream.write('\\nAPP_BASE_URL="https://nisterai.com"\\nNEXT_SERVER_ACTIONS_BODY_SIZE_LIMIT="64kb"\\nTERMS_VERSION="flight-terms-2026-10-29"\\nPRIVACY_VERSION="flight-privacy-2026-10-29"\\nRISK_VERSION="flight-risk-2026-10-29"\\nLEGAL_LAST_UPDATED="October 29, 2026"\\n')
os.chmod(release/'.env',0o600)
(release/'flight-source.json').write_text(json.dumps({{'sha256':{digest!r},'release':{release!r},'previous_release':str(live.resolve())}}))
Path('/home/nisterai.com/flight-candidate.json').write_text(json.dumps({{'release':str(release)}}))
testenv=Path('/home/wispadmin/flight-test-env')
if testenv.exists():
 (release/'.env.test').write_text(testenv.read_text().replace(':33316/',':3306/'))
 os.chmod(release/'.env.test',0o600)
print(json.dumps({{'staged_release':str(release),'source_sha256':{digest!r}}}),flush=True)
"""
    stdin, stdout, stderr = client.exec_command("sudo -n python3 -", timeout=180)
    stdin.write(script)
    stdin.channel.shutdown_write()
    print(stdout.read().decode(), end="")
    error = stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error)
(root / "artifacts" / "staged.json").write_text(json.dumps({"release": release, "sha256": digest}, indent=2))
