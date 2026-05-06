#!/usr/bin/env bash
set -euo pipefail

OPS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$OPS_DIR/.." && pwd)"
OPS_ENV_FILE="${OPS_ENV_FILE:-$OPS_DIR/.env.ops}"

if [[ -f "$OPS_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$OPS_ENV_FILE"
fi

SSH_OPTS=(
  -o StrictHostKeyChecking=no
  -o UserKnownHostsFile=/dev/null
)

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERR missing dependency: $1" >&2
    exit 1
  }
}

require_var() {
  local name="$1"
  [[ -n "${!name:-}" ]] || {
    echo "ERR missing required env: $name (set in $OPS_ENV_FILE)" >&2
    exit 1
  }
}

vps_ssh() {
  require_var VPS_HOST
  local user="${VPS_USER:-root}"
  if [[ -n "${VPS_PASS:-}" ]]; then
    need_cmd sshpass
    sshpass -p "$VPS_PASS" ssh "${SSH_OPTS[@]}" "${user}@${VPS_HOST}" "$@"
  else
    local key_opts=()
    if [[ -n "${VPS_SSH_KEY:-}" ]]; then
      key_opts=(-i "$VPS_SSH_KEY")
    fi
    ssh "${SSH_OPTS[@]}" "${key_opts[@]}" "${user}@${VPS_HOST}" "$@"
  fi
}

router_ssh() {
  local ros_cmd="$*"
  [[ -n "$ros_cmd" ]] || {
    echo "ERR router_ssh requires a RouterOS command string" >&2
    return 1
  }

  local router_user="${ROUTER_USER:-certsync}"
  local router_host="${ROUTER_HOST:-10.10.20.2}"
  local router_key_on_vps="${ROUTER_SSH_KEY_ON_VPS:-/root/.ssh/mikrotik_certsync}"
  local router_pass="${ROUTER_PASS:-}"
  local ros_b64
  ros_b64="$(printf '%s' "$ros_cmd" | base64 | tr -d '\n')"

  vps_ssh "ROS_B64='$ros_b64' ROUTER_USER='$router_user' ROUTER_HOST='$router_host' ROUTER_SSH_KEY_ON_VPS='$router_key_on_vps' ROUTER_PASS='$router_pass' bash -s" <<'VPS'
set -euo pipefail
cmd="$(printf '%s' "$ROS_B64" | base64 -d)"
if [[ -n "${ROUTER_PASS:-}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "ERR sshpass missing on VPS for ROUTER_PASS flow" >&2
    exit 1
  fi
  sshpass -p "$ROUTER_PASS" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${ROUTER_USER}@${ROUTER_HOST}" "$cmd"
else
  ssh -i "$ROUTER_SSH_KEY_ON_VPS" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${ROUTER_USER}@${ROUTER_HOST}" "$cmd"
fi
VPS
}
