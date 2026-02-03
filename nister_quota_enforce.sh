#!/usr/bin/env bash
set -euo pipefail
umask 077

USER="${1:-}"
MODE="${2:-}"   # optional: --force | --limit
if [[ -n "${USER:-}" ]]; then
  [[ "$USER" =~ ^[0-9]{10,12}$ ]] || exit 0
fi

STATE_DIR="/var/lib/freeradius/nister-quota"
LOG_FILE="/var/log/freeradius/nister-quota.log"
mkdir -p "$STATE_DIR"
touch "$LOG_FILE" || true

log(){ local msg="$1"; printf '%s %s\n' "$(date -Is)" "$msg" >>"$LOG_FILE" || true; logger -t nister-quota -- "$msg" || true; }
alert(){ 
  local msg="$1"
  local alert_log="/var/log/nister/alerts.log"
  mkdir -p /var/log/nister 2>/dev/null || true
  printf '%s %s\n' "$(date -Is)" "$msg" >>"$alert_log" || true
  logger -t nister-alert -- "$msg" || true
  if [[ -n "${ADMIN_ALERT_URL:-}" ]] && command -v curl >/dev/null 2>&1; then
    curl -sS -m 5 -X POST -H 'Content-Type: application/json' \
      -d "{\"ts\":\"$(date -Is)\",\"msg\":\"${msg//\"/\\\"}\"}" \
      "$ADMIN_ALERT_URL" >/dev/null 2>&1 || true
  fi
}

# debounce per user (unless forced/limit)
STAMP="$STATE_DIR/${USER}.stamp"
NOW_EPOCH="$(date +%s)"
if [[ -f "$STAMP" && "$MODE" != "--force" && "$MODE" != "--limit" ]]; then
  LAST="$(cat "$STAMP" 2>/dev/null || echo 0)"
  (( NOW_EPOCH - LAST < 30 )) && exit 0
fi
echo "$NOW_EPOCH" >"$STAMP"

need(){ command -v "$1" >/dev/null 2>&1 || { log "ERR user=$USER missing_dep=$1"; exit 0; }; }
need mysql
need radclient

# ---- DB creds from freeradius sql module ----
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
[[ -r /etc/nister/radius_mysql.cnf ]] && cp -f /etc/nister/radius_mysql.cnf "$CNF" || true
chmod 600 "$CNF"
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

sql_one(){ mysql --defaults-extra-file="$CNF" -N -B -e "$1" 2>/dev/null | head -n 1; }
sql_all(){ mysql --defaults-extra-file="$CNF" -N -B -e "$1" 2>/dev/null; }
sql_exec(){ mysql --defaults-extra-file="$CNF" -e "$1" 2>/dev/null; }

HS_ACTIVE="${HS_ACTIVE:-HS_ACTIVE}"
HS_LIMITED="${HS_LIMITED:-HS_LIMITED}"
HS_NOPAID="${HS_NOPAID:-HS_NOPAID}"
HS_PRIO="${HS_PRIO:-0}"

# SWEEP_NO_USER: if no USER passed, sweep active sessions and recently-limited users
if [[ -z "${USER:-}" ]]; then
  mapfile -t U < <(sql_all "
    SELECT DISTINCT username FROM radacct WHERE acctstoptime IS NULL
    UNION
    SELECT rug.username
    FROM radusergroup rug
    JOIN radcheck rc ON rc.username=rug.username AND rc.attribute='Expiration'
    WHERE rug.groupname='${HS_LIMITED}'
      AND STR_TO_DATE(rc.value, '%d %b %Y %H:%i:%s') > NOW()
  " | awk 'NF')
  for u in "${U[@]}"; do
    /usr/local/sbin/nister_quota_enforce.sh "$u" --force || true
  done
  exit 0
fi


# ---- username variants (0xxxxxxxxx <-> 233xxxxxxxxx) ----
declare -a USERS
USERS=("$USER")
if [[ "$USER" =~ ^0[0-9]{9}$ ]]; then
  USERS+=("233${USER:1}")
elif [[ "$USER" =~ ^233[0-9]{9}$ ]]; then
  USERS+=("0${USER:3}")
fi
mapfile -t USERS < <(printf "%s\n" "${USERS[@]}" | awk '!seen[$0]++')

sql_in_list(){ local out="" u; for u in "$@"; do out+="'$u',"; done; echo "${out%,}"; }
IN_USERS="$(sql_in_list "${USERS[@]}")"

# ---- CoA target(s) ----
PROXYCONF="/etc/freeradius/3.0/proxy.conf"
COA_NAME="${COA_NAME:-mikrotik_coa}"
COA_IP="$(awk -v n="$COA_NAME" '$1=="home_server"&&$2==n{blk=1;next} blk&&$1=="ipaddr"{gsub(/"|;/,"",$3);print $3;exit} blk&&/}/{blk=0}' "$PROXYCONF" 2>/dev/null || true)"
COA_PORT="$(awk -v n="$COA_NAME" '$1=="home_server"&&$2==n{blk=1;next} blk&&$1=="port"{gsub(/"|;/,"",$3);print $3;exit} blk&&/}/{blk=0}' "$PROXYCONF" 2>/dev/null || true)"
COA_SECRET="$(awk -v n="$COA_NAME" '$1=="home_server"&&$2==n{blk=1;next} blk&&$1=="secret"{gsub(/"|;/,"",$3);print $3;exit} blk&&/}/{blk=0}' "$PROXYCONF" 2>/dev/null || true)"
COA_PORT="${COA_PORT:-3799}"

