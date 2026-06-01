#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'
umask 077

STATE_DIR="/var/lib/freeradius/nister-quota"
mkdir -p "$STATE_DIR"

PROXYCONF="${PROXYCONF:-/etc/freeradius/3.0/proxy.conf}"
COA_NAME="${COA_NAME:-mikrotik_coa}"
NAS_IP="${NAS_IP:-}"         # optional override
NAS_IPS="${NAS_IPS:-}"
COA_PORT="${COA_PORT:-}"     # optional override
COA_SECRET="${COA_SECRET:-}" # optional override

HS_ACTIVE="${HS_ACTIVE:-HS_ACTIVE}"
HS_LIMITED="${HS_LIMITED:-HS_LIMITED}"
HS_NOPAID="${HS_NOPAID:-HS_NOPAID}"
LEGACY_NOPAID="${LEGACY_NOPAID:-nopaid}"
HS_PRIO="${HS_PRIO:-0}"

die(){ echo "ERROR: $*" >&2; exit 2; }
need(){ command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"; }
validate_group_name(){
  local name="$1" value="$2"
  [[ "$value" =~ ^[A-Za-z0-9_:-]+$ ]] || die "Invalid group name in ${name}"
}

validate_group_name HS_ACTIVE "$HS_ACTIVE"
validate_group_name HS_LIMITED "$HS_LIMITED"
validate_group_name HS_NOPAID "$HS_NOPAID"
validate_group_name LEGACY_NOPAID "$LEGACY_NOPAID"

is_valid_ipv4(){
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS='.' read -r a b c d <<<"$1"
  for o in "$a" "$b" "$c" "$d"; do
    [[ "$o" =~ ^[0-9]+$ ]] || return 1
    (( o >= 0 && o <= 255 )) || return 1
  done
  return 0
}
is_private_or_cgnat_ipv4(){
  local a b c d
  is_valid_ipv4 "$1" || return 1
  IFS='.' read -r a b c d <<<"$1"
  [[ "$a" == "10" ]] && return 0
  [[ "$a" == "192" && "$b" == "168" ]] && return 0
  [[ "$a" == "172" && "$b" -ge 16 && "$b" -le 31 ]] && return 0
  [[ "$a" == "100" && "$b" -ge 64 && "$b" -le 127 ]] && return 0
  return 1
}
route_dev_for_ip(){
  ip route get "$1" 2>/dev/null | awk '{
    for (i=1; i<=NF; i++) {
      if ($i == "dev" && (i+1) <= NF) { print $(i+1); exit }
    }
  }'
}
coa_target_reachable(){
  local target="$1" dev
  is_valid_ipv4 "$target" || return 1
  if is_private_or_cgnat_ipv4 "$target"; then
    dev="$(route_dev_for_ip "$target")"
    [[ "$dev" == ppp* ]] || return 1
  fi
  return 0
}
is_valid_mac(){
  [[ "${1^^}" =~ ^([0-9A-F]{2}:){5}[0-9A-F]{2}$ ]]
}
is_allowed_nas(){
  local ip="$1"
  [[ -z "${NAS_IPS:-}" ]] && return 0
  IFS=',' read -r -a _tmp <<< "${NAS_IPS// /,}"
  for n in "${_tmp[@]}"; do
    [[ "$n" == "$ip" ]] && return 0
  done
  return 1
}

SQLMOD="$(readlink -f /etc/freeradius/3.0/mods-enabled/sql)"
get_kv() {
  awk -F= -v k="$1" '$0 ~ "^[[:space:]]*"k"[[:space:]]*=" {
    v=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", v); gsub(/^"+|"+$/, "", v);
    print v; exit
  }' "$SQLMOD"
}

