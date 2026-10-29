"""Pinned-host SSH helper. Credentials stay outside the repository and command line."""
import argparse
import os
from pathlib import Path
import sys

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def connect():
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.connect(
        os.environ.get("FLIGHT_DEPLOY_HOST", "209.97.137.68"),
        username=os.environ.get("FLIGHT_DEPLOY_USER", "wispadmin"),
        key_filename=os.environ.get("FLIGHT_DEPLOY_KEY", str(Path.home() / "famerlio")),
        look_for_keys=False,
        allow_agent=False,
        timeout=20,
    )
    return client


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("script", type=Path)
    args = parser.parse_args()
    with connect() as client:
        stdin, stdout, stderr = client.exec_command("sudo -n python3 -", timeout=7200)
        stdin.write(args.script.read_text(encoding="utf-8"))
        stdin.channel.shutdown_write()
        # Stream progress, rather than waiting silently for long operations.
        for line in stdout:
            print(line, end="", flush=True)
        errors = stderr.read().decode("utf-8", "replace")
        if errors:
            print(errors, file=sys.stderr, end="")
        raise SystemExit(stdout.channel.recv_exit_status())


if __name__ == "__main__":
    main()
