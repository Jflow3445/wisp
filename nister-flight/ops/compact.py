"""Discard reproducible builder files after a standalone runtime passes a cold probe."""
import os
from pathlib import Path
import shutil
from typing import Callable


BUILD_ARTIFACTS = (
    "node_modules",
    ".next/cache/webpack",
    ".next/cache/swc",
    ".next/cache/.tsbuildinfo",
    "tsconfig.typecheck.tsbuildinfo",
    "tsconfig.tsbuildinfo",
)


def artifact_plan(release: Path) -> list[Path]:
    release = release.resolve(strict=True)
    runtime = release / ".next/standalone"
    for name in ("server.js", "node_modules/next/package.json", ".next/BUILD_ID"):
        if not (runtime / name).is_file():
            raise RuntimeError("Complete standalone runtime required: " + name)
    paths = []
    for name in BUILD_ARTIFACTS:
        path = release / name
        if not path.exists() and not path.is_symlink():
            continue
        if path.is_symlink() or path.resolve() != path or not path.is_relative_to(release):
            raise RuntimeError("Builder artifact must stay inside its release: " + str(path))
        paths.append(path)
    return paths


def compact_release(release: Path, verify_without_build_files: Callable[[], bool]) -> list[str]:
    """Hide builder files, run the caller's cold/runtime checks, then discard them.

    The caller must exclude running builds and verify its background workers.
    Source, lockfiles, standalone dependencies and runtime caches remain intact.
    A failed probe restores every builder path before propagating the failure.
    """
    release = release.resolve(strict=True)
    paths = artifact_plan(release)
    if not paths:
        return []
    quarantine = release / ".nister-build-artifacts"
    quarantine.mkdir(mode=0o700)  # Existing unfinished work must be inspected.
    moved = []
    try:
        for index, original in enumerate(paths):
            hidden = quarantine / str(index)
            os.rename(original, hidden)
            moved.append((original, hidden))
        if verify_without_build_files() is not True:
            raise RuntimeError("Standalone cold probe did not pass")
    except BaseException:
        for original, hidden in reversed(moved):
            if original.exists() or original.is_symlink():
                raise RuntimeError("Artifact path changed during probe; inspect " + str(quarantine))
            os.rename(hidden, original)
        quarantine.rmdir()
        raise
    for original, hidden in moved:
        if hidden.is_symlink() or hidden.resolve().parent != quarantine:
            raise RuntimeError("Unexpected artifact path; preserve " + str(quarantine))
        if hidden.is_dir():
            shutil.rmtree(hidden)
        else:
            hidden.unlink()
    quarantine.rmdir()
    return [path.relative_to(release).as_posix() for path in paths]