DB_HOST="$(get_kv server)"
DB_PORT="$(get_kv port)"; DB_PORT="${DB_PORT:-3306}"
DB_USER="$(get_kv login)"
DB_NAME="$(get_kv radius_db)"
DB_PASS="$(awk -F= '/^[[:space:]]*password[[:space:]]*=/{sub(/^[[:space:]]*/,"",$2);gsub(/^[ "]+|[ "]+$/,"",$2);print $2;exit}' "$SQLMOD")"

CNF="$(mktemp -p "$STATE_DIR" .mysql.XXXXXX)"
chmod 600 "$CNF"
cat >"$CNF" <<EOF2
[client]
host=$DB_HOST
port=$DB_PORT
user=$DB_USER
password=$DB_PASS
database=$DB_NAME
EOF2
cleanup(){ rm -f "$CNF"; }
trap cleanup EXIT

mysqlq(){ mysql --defaults-extra-file="$CNF" -N -B -e "$1"; }
mysqlexec(){ mysql --defaults-extra-file="$CNF" -e "$1"; }

digits_only(){
  local u
  u="$(echo "${1:-}" | tr -cd '0-9')"
  [[ -n "$u" ]] || die "Bad msisdn (no digits)"
  echo "$u"
}

# one username per line (no spaces)
variants(){
  local u="$1"
  echo "$u"
  if [[ "$u" =~ ^0[0-9]{9}$ ]]; then
    echo "233${u:1}"
  elif [[ "$u" =~ ^233[0-9]{9}$ ]]; then
    echo "0${u:3}"
  fi
}

msisdn_local(){
  local d="${1//[^0-9]/}"
  [[ -z "$d" ]] && echo "" && return 0
  if [[ "$d" =~ ^233[0-9]{9}$ ]]; then
    echo "0${d:3}"
  elif [[ "$d" =~ ^0[0-9]{9}$ ]]; then
    echo "$d"
  else
    echo "$d"
  fi
}

LOGICAL_OPEN_RECENT_MINUTES="${LOGICAL_OPEN_RECENT_MINUTES:-30}"
[[ "$LOGICAL_OPEN_RECENT_MINUTES" =~ ^[0-9]+$ ]] || LOGICAL_OPEN_RECENT_MINUTES=30
RADACCT_LOGICAL_OPEN_SQL="(
  (acctstoptime IS NULL OR acctstoptime='0000-00-00 00:00:00')
  OR (
    acctstoptime IS NOT NULL
    AND acctstoptime<>'0000-00-00 00:00:00'
    AND COALESCE(acctupdatetime, acctstarttime) > acctstoptime
    AND COALESCE(acctupdatetime, acctstarttime) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${LOGICAL_OPEN_RECENT_MINUTES} MINUTE)
  )
)"

sql_in(){
  local out="" x
  for x in "$@"; do out+="'$x',"; done
  echo "${out%,}"
}

# ---------- bytes helpers ----------
parse_bytes(){
  local s
  s="$(echo "${1:-}" | tr '[:lower:]' '[:upper:]' | tr -d ' ')"
  [[ -n "$s" ]] || die "amount required"

  if [[ "$s" =~ ^[0-9]+$ ]]; then echo "$s"; return 0; fi
  [[ "$s" =~ ^([0-9]+)(B|KB|MB|GB|TB|KIB|MIB|GIB|TIB)$ ]] || die "Bad amount (e.g. 500MB, 10GiB, 1048576)"

  local n="${BASH_REMATCH[1]}" u="${BASH_REMATCH[2]}" mult=1
  case "$u" in
    B)   mult=1 ;;
    KB)  mult=1000 ;;
    MB)  mult=1000000 ;;
    GB)  mult=1000000000 ;;
    TB)  mult=1000000000000 ;;
    KIB) mult=1024 ;;
    MIB) mult=$((1024*1024)) ;;
    GIB) mult=$((1024*1024*1024)) ;;
    TIB) mult=$((1024*1024*1024*1024)) ;;
  esac
  echo $(( n * mult ))
}

hilo_to_bytes(){
  local hi="${1:-0}" lo="${2:-0}"
  [[ "$hi" =~ ^[0-9]+$ ]] || hi=0
  [[ "$lo" =~ ^[0-9]+$ ]] || lo=0
  echo $(( hi*4294967296 + (lo % 4294967296) ))
}

