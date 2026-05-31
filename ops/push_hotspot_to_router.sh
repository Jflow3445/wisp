#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

DEFAULT_FILES=(
  hotspot/alogin.html
  hotspot/api.json
  hotspot/change-password.html
  hotspot/common.css
  hotspot/login.html
  hotspot/logout.html
  hotspot/md5.js
  hotspot/pay.html
  hotspot/radvert.html
  hotspot/redirect.html
  hotspot/registration-success.html
  hotspot/reset-password.html
  hotspot/rlogin.html
  hotspot/signup.html
  hotspot/status.html
  hotspot/error.html
  hotspot/css/error.html
  hotspot/css/style.css
  hotspot/errors.txt
)

if [[ $# -gt 0 ]]; then
  FILES=("$@")
else
  FILES=("${DEFAULT_FILES[@]}")
fi

for rel in "${FILES[@]}"; do
  if [[ ! -f "$REPO_ROOT/$rel" ]]; then
    echo "ERR missing file: $REPO_ROOT/$rel" >&2
    exit 1
  fi
done

require_var VPS_HOST
ROUTER_USER="${ROUTER_USER:-certsync}"
ROUTER_HOST="${ROUTER_HOST:-10.10.20.2}"
ROUTER_SSH_KEY_ON_VPS="${ROUTER_SSH_KEY_ON_VPS:-/root/.ssh/mikrotik_certsync}"
ROUTER_PASS="${ROUTER_PASS:-}"
VPS_BIND_IP="${VPS_TUNNEL_IP:-10.99.99.1}"
HTTP_PORT="${ROUTER_PUSH_HTTP_PORT:-0}"
if [[ "$HTTP_PORT" == "0" ]]; then
  HTTP_PORT="$((20000 + RANDOM % 20000))"
fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGE_DIR="/root/wisp_hotspot_push_${STAMP}"
PID_FILE="/tmp/wisp_hotspot_push_http_${STAMP}.pid"

printf 'Staging files on VPS: %s\n' "$STAGE_DIR"
tar czf - -C "$REPO_ROOT" "${FILES[@]}" | vps_ssh "mkdir -p '$STAGE_DIR' && tar xzf - -C '$STAGE_DIR'"

printf 'Attempting SCP push via VPS -> Router...\n'
if vps_ssh bash -s -- "$STAGE_DIR" "$ROUTER_USER" "$ROUTER_HOST" "$ROUTER_SSH_KEY_ON_VPS" "$ROUTER_PASS" "${FILES[@]}" <<'VPS_SCP'
set -euo pipefail
stage_dir="$1"; shift
router_user="$1"; shift
router_host="$1"; shift
router_key="$1"; shift
router_pass="$1"; shift
files=("$@")

base_scp=(scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null)
if [[ -n "$router_pass" ]]; then
  command -v sshpass >/dev/null 2>&1 || { echo "ERR sshpass missing on VPS" >&2; exit 2; }
  for rel in "${files[@]}"; do
    src="$stage_dir/$rel"
    dst="flash/$rel"
    sshpass -p "$router_pass" "${base_scp[@]}" "$src" "${router_user}@${router_host}:$dst"
  done
else
  for rel in "${files[@]}"; do
    src="$stage_dir/$rel"
    dst="flash/$rel"
    "${base_scp[@]}" -i "$router_key" "$src" "${router_user}@${router_host}:$dst"
  done
fi
VPS_SCP
then
  echo "SCP push succeeded."
  METHOD="scp"
else
  echo "SCP push failed; attempting router pull via /tool fetch..."
  METHOD="fetch"

  vps_ssh "nohup python3 -m http.server '$HTTP_PORT' --bind '$VPS_BIND_IP' --directory '$STAGE_DIR' >/tmp/wisp_hotspot_push_http.log 2>&1 & echo \$! > '$PID_FILE'"
  sleep 1

  fetch_fail=0
  for rel in "${FILES[@]}"; do
    url="http://${VPS_BIND_IP}:${HTTP_PORT}/${rel}"
    dst="flash/${rel}"
    cmd="/tool fetch url=\"${url}\" dst-path=\"${dst}\" keep-result=yes"
    if ! out="$(router_ssh "$cmd" 2>&1)"; then
      fetch_fail=1
    elif [[ "$out" == *"failure:"* || "$out" == *"permission denied"* ]]; then
      fetch_fail=1
    fi
    printf '%s\n' "$out"
  done

  vps_ssh "if [[ -f '$PID_FILE' ]]; then kill \"\$(cat '$PID_FILE')\" >/dev/null 2>&1 || true; rm -f '$PID_FILE'; fi"

  if (( fetch_fail != 0 )); then
    echo "WARN router /tool fetch reported errors; continuing to size verification." >&2
  fi
fi

echo "Verifying router file sizes and residual RADIUS status..."
verify_fail=0
for rel in "${FILES[@]}"; do
  local_size="$(wc -c < "$REPO_ROOT/$rel" | tr -d '[:space:]')"
  remote_out="$(router_ssh ":put (\"SIZE:${rel}=\" . [/file get flash/${rel} size])" 2>&1 || true)"
  remote_size="$(
    printf '%s\n' "$remote_out" \
      | awk -v p="SIZE:${rel}=" '
          index($0,p) {
            s=substr($0, index($0,p) + length(p));
            gsub(/\r/, "", s);
            sub(/[^0-9].*$/, "", s);
            if (s ~ /^[0-9]+$/) print s;
          }
        ' \
      | tail -n 1
  )"
  if [[ -z "$remote_size" ]]; then
    echo "ERR could not read remote size for flash/${rel}" >&2
    printf '%s\n' "$remote_out" >&2
    verify_fail=1
    continue
  fi
  if [[ "$remote_size" != "$local_size" ]]; then
    echo "ERR size mismatch for flash/${rel}: local=${local_size} remote=${remote_size}" >&2
    verify_fail=1
  else
    echo "OK flash/${rel} size=${remote_size}"
  fi
done
router_ssh ':foreach r in=[/radius find] do={:put ("RADIUS id=" . $r . " disabled=" . [/radius get $r disabled] . " service=" . [/radius get $r service] . " address=" . [/radius get $r address] . " status=" . [/radius get $r status])}'

if (( verify_fail != 0 )); then
  echo "ERR router hotspot deploy verification failed." >&2
  exit 4
fi

echo "Done (method=$METHOD)."