NAS_RAW="${NAS_IPS:-${NAS_IP:-${COA_IP:-}}}"
NAS_RAW="${NAS_RAW// /,}"
NAS_IPS_LIST=()

is_valid_ipv4(){
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
  IFS='.' read -r a b c d <<<"$1"
  for o in "$a" "$b" "$c" "$d"; do
    [[ "$o" =~ ^[0-9]+$ ]] || return 1
    (( o >= 0 && o <= 255 )) || return 1
  done
  return 0
}
is_allowed_nas(){
  local ip="$1"
  for n in "${NAS_IPS_LIST[@]}"; do
    [[ "$n" == "$ip" ]] && return 0
  done
  return 1
}
IFS=',' read -r -a _tmp <<< "$NAS_RAW"
for ip in "${_tmp[@]}"; do
  ip="${ip//[[:space:]]/}"
  if [[ -n "$ip" ]] && is_valid_ipv4 "$ip"; then
    NAS_IPS_LIST+=("$ip")
  fi
done

[[ -n "${COA_SECRET:-}" && "${#NAS_IPS_LIST[@]}" -gt 0 ]] || { log "ERR user=$USER coa_target_missing"; exit 0; }

# ---- Mikrotik hilo helpers ----
hilo_to_bytes(){ local hi="${1:-0}" lo="${2:-0}"; [[ "$hi" =~ ^[0-9]+$ ]]||hi=0; [[ "$lo" =~ ^[0-9]+$ ]]||lo=0; echo $(( hi*4294967296 + (lo % 4294967296) )); }
bytes_to_hilo(){ local b="${1:-0}"; [[ "$b" =~ ^[0-9]+$ ]]||b=0; echo "$(( b/4294967296 )) $(( b%4294967296 ))"; }
get_user_cap_bytes(){
  local max=0 u hi lo b q
  for u in "${USERS[@]}"; do
    q="$(sql_one "SELECT value FROM radreply WHERE username='${u}' AND attribute='Nister-Quota-Bytes' ORDER BY id DESC LIMIT 1;" || true)"
    if [[ "${q:-}" =~ ^[0-9]+$ && "$q" -gt 0 ]]; then
      (( q > max )) && max="$q"
      continue
    fi
    hi="$(sql_one "SELECT value FROM radreply WHERE username='${u}' AND attribute='Mikrotik-Total-Limit-Gigawords' ORDER BY id DESC LIMIT 1;" || true)"
    lo="$(sql_one "SELECT value FROM radreply WHERE username='${u}' AND attribute='Mikrotik-Total-Limit' ORDER BY id DESC LIMIT 1;" || true)"
    b="$(hilo_to_bytes "${hi:-0}" "${lo:-0}")"
    [[ "$b" =~ ^[0-9]+$ ]] || b=0
    (( b > max )) && max="$b"
  done
  echo "$max"
}


get_plan(){
  sql_one "SELECT value FROM radreply WHERE username IN (${IN_USERS}) AND attribute='Nister-Plan-Code' ORDER BY username LIMIT 1;" || true
}

get_days(){
  local d
  d="$(sql_one "SELECT value FROM radreply WHERE username IN (${IN_USERS}) AND attribute='Nister-Duration-Days' ORDER BY username LIMIT 1;" || true)"
  [[ "${d:-}" =~ ^[0-9]+$ ]] && echo "$d" || echo 30
}

