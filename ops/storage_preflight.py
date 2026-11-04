#!/usr/bin/env python3
"""Read-only disk guard for staging a production build."""
import argparse
import shutil
from pathlib import Path

MIN_FREE_BYTES = 3 * 1024**3


def require_build_space(path: Path, minimum: int = MIN_FREE_BYTES) -> None:
    free = shutil.disk_usage(path).free
    if free < minimum:
        raise RuntimeError(
            f"Build blocked: {free / 1024**3:.2f} GiB free at {path}; "
            f"at least {minimum / 1024**3:.2f} GiB is required. "
            "Offload verified inactive releases first; preserve the running "
            "release, previous working release and forensic records."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, nargs="?", default=Path("/"))
    args = parser.parse_args()
    require_build_space(args.path)
    print("PASS production build disk headroom")
