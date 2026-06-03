#!/usr/bin/env bash
set -euo pipefail

API_HOST="${API_HOST:-api.nister.org}"
BASE="https://${API_HOST}"
CURL=(curl -sS --max-time 10)

fail() {
  printf 'FAIL %s\n' "$*" >&2
  exit 1
}

status_code() {
  local method="$1"
  local url="$2"
  shift 2
  "${CURL[@]}" -o /tmp/nister_api_boundary_body -w '%{http_code}' -X "$method" "$@" "$url"
}

expect_code() {
  local name="$1"
  local expected="$2"
  local method="$3"
  local url="$4"
  shift 4
  local got
  got="$(status_code "$method" "$url" "$@")"
  [[ "$got" == "$expected" ]] || fail "$name expected HTTP $expected got $got"
  printf 'PASS %s HTTP %s\n' "$name" "$got"
}

expect_not_200() {
  local name="$1"
  local method="$2"
  local url="$3"
  shift 3
  local got
  got="$(status_code "$method" "$url" "$@")"
  [[ "$got" != "200" ]] || fail "$name unexpectedly returned HTTP 200"
  printf 'PASS %s HTTP %s\n' "$name" "$got"
}

for path in / /index.html /login.html /status.html /signup.html /api.json /hotspot/_db.php /hotspot/_paylib.php; do
  expect_not_200 "api_host_blocks_${path//[^A-Za-z0-9]/_}" GET "${BASE}${path}"
done

expect_code "api_status_reachable" 400 GET "${BASE}/hotspot-api/status.php" -H 'Origin: null'
expect_code "otp_send_preflight" 204 OPTIONS "${BASE}/hotspot/otp_send.php" -H 'Origin: https://wifi.nister.org'
expect_code "otp_verify_preflight" 204 OPTIONS "${BASE}/hotspot/otp_verify.php" -H 'Origin: https://wifi.nister.org'
expect_code "signup_endpoint_reachable" 303 GET "${BASE}/hotspot/signup.php"

printf 'API host boundary checks passed for %s.\n' "$API_HOST"
