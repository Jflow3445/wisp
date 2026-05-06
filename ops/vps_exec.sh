#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

if [[ $# -lt 1 ]]; then
  cat <<'USAGE' >&2
Usage:
  ops/vps_exec.sh '<command>'

Example:
  ops/vps_exec.sh 'hostname && ip -brief a'
USAGE
  exit 1
fi

vps_ssh "$*"