get_expiry_epoch(){
  local max=0 exp epoch
  while IFS= read -r exp; do
    [[ -n "${exp:-}" ]] || continue
    epoch="$(date -u -d "$exp" +%s 2>/dev/null || echo 0)"
    [[ "$epoch" =~ ^[0-9]+$ ]] || epoch=0
    (( epoch > max )) && max="$epoch"
  done < <(
    sql_all "SELECT value FROM radcheck WHERE username IN (${IN_USERS}) AND attribute='Expiration' ORDER BY id DESC LIMIT 10;" | awk 'NF'
  )
  echo "$max"
}

get_window_start(){
    local ws epoch fallback
    ws="$(sql_one "SELECT value FROM radreply WHERE username IN (${IN_USERS}) AND attribute='Nister-Window-Start' ORDER BY id DESC LIMIT 1;" || true)"
    if [[ -n "${ws:-}" ]]; then
      epoch="$(date -u -d "$ws" +%s 2>/dev/null || echo 0)"
      if [[ "$epoch" =~ ^[0-9]+$ && "$epoch" -gt 0 && "$epoch" -le "$NOW_EPOCH" ]]; then
        echo "$ws"
        return 0
      fi
    fi
    fallback=$(( NOW_EPOCH - DAYS*86400 )); (( fallback < 0 )) && fallback=0
    date -u -d "@$fallback" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u '+%Y-%m-%d %H:%M:%S'
}


set_cap_zero(){
  local vals=""
  local u
  for u in "${USERS[@]}"; do
    vals+="('${u}','Mikrotik-Total-Limit-Gigawords',':=','0'),"
    vals+="('${u}','Mikrotik-Total-Limit',':=','0'),"
  done
  vals="${vals%,}"
  sql_exec "
START TRANSACTION;
DELETE FROM radreply
WHERE username IN (${IN_USERS})
  AND attribute IN ('Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords');
INSERT INTO radreply (username,attribute,op,value) VALUES ${vals};
COMMIT;"
}

set_hs_limited(){
  local vals="" u
  for u in "${USERS[@]}"; do
    vals+="('${u}','${HS_LIMITED}',${HS_PRIO}),"
  done
  vals="${vals%,}"
  sql_exec "
START TRANSACTION;
DELETE FROM radreply
WHERE username IN (${IN_USERS})
  AND attribute IN ('Mikrotik-Address-List','MT-Address-List');

DELETE FROM radusergroup
WHERE username IN (${IN_USERS})
  AND groupname IN ('${HS_ACTIVE}','${HS_LIMITED}','${HS_NOPAID}');
INSERT INTO radusergroup (username,groupname,priority) VALUES ${vals};
COMMIT;"
}

