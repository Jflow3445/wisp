#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

AUTO_FIX_RADIUS_BIND="${AUTO_FIX_RADIUS_BIND:-1}"

echo "== Router identity/user/radius snapshot =="
router_ssh '/system identity print; /user print detail; /radius print detail; /radius monitor [find where address="10.99.99.1"] once; /system script print detail where name="allowlist_update";'

echo
echo "== Residual check: RADIUS binding =="
status_out="$(router_ssh ':put ("RSTATUS=" . [/radius get [find where address="10.99.99.1"] status])' 2>&1 || true)"
radius_status="$(printf '%s\n' "$status_out" | sed -n 's/^RSTATUS=//p' | tail -n 1 | tr -d '\r')"

if [[ -z "${radius_status}" ]]; then
  echo "RADIUS bind status is healthy (empty). No remediation needed."
else
  echo "RADIUS bind status is non-empty: ${radius_status}"
  if [[ "$AUTO_FIX_RADIUS_BIND" != "1" ]]; then
    echo "Auto-fix disabled (AUTO_FIX_RADIUS_BIND=${AUTO_FIX_RADIUS_BIND})."
    exit 0
  fi

  set +e
  radius_set_out="$(router_ssh ':do { /radius set [find where address="10.99.99.1"] src-address=0.0.0.0; :put RADIUS_SET_OK } on-error={ :put RADIUS_SET_FAIL }' 2>&1)"
  rc=$?
  set -e
  printf '%s\n' "$radius_set_out"

  if [[ "$radius_set_out" == *"RADIUS_SET_OK"* ]]; then
    echo "RADIUS bind remediation applied: src-address cleared to auto."
    router_ssh '/radius print detail where address="10.99.99.1"; /radius monitor [find where address="10.99.99.1"] once;'
  elif [[ "$radius_set_out" == *"not enough permissions"* || "$radius_set_out" == *"RADIUS_SET_FAIL"* ]]; then
    echo "BLOCKED: current router account cannot modify /radius (needs higher policy, typically full/admin)."
    echo "Action needed: provide admin/full credential or temporarily grant certsync group with policy+ftp."
  else
    if (( rc != 0 )); then
      echo "RADIUS bind remediation command failed with exit code $rc"
    fi
  fi
fi