bytes_to_hilo(){
  local b="${1:-0}"
  [[ "$b" =~ ^[0-9]+$ ]] || b=0
  local hi=$(( b/4294967296 ))
  local lo=$(( b%4294967296 ))
  printf '%s	%s
' "$hi" "$lo"
}
get_user_cap_bytes_one(){
  local u="$1" hi="" lo="" q=""
  q="$(mysqlq "SELECT value FROM radreply WHERE username='${u}' AND attribute='Nister-Quota-Bytes' ORDER BY id DESC LIMIT 1;" || true)"
  [[ "$q" =~ ^[0-9]+$ && "$q" -gt 0 ]] && { echo "$q"; return 0; }
  while IFS=$'\t' read -r attr val; do
    [[ -n "$attr" ]] || continue
    [[ "$attr" == "Mikrotik-Total-Limit-Gigawords" && -z "$hi" ]] && hi="$val"
    [[ "$attr" == "Mikrotik-Total-Limit" && -z "$lo" ]] && lo="$val"
    [[ -n "$hi" && -n "$lo" ]] && break
  done < <(mysqlq "
    SELECT attribute, value
    FROM radreply
    WHERE username='${u}'
      AND attribute IN ('Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')
    ORDER BY id DESC;" || true)
  hi="${hi:-0}"; lo="${lo:-0}"
  hilo_to_bytes "$hi" "$lo"
}

get_cap_bytes(){
  local max=0 u b
  for u in "$@"; do
    b="$(get_user_cap_bytes_one "$u" || echo 0)"
    [[ "$b" =~ ^[0-9]+$ ]] || b=0
    (( b > max )) && max="$b"
  done
  echo "$max"
}

set_cap_bytes(){
  local bytes="$1"; shift
  local in_list; in_list="$(sql_in "$@")"
  read -r hi lo < <(bytes_to_hilo "$bytes")

  local vals="" u
  for u in "$@"; do
    vals+="('${u}','Nister-Quota-Bytes',':=','${bytes}'),"
    vals+="('${u}','Mikrotik-Total-Limit-Gigawords',':=','${hi}'),"
    vals+="('${u}','Mikrotik-Total-Limit',':=','${lo}'),"
  done
  vals="${vals%,}"

  mysqlexec "
START TRANSACTION;
DELETE FROM radreply
WHERE username IN (${in_list})
  AND attribute IN ('Nister-Quota-Bytes','Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords');
INSERT INTO radreply (username,attribute,op,value) VALUES ${vals};
COMMIT;"
}

# ---------- expiry helpers (IMPORTANT: radcheck.Expiration) ---------- ----------
resolve_expiry(){
  # relative: 15m,2h,1d,90s => now + duration (UTC)
  # absolute: anything GNU date understands
  local spec="${1:-}"
  [[ -n "$spec" ]] || die "expiry spec required"
  if [[ "$spec" =~ ^([0-9]+)(s|m|h|d)$ ]]; then
    local n="${BASH_REMATCH[1]}" u="${BASH_REMATCH[2]}"
    case "$u" in
      s) date -u -d "now + ${n} seconds" '+%d %b %Y %H:%M:%S' ;;
      m) date -u -d "now + ${n} minutes" '+%d %b %Y %H:%M:%S' ;;
      h) date -u -d "now + ${n} hours"   '+%d %b %Y %H:%M:%S' ;;
      d) date -u -d "now + ${n} days"    '+%d %b %Y %H:%M:%S' ;;
    esac
  else
    date -u -d "$spec" '+%d %b %Y %H:%M:%S'
  fi
}

set_expiry(){
  local spec="$1"; shift
  local val; val="$(resolve_expiry "$spec")" || die "Bad date/time: $spec"
  local in_list; in_list="$(sql_in "$@")"

  mysqlexec "
START TRANSACTION;
$(for u in "$@"; do
  echo "DELETE FROM radcheck WHERE username='${u}' AND attribute='Expiration';"
  echo "INSERT INTO radcheck (username,attribute,op,value) VALUES ('${u}','Expiration',':=','${val}');"
done)
COMMIT;"
}

get_expiry_one(){
  local u="$1"
  mysqlq "SELECT value FROM radcheck WHERE username='${u}' AND attribute='Expiration' ORDER BY id DESC LIMIT 1;" || true
}

expiry_add(){
  local add="$1"; shift
  [[ "$add" =~ ^[0-9]+[smhd]$ ]] || die "expiry-add expects like 15m / 2h / 1d / 90s"

  local base="" u
  for u in "$@"; do
    base="$(get_expiry_one "$u" || true)"
    [[ -n "$base" ]] && break
  done
  [[ -n "$base" ]] || { set_expiry "$add" "$@"; return 0; }

  local n unit phrase
  n="${add%[smhd]}"; unit="${add: -1}"
  case "$unit" in
    s) phrase="${base} + ${n} seconds" ;;
    m) phrase="${base} + ${n} minutes" ;;
    h) phrase="${base} + ${n} hours"   ;;
    d) phrase="${base} + ${n} days"    ;;
  esac

  local val
  val="$(date -u -d "$phrase" '+%d %b %Y %H:%M:%S')" || die "Failed to compute new expiry"

  mysqlexec "