kick_sessions(){
  local rows row u ip sid nas ok=0 fail=0 payload out
  mapfile -t rows < <(sql_all "
    SELECT username, framedipaddress, acctsessionid, nasipaddress
    FROM radacct
    WHERE username IN (${IN_USERS})
      AND acctstoptime IS NULL
  " | awk 'NF')

  for row in "${rows[@]}"; do
    IFS=$'	' read -r u ip sid nas <<<"$row"
    if ! is_valid_ipv4 "${ip:-}"; then
      log "WARN user=$USER skip_coa_no_framed_ip sid=${sid:-na} nas=${nas:-na}"
      continue
    fi

    if ! is_valid_ipv4 "${nas:-}"; then
      log "WARN user=$USER bad_nasip=$nas fallback=${NAS_IPS_LIST[0]}"
      nas="${NAS_IPS_LIST[0]}"
    elif ! is_allowed_nas "${nas}"; then
      log "WARN user=$USER nas_not_allowed=$nas fallback=${NAS_IPS_LIST[0]}"
      nas="${NAS_IPS_LIST[0]}"
    fi

    payload="User-Name = \"${u}\"
Framed-IP-Address = ${ip}
Message-Authenticator = 0x00
"

    out="$(echo -e "$payload" | radclient -x -r 1 -t 3 "${nas}:${COA_PORT}" disconnect "$COA_SECRET" 2>&1 || true)"
    if echo "$out" | grep -q "Disconnect-ACK"; then
      (( ok++ ))
    else
      log "ERR user=$USER coa_disconnect_failed target=${nas}:${COA_PORT} sid=$sid ip=$ip out=$(echo "$out" | tr '
' ' ' | head -c 300)"
      (( fail++ ))
    fi
  done

  log "KICK_DONE user=$USER ok=$ok fail=$fail"
}
is_limited_state(){
  sql_one "SELECT 1 FROM radusergroup WHERE username IN (${IN_USERS}) AND groupname='${HS_LIMITED}' LIMIT 1;" | grep -q 1 && return 0 || true
  sql_one "SELECT 1 FROM radreply WHERE username IN (${IN_USERS}) AND attribute IN ('Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords') AND value='0' LIMIT 1;" | grep -q 1
}
clear_limited_state(){
  local vals="" u
  for u in "${USERS[@]}"; do
    vals+="('${u}','${HS_ACTIVE}',0),"
  done
  vals="${vals%,}"

  sql_exec "START TRANSACTION;
    DELETE FROM radreply
      WHERE username IN (${IN_USERS})
        AND attribute IN ('Mikrotik-Total-Limit','Mikrotik-Total-Limit-Gigawords')
        AND value='0';

    DELETE FROM radusergroup
      WHERE username IN (${IN_USERS})
        AND groupname IN ('${HS_ACTIVE}','${HS_LIMITED}','${HS_NOPAID}');

    INSERT INTO radusergroup (username,groupname,priority) VALUES ${vals};

    DELETE FROM radreply
      WHERE username IN (${IN_USERS})
        AND attribute IN ('Mikrotik-Address-List','MT-Address-List');
  COMMIT;"
}

ensure_hs_active(){
  local vals="" u
  for u in "${USERS[@]}"; do
    vals+="('${u}','${HS_ACTIVE}',0),"
  done
  vals="${vals%,}"

  sql_exec "START TRANSACTION;
    DELETE FROM radusergroup
      WHERE username IN (${IN_USERS})
        AND groupname IN ('${HS_LIMITED}','${HS_NOPAID}','${HS_ACTIVE}');
    INSERT INTO radusergroup (username,groupname,priority) VALUES ${vals};
  COMMIT;"
}

PLAN_CODE="$(sql_one "SELECT value FROM radreply WHERE username IN (${IN_USERS}) AND attribute='Nister-Plan-Code' ORDER BY username LIMIT 1;" || true)"
DAYS="$(sql_one "SELECT value FROM radreply WHERE username IN (${IN_USERS}) AND attribute='Nister-Duration-Days' ORDER BY username LIMIT 1;" || true)"
[[ "${DAYS:-}" =~ ^[0-9]+$ ]] || DAYS=30

EXP_EPOCH="$(get_expiry_epoch)"
EXPIRED=0
if (( EXP_EPOCH > 0 )); then
  (( NOW_EPOCH >= EXP_EPOCH )) && EXPIRED=1
fi

CAP_SRC="user"
CAP_BYTES="$(get_user_cap_bytes)"
[[ "$CAP_BYTES" =~ ^[0-9]+$ ]] || CAP_BYTES=0

WINDOW_START="$(get_window_start)"

USED="$(sql_one "
  SELECT COALESCE(SUM(
    COALESCE(acctinputoctets,0)+COALESCE(acctoutputoctets,0)
    + 4294967296*(COALESCE(acctinputgigawords,0)+COALESCE(acctoutputgigawords,0))
  ),0)
  FROM radacct
  WHERE username IN (${IN_USERS})
    AND acctstarttime >= '${WINDOW_START}';
" || echo 0)"
[[ "$USED" =~ ^[0-9]+$ ]] || USED=0

EXHAUSTED=0
if (( CAP_BYTES > 0 )); then
  (( USED >= CAP_BYTES )) && EXHAUSTED=1
fi

# force modes
if [[ "$MODE" == "--limit" ]]; then
  EXPIRED=1
  EXHAUSTED=1
fi

if (( EXPIRED == 1 || EXHAUSTED == 1 )); then
  set_cap_zero
  set_hs_limited
  kick_sessions
  log "LIMIT user=$USER users=${USERS[*]} plan=${PLAN_CODE:-na} used=$USED cap=$CAP_BYTES cap_src=$CAP_SRC days=$DAYS expired=$EXPIRED exhausted=$EXHAUSTED"
  alert "LIMIT user=$USER plan=${PLAN_CODE:-na} expired=$EXPIRED exhausted=$EXHAUSTED used=$USED cap=$CAP_BYTES"
else
  if is_limited_state; then
    clear_limited_state
    kick_sessions
    log "UNLIMIT user=$USER users=${USERS[*]} plan=${PLAN_CODE:-na} used=$USED cap=$CAP_BYTES cap_src=$CAP_SRC days=$DAYS"
  fi
  if (( EXP_EPOCH > 0 || CAP_BYTES > 0 )); then
    ensure_hs_active
  fi
  log "OK user=$USER users=${USERS[*]} plan=${PLAN_CODE:-na} used=$USED cap=$CAP_BYTES cap_src=$CAP_SRC days=$DAYS expired=0 exhausted=0"
fi
