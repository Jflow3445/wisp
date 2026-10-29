"""Download a source-only snapshot; excludes secrets, data and generated builds."""
from pathlib import Path
import tarfile
from remote import connect

target = Path(__file__).resolve().parents[3] / "archives" / "nister-ai-live-2026-10-29.tar.gz"
target.parent.mkdir(parents=True, exist_ok=True)
with connect() as client:
    _, stdout, stderr = client.exec_command(
        "sudo -n tar -czf - -C /home/nisterai.com/app src prisma package.json package-lock.json next.config.ts tsconfig.json tsconfig.typecheck.json prisma.config.ts",
        timeout=180,
    )
    with target.open("wb") as stream:
        while chunk := stdout.read(1024 * 1024):
            stream.write(chunk)
    error = stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error)
with tarfile.open(target) as archive:
    archive.extractall(target.parent / "nister-ai-live-2026-10-29", filter="data")
print(f"Downloaded source snapshot to {target}")