START TRANSACTION;
$(for u in "$@"; do
  echo "DELETE FROM radcheck WHERE username='${u}' AND attribute='Expiration';"
  echo "INSERT INTO radcheck (username,attribute,op,value) VALUES ('${u}','Expiration',':=','${val}');"
done)
COMMIT;"
}

expiry_clear(){
  local in_list; in_list="$(sql_in "$@")"
  mysqlexec "
START TRANSACTION;
DELETE FROM radcheck WHERE username IN (${in_list}) AND attribute='Expiration';
COMMIT;"
}

# ---------- HS group helpers ----------
hs_set(){
  local target="$1"; shift
  [[ "$target" == "$HS_ACTIVE" || "$target" == "$HS_LIMITED" || "$target" == "$HS_NOPAID" ]] || die "Bad HS target: $target"
  local in_list; in_list="$(sql_in "$@")"

  local vals="" u
  for u in "$@"; do
    vals+="('${u}','${target}',${HS_PRIO}),"
  done
  vals="${vals%,}"

  mysqlexec "
START TRANSACTION;
DELETE FROM radreply
WHERE username IN (${in_list})
  AND attribute IN ('Mikrotik-Address-List','MT-Address-List');

DELETE FROM radusergroup
WHERE username IN (${in_list})
  AND groupname IN ('${HS_ACTIVE}','${HS_LIMITED}','${HS_NOPAID}','${LEGACY_NOPAID}');
INSERT INTO radusergroup (username,groupname,priority) VALUES ${vals};
COMMIT;"
}
# ---------- CoA helpers ----------
load_coa_target(){
  if [[ -z "${NAS_IP:-}" ]]; then
    NAS_IP="$(awk -v n="$COA_NAME" '
      $1=="home_server" && $2==n {blk=1; next}
      blk && $1=="ipaddr" {gsub(/"|;/,"",$3); print $3; exit}
      blk && $0 ~ /}/ {blk=0}
    ' "$PROXYCONF" 2>/dev/null || true)"
  fi
  if [[ -z "${COA_PORT:-}" ]]; then
    COA_PORT="$(awk -v n="$COA_NAME" '
      $1=="home_server" && $2==n {blk=1; next}
      blk && $1=="port" {gsub(/"|;/,"",$3); print $3; exit}
      blk && $0 ~ /}/ {blk=0}
    ' "$PROXYCONF" 2>/dev/null || true)"
  fi
  if [[ -z "${COA_SECRET:-}" ]]; then
    COA_SECRET="$(awk -v n="$COA_NAME" '
      $1=="home_server" && $2==n {blk=1; next}
      blk && $1=="secret" {gsub(/"|;/,"",$3); print $3; exit}
      blk && $0 ~ /}/ {blk=0}
    ' "$PROXYCONF" 2>/dev/null || true)"
  fi
  COA_PORT="${COA_PORT:-3799}"
  [[ -n "${NAS_IP:-}" && -n "${COA_SECRET:-}" ]] || die "Could not load CoA target/secret (set NAS_IP/COA_PORT/COA_SECRET or fix proxy.conf)"
}

kick_user(){
  need radclient
  load_coa_target
  if [[ -z "${NAS_IP:-}" && -n "${NAS_IPS:-}" ]]; then
    NAS_IP="${NAS_IPS%%,*}"
  fi
  local coa_secret_file
  coa_secret_file="$(mktemp -p "$STATE_DIR" .coa_secret.XXXXXX)"
  chmod 600 "$coa_secret_file"
  printf '%s' "$COA_SECRET" >"$coa_secret_file"
  trap 'rm -f "$coa_secret_file"' RETURN

  local in_list; in_list="$(sql_in "$@")"
  mapfile -t rows < <(mysqlq "
    SELECT username, framedipaddress, acctsessionid, nasipaddress, callingstationid
    FROM radacct
    WHERE username IN (${in_list})
      AND ${RADACCT_LOGICAL_OPEN_SQL}
    ORDER BY acctstarttime DESC
    LIMIT 50;" || true)

  (( ${#rows[@]} > 0 )) || { echo "[*] No active session found -> nothing to kick."; return 0; }

  local ok=0 fail=0 row u ip sid nas mac sid_safe payload payload_lines out
  local u_coa candidate sent_ok last_out
  local -a coa_users tried_users
  for row in "${rows[@]}"; do
    IFS=$'\t' read -r u ip sid nas mac <<<"$row"
    [[ -n "${u:-}" ]] || continue
    sid_safe="$(echo "${sid:-}" | tr -cd 'A-Za-z0-9._:-')"
    if [[ -z "${sid_safe:-}" ]] && ! is_valid_ipv4 "${ip:-}"; then
      echo "[*] Skip user=$u (missing Acct-Session-Id and valid Framed-IP-Address) sid=${sid:-na}"
      continue
    fi
    if ! is_valid_ipv4 "${nas:-}"; then nas="${NAS_IP}"; fi
    if ! is_allowed_nas "${nas:-}"; then
      echo "[*] Skip user=$u (nas not allowed by NAS_IPS) nas=${nas:-na}"
      continue
    fi
    if ! coa_target_reachable "${nas:-${NAS_IP}}"; then
      echo "[*] Skip user=$u (coa target unreachable) nas=${nas:-${NAS_IP}} route_dev=$(route_dev_for_ip "${nas:-${NAS_IP}}" || true)"
      continue
    fi

    echo "[*] Kicking user=$u ip=${ip:-na} sid=${sid_safe:-na} mac=${mac:-na} via ${nas:-${NAS_IP}}:${COA_PORT}"
    coa_users=("$u")
    candidate="$(msisdn_local "$u")"
    [[ -n "${candidate:-}" ]] && coa_users+=("$candidate")
    if [[ "$u" =~ ^0[0-9]{9}$ ]]; then
      coa_users+=("233${u:1}")
    fi

    sent_ok=0
    tried_users=()
    last_out=""
    for u_coa in "${coa_users[@]}"; do
      [[ -n "${u_coa:-}" ]] || continue
      [[ " ${tried_users[*]} " == *" ${u_coa} "* ]] && continue
      tried_users+=("$u_coa")

      payload_lines=()
      payload_lines+=("User-Name = \"${u_coa}\"")
      [[ -n "${sid_safe:-}" ]] && payload_lines+=("Acct-Session-Id = \"${sid_safe}\"")
      if is_valid_ipv4 "${ip:-}"; then
        payload_lines+=("Framed-IP-Address = ${ip}")
      fi
      if is_valid_mac "${mac:-}"; then
        payload_lines+=("Calling-Station-Id = \"${mac^^}\"")
      fi
      payload_lines+=("NAS-IP-Address = ${nas:-${NAS_IP}}")
      payload_lines+=("Message-Authenticator = 0x00")
      payload="$(printf '%s\n' "${payload_lines[@]}")"

      out="$(printf '%s' "$payload" | radclient -r 1 -t 3 -S "$coa_secret_file" "${nas:-${NAS_IP}}:${COA_PORT}" disconnect 2>&1 || true)"
      last_out="$out"
      if echo "$out" | grep -q "Disconnect-ACK"; then
        sent_ok=1
        break
      fi
    done

    if (( sent_ok == 1 )); then
      ((ok+=1))
    else
      ((fail+=1))
      echo "[*] CoA failed user=$u coa_users=${tried_users[*]:-na} sid=${sid_safe:-na} ip=${ip:-na} mac=${mac:-na} out=$(echo "$last_out" | tr '\n' ' ' | head -c 220)"
    fi
  done
  echo "[*] kick done: ok=$ok fail=$fail"
}

show_user(){
  local in_list; in_list="$(sql_in "$@")"
  echo "[*] Users: $*"

  echo "[*] radusergroup:"
  mysql --defaults-extra-file="$CNF" -e "SELECT username,groupname,priority FROM radusergroup WHERE username IN (${in_list}) ORDER BY username,priority,id;" || true

  echo "[*] radreply caps:"
  mysql --defaults-extra-file="$CNF" -e "
    SELECT username,id,attribute,op,value
    FROM radreply
    WHERE username IN (${in_list})
      AND attribute IN ('Nister-Quota-Bytes','Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')
    ORDER BY username,id;" || true

  local cap; cap="$(get_cap_bytes "$@")"
  echo "[*] Cap bytes: $cap"
  awk -v b="$cap" 'BEGIN{printf("[*] Cap GiB  : %.4f\n", b/(1024^3)); printf("[*] Cap GB   : %.4f\n", b/1e9);}'
  echo "[*] Active sessions:"
  mysql --defaults-extra-file="$CNF" -e "
    SELECT username, framedipaddress, acctsessionid, nasipaddress, acctstarttime
    FROM radacct
    WHERE username IN (${in_list}) AND ${RADACCT_LOGICAL_OPEN_SQL}
    ORDER BY acctstarttime DESC
    LIMIT 10;" || true
}

usage(){
  cat >&2 <<'USG'
Usage:
  nister_user_admin.sh show <msisdn>

  nister_user_admin.sh add <msisdn> <amount> [--kick]
  nister_user_admin.sh deduct <msisdn> <amount> [--kick]
  nister_user_admin.sh set <msisdn> <amount> [--kick]

  nister_user_admin.sh expiry-set <msisdn> <spec> [--kick]
    - relative: 15m / 2h / 1d / 90s  (now + duration, UTC)
    - absolute: "2026-01-01 12:00"

  nister_user_admin.sh expiry-add <msisdn> <15m|2h|1d|90s> [--kick]
  nister_user_admin.sh expiry-clear <msisdn> [--kick]

  nister_user_admin.sh hs-active <msisdn> [--kick]
  nister_user_admin.sh hs-limited <msisdn> [--kick]
  nister_user_admin.sh hs-nopaid <msisdn> [--kick]

  nister_user_admin.sh kick <msisdn>
USG
  exit 2
}

need mysql
need radclient

cmd="${1:-}"; shift || true
[[ -n "$cmd" ]] || usage

kick_after=0
if [[ "${*: -1}" == "--kick" ]]; then
  kick_after=1
  set -- "${@:1:$(($#-1))}"
fi

msisdn="${1:-}"; shift || true
[[ -n "$msisdn" ]] || usage
msisdn="$(digits_only "$msisdn")"
mapfile -t USERS < <(variants "$msisdn" | awk '!seen[$0]++')

case "$cmd" in
  show) show_user "${USERS[@]}" ;;
  add|deduct|set)
    amt="${1:-}"; [[ -n "$amt" ]] || die "amount required"
    bytes="$(parse_bytes "$amt")"
    cur="$(get_cap_bytes "${USERS[@]}")"
    new="$cur"
    case "$cmd" in
      add)    new=$(( cur + bytes )) ;;
      deduct) new=$(( cur - bytes )); (( new < 0 )) && new=0 ;;
      set)    new="$bytes" ;;
    esac
    set_cap_bytes "$new" "${USERS[@]}"
    echo "[OK] cap: $cur -> $new bytes"
    (( kick_after == 1 )) && kick_user "${USERS[@]}"
    ;;
  expiry-set)
    spec="${1:-}"; [[ -n "$spec" ]] || die "expiry spec required"
    set_expiry "$spec" "${USERS[@]}"
    echo "[OK] expiry set"
    (( kick_after == 1 )) && kick_user "${USERS[@]}"
    ;;
  expiry-add)
    add="${1:-}"; [[ -n "$add" ]] || die "duration required (e.g. 15m)"
    expiry_add "$add" "${USERS[@]}"
    echo "[OK] expiry extended by $add"
    (( kick_after == 1 )) && kick_user "${USERS[@]}"
    ;;
  expiry-clear)
    expiry_clear "${USERS[@]}"
    echo "[OK] expiry cleared"
    (( kick_after == 1 )) && kick_user "${USERS[@]}"
    ;;
  hs-active)
    hs_set "$HS_ACTIVE" "${USERS[@]}"
    echo "[OK] HS -> $HS_ACTIVE"
    (( kick_after == 1 )) && kick_user "${USERS[@]}"
    ;;
  hs-limited)
    hs_set "$HS_LIMITED" "${USERS[@]}"
    echo "[OK] HS -> $HS_LIMITED"
    (( kick_after == 1 )) && kick_user "${USERS[@]}"
    ;;
  hs-nopaid)
    hs_set "$HS_NOPAID" "${USERS[@]}"
    echo "[OK] HS -> $HS_NOPAID"
    (( kick_after == 1 )) && kick_user "${USERS[@]}"
    ;;
  kick)
    kick_user "${USERS[@]}"
    ;;
  *) usage ;;
esac
