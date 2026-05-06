#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

if [[ $# -lt 1 ]]; then
  cat <<'USAGE' >&2
Usage:
  ops/router_exec.sh '<RouterOS command>'

Examples:
  ops/router_exec.sh '/system identity print'
  ops/router_exec.sh '/radius print detail'
USAGE
  exit 1
fi

router_ssh "$*"
