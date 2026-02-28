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
SELF_PATH="$(readlink -f "$0" 2>/dev/null || echo "$0")"

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
LEGACY_NOPAID="${LEGACY_NOPAID:-nopaid}"
HS_PRIO="${HS_PRIO:-0}"

sms_setting(){ sql_one "SELECT v FROM app_settings WHERE k='${1}' LIMIT 1;" || true; }
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
sms_template(){
  local tpl="$1"; shift
  local k v
  while [[ "$#" -gt 1 ]]; do
    k="$1"; v="$2"; shift 2
    tpl="${tpl//\{$k\}/$v}"
  done
  echo "$tpl"
}
sms_to_e164(){
  local d="${1//[^0-9]/}"
  [[ -z "$d" ]] && echo "" && return 0
  if [[ "$d" =~ ^233[0-9]{9}$ ]]; then
    echo "$d"
  elif [[ "$d" =~ ^0[0-9]{9}$ ]]; then
    echo "233${d:1}"
  elif [[ "$d" =~ ^[0-9]{9}$ ]]; then
    echo "233${d}"
  else
    echo "$d"
  fi
}
sms_send(){
  local to="$1" msg="$2"
  local api_key sender base url payload to_e164
  api_key="$(sms_setting MNOTIFY_API_KEY)"
  sender="$(sms_setting MNOTIFY_SENDER)"
  base="$(sms_setting MNOTIFY_BASE)"
  [[ -z "${api_key:-}" || -z "${sender:-}" || -z "${msg:-}" ]] && return 0
  [[ -z "${base:-}" ]] && base="https://api.pilosms.com/v1"
  base="${base%/}"
  if [[ "${base,,}" == */send-message ]]; then base="${base%/send-message}"; fi
  if [[ "${base,,}" == */sms/quick ]]; then base="${base%/sms/quick}"; fi
  if [[ "${base,,}" == *"pilosms"* ]]; then
    to_e164="$(sms_to_e164 "$to")"
    [[ -z "${to_e164:-}" ]] && return 0
    url="${base}/send-message?apikey=${api_key}"
    curl -sS -m 8 -X POST "$url" \
      --form-string "sender=${sender}" \
      --form-string "message=${msg}" \
      --form-string "receipients=${to_e164}" >/dev/null 2>&1 || true
    return 0
  fi
  url="${base}/sms/quick?key=${api_key}"
  payload=$(printf '{"recipient":["%s"],"sender":"%s","message":"%s","is_schedule":false,"schedule_date":""}' \
    "$to" "$sender" "${msg//\"/\\\"}")
  curl -sS -m 8 -X POST "$url" -H 'Content-Type: application/json' -d "$payload" >/dev/null 2>&1 || true
}
sms_should_send(){
  local stamp="$1" now="$2" debounce="$3"
  [[ -z "$debounce" ]] && debounce=24
  [[ -f "$stamp" ]] || return 0
  local last; last="$(cat "$stamp" 2>/dev/null || echo 0)"
  [[ "$last" =~ ^[0-9]+$ ]] || last=0
  (( now - last >= debounce*3600 )) && return 0
  return 1
}

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
    if "$SELF_PATH" "$u" --force; then
      :
    else
      rc=$?
      log "ERR user=$u sweep_child_failed rc=$rc cmd=$SELF_PATH"
    fi
  done
  SMS_DEBOUNCE_HOURS="$(sms_setting SMS_DEBOUNCE_HOURS)"; [[ -z "${SMS_DEBOUNCE_HOURS:-}" ]] && SMS_DEBOUNCE_HOURS=24
  [[ "${SMS_DEBOUNCE_HOURS:-}" =~ ^[0-9]+$ ]] || SMS_DEBOUNCE_HOURS=24
  INACTIVE_MIN_DEBOUNCE_HOURS=$((30*24))
  INACTIVE_DEBOUNCE_HOURS="$INACTIVE_MIN_DEBOUNCE_HOURS"
  if (( SMS_DEBOUNCE_HOURS > INACTIVE_DEBOUNCE_HOURS )); then
    INACTIVE_DEBOUNCE_HOURS="$SMS_DEBOUNCE_HOURS"
  fi
  SMS_INACTIVE_DAYS="$(sms_setting SMS_INACTIVE_DAYS)"; [[ -z "${SMS_INACTIVE_DAYS:-}" ]] && SMS_INACTIVE_DAYS=0
  SMS_INACTIVE_TEXT="$(sms_setting SMS_INACTIVE_TEXT)"
  if [[ -n "${SMS_INACTIVE_TEXT:-}" && "${SMS_INACTIVE_DAYS:-0}" =~ ^[0-9]+$ && "$SMS_INACTIVE_DAYS" -gt 0 ]]; then
    mapfile -t INACTIVE_USERS < <(sql_all "
      SELECT u.username
      FROM radcheck u
      LEFT JOIN (
        SELECT username, MAX(COALESCE(acctupdatetime, acctstoptime, acctstarttime)) AS last_seen
        FROM radacct
        GROUP BY username
      ) a ON a.username = u.username
      WHERE u.attribute='Cleartext-Password'
        AND a.last_seen IS NOT NULL
        AND a.last_seen < (NOW() - INTERVAL ${SMS_INACTIVE_DAYS} DAY)
        AND NOT EXISTS (
          SELECT 1
          FROM radacct ra_open
          WHERE ra_open.username = u.username
            AND ra_open.acctstoptime IS NULL
        )
      ORDER BY a.last_seen ASC, u.username ASC
      LIMIT 200
    " | awk 'NF')
    declare -A _seen_inactive
    for u in "${INACTIVE_USERS[@]}"; do
      TO="$(msisdn_local "$u")"
      [[ -z "$TO" ]] && continue
      [[ -n "${_seen_inactive[$TO]:-}" ]] && continue
      _seen_inactive["$TO"]=1
      STAMP="$STATE_DIR/${TO}.sms_inactive"
      if sms_should_send "$STAMP" "$NOW_EPOCH" "$INACTIVE_DEBOUNCE_HOURS"; then
        MSG="$(sms_template "$SMS_INACTIVE_TEXT" NAME "" MSISDN "$TO")"
        if [[ -n "$MSG" ]]; then
          sms_send "$TO" "$MSG"
          echo "$NOW_EPOCH" >"$STAMP"
          log "SMS_INACTIVE user=$TO cooldown_hours=$INACTIVE_DEBOUNCE_HOURS"
        fi
      fi
    done
  fi
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

KICK_RECENT_MINUTES="${KICK_RECENT_MINUTES:-30}"
[[ "$KICK_RECENT_MINUTES" =~ ^[0-9]+$ ]] || KICK_RECENT_MINUTES=30
KICK_RECENT_SQL=""
if (( KICK_RECENT_MINUTES > 0 )); then
  # Avoid sending CoA for very old/stale "open" radacct rows (reduces Disconnect-NAK noise).
  KICK_RECENT_SQL="AND COALESCE(acctupdatetime, acctstarttime) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${KICK_RECENT_MINUTES} MINUTE)"
fi

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
is_valid_mac(){
  [[ "${1^^}" =~ ^([0-9A-F]{2}:){5}[0-9A-F]{2}$ ]]
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

COA_READY=1
if [[ -z "${COA_SECRET:-}" || "${#NAS_IPS_LIST[@]}" -eq 0 ]]; then
  COA_READY=0
  log "WARN user=$USER coa_target_missing skip_coa=yes"
fi

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

get_expiry_str(){
  sql_one "SELECT value FROM radcheck WHERE username IN (${IN_USERS}) AND attribute='Expiration' ORDER BY STR_TO_DATE(value,'%d %b %Y %H:%i:%s') DESC LIMIT 1;" || true
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
  AND groupname IN ('${HS_ACTIVE}','${HS_LIMITED}','${HS_NOPAID}','${LEGACY_NOPAID}');
INSERT INTO radusergroup (username,groupname,priority) VALUES ${vals};
COMMIT;"
}

kick_sessions(){
  if (( COA_READY == 0 )); then
    log "WARN user=$USER skip_kick_coa_unavailable"
    return 0
  fi
  local rows row u ip sid nas mac ok=0 fail=0 payload out sid_safe payload_lines has_match
  mapfile -t rows < <(sql_all "
    SELECT DISTINCT username, framedipaddress, acctsessionid, nasipaddress, callingstationid
    FROM radacct
    WHERE username IN (${IN_USERS})
      AND acctstoptime IS NULL
      ${KICK_RECENT_SQL}
    ORDER BY acctstarttime DESC
    LIMIT 200
  " | awk 'NF')

  for row in "${rows[@]}"; do
    IFS=$'	' read -r u ip sid nas mac <<<"$row"
    sid_safe="$(echo "${sid:-}" | tr -cd 'A-Za-z0-9._:-')"
    has_match=0
    [[ -n "$sid_safe" ]] && has_match=1
    is_valid_ipv4 "${ip:-}" && has_match=1
    if (( has_match == 0 )); then
      log "WARN user=$USER skip_coa_missing_match_keys sid=${sid:-na} ip=${ip:-na} nas=${nas:-na}"
      continue
    fi

    if ! is_valid_ipv4 "${nas:-}"; then
      log "WARN user=$USER bad_nasip=$nas fallback=${NAS_IPS_LIST[0]}"
      nas="${NAS_IPS_LIST[0]}"
    elif ! is_allowed_nas "${nas}"; then
      log "WARN user=$USER nas_not_allowed=$nas skip_coa=yes"
      continue
    fi

    payload_lines=()
    # MikroTik typically tracks hotspot sessions by the "local" MSISDN (0xxxxxxxxx),
    # while FreeRADIUS accounting may store the canonical form (233xxxxxxxxx).
    # Send the local form when we can to improve CoA match rates.
    u_coa="$(msisdn_local "${u}")"
    [[ -z "${u_coa:-}" ]] && u_coa="$u"
    payload_lines+=("User-Name = \"${u_coa}\"")
    [[ -n "$sid_safe" ]] && payload_lines+=("Acct-Session-Id = \"${sid_safe}\"")
    if is_valid_ipv4 "${ip:-}"; then
      payload_lines+=("Framed-IP-Address = ${ip}")
    fi
    if is_valid_mac "${mac:-}"; then
      payload_lines+=("Calling-Station-Id = \"${mac^^}\"")
    fi
    payload_lines+=("NAS-IP-Address = ${nas}")
    payload_lines+=("Message-Authenticator = 0x00")
    payload="$(printf '%s\n' "${payload_lines[@]}")"

    out="$(printf '%s' "$payload" | radclient -x -r 1 -t 3 "${nas}:${COA_PORT}" disconnect "$COA_SECRET" 2>&1 || true)"
    if echo "$out" | grep -q "Disconnect-ACK"; then
      (( ok++ ))
    else
      log "ERR user=$USER coa_disconnect_failed target=${nas}:${COA_PORT} sid=${sid_safe:-na} ip=${ip:-na} mac=${mac:-na} out=$(echo "$out" | tr '
' ' ' | head -c 300)"
      (( fail++ ))
    fi
  done

  log "KICK_DONE user=$USER ok=$ok fail=$fail"
}
is_limited_state(){
  sql_one "SELECT 1 FROM radusergroup WHERE username IN (${IN_USERS}) AND groupname IN ('${HS_LIMITED}','${HS_NOPAID}','${LEGACY_NOPAID}') LIMIT 1;" | grep -q 1 && return 0 || true
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
        AND groupname IN ('${HS_ACTIVE}','${HS_LIMITED}','${HS_NOPAID}','${LEGACY_NOPAID}');

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
        AND groupname IN ('${HS_LIMITED}','${HS_NOPAID}','${HS_ACTIVE}','${LEGACY_NOPAID}');
    INSERT INTO radusergroup (username,groupname,priority) VALUES ${vals};
  COMMIT;"
}

PLAN_CODE="$(sql_one "SELECT value FROM radreply WHERE username IN (${IN_USERS}) AND attribute='Nister-Plan-Code' ORDER BY username LIMIT 1;" || true)"
DAYS="$(sql_one "SELECT value FROM radreply WHERE username IN (${IN_USERS}) AND attribute='Nister-Duration-Days' ORDER BY username LIMIT 1;" || true)"
[[ "${DAYS:-}" =~ ^[0-9]+$ ]] || DAYS=30
WAS_LIMITED=0
if is_limited_state; then
  WAS_LIMITED=1
fi

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

if (( EXPIRED == 0 && EXHAUSTED == 0 )); then
  SMS_DEBOUNCE_HOURS="$(sms_setting SMS_DEBOUNCE_HOURS)"; [[ -z "${SMS_DEBOUNCE_HOURS:-}" ]] && SMS_DEBOUNCE_HOURS=24
  SMS_LOGIN_URL="$(sms_setting SMS_LOGIN_URL)"
  [[ -z "${SMS_LOGIN_URL:-}" ]] && SMS_LOGIN_URL="https://wifi.nister.org/login.html"
  SMS_QUOTA_WARN_PCT="$(sms_setting SMS_QUOTA_WARN_PCT)"; [[ -z "${SMS_QUOTA_WARN_PCT:-}" ]] && SMS_QUOTA_WARN_PCT=10
  SMS_QUOTA_WARN_MB="$(sms_setting SMS_QUOTA_WARN_MB)"; [[ -z "${SMS_QUOTA_WARN_MB:-}" ]] && SMS_QUOTA_WARN_MB=200
  SMS_EXPIRY_WARN_HOURS="$(sms_setting SMS_EXPIRY_WARN_HOURS)"; [[ -z "${SMS_EXPIRY_WARN_HOURS:-}" ]] && SMS_EXPIRY_WARN_HOURS=24
  SMS_RENEW_REMINDER_HOURS="$(sms_setting SMS_RENEW_REMINDER_HOURS)"; [[ -z "${SMS_RENEW_REMINDER_HOURS:-}" ]] && SMS_RENEW_REMINDER_HOURS=24

  if (( CAP_BYTES > 0 )); then
    REMAIN_BYTES=$(( CAP_BYTES - USED )); (( REMAIN_BYTES < 0 )) && REMAIN_BYTES=0
    REMAIN_MB=$(( (REMAIN_BYTES + 1048575) / 1048576 ))
    REMAIN_PCT=$(( (REMAIN_BYTES * 100) / CAP_BYTES ))
    if (( REMAIN_PCT <= SMS_QUOTA_WARN_PCT || REMAIN_MB <= SMS_QUOTA_WARN_MB )); then
      SMS_QUOTA_WARN_TEXT="$(sms_setting SMS_QUOTA_WARN_TEXT)"
      if [[ -n "${SMS_QUOTA_WARN_TEXT:-}" ]]; then
        SMS_STAMP="$STATE_DIR/${USER}.sms_quota_warn"
        if sms_should_send "$SMS_STAMP" "$NOW_EPOCH" "$SMS_DEBOUNCE_HOURS"; then
          MSG="$(sms_template "$SMS_QUOTA_WARN_TEXT" \
            NAME "" MSISDN "$(msisdn_local "$USER")" PLAN "${PLAN_CODE:-}" \
            REMAIN_MB "$REMAIN_MB" REMAIN_PCT "$REMAIN_PCT" LOGIN_URL "$SMS_LOGIN_URL")"
          TO="$(msisdn_local "$USER")"
          if [[ -n "$TO" && -n "$MSG" ]]; then
            sms_send "$TO" "$MSG"
            echo "$NOW_EPOCH" >"$SMS_STAMP"
            log "SMS_QUOTA_WARN user=$USER remain_mb=$REMAIN_MB remain_pct=$REMAIN_PCT"
          fi
        fi
      fi
    fi
  fi

  if (( EXP_EPOCH > 0 )); then
    SECS_LEFT=$(( EXP_EPOCH - NOW_EPOCH ))
    if (( SECS_LEFT > 0 && SECS_LEFT <= SMS_EXPIRY_WARN_HOURS*3600 )); then
      SMS_EXPIRY_WARN_TEXT="$(sms_setting SMS_EXPIRY_WARN_TEXT)"
      if [[ -n "${SMS_EXPIRY_WARN_TEXT:-}" ]]; then
        EXP_STR="$(get_expiry_str)"
        SMS_STAMP="$STATE_DIR/${USER}.sms_expiry_warn"
        if sms_should_send "$SMS_STAMP" "$NOW_EPOCH" "$SMS_DEBOUNCE_HOURS"; then
          MSG="$(sms_template "$SMS_EXPIRY_WARN_TEXT" \
            NAME "" MSISDN "$(msisdn_local "$USER")" PLAN "${PLAN_CODE:-}" \
            EXPIRES_AT "${EXP_STR:-}" LOGIN_URL "$SMS_LOGIN_URL")"
          TO="$(msisdn_local "$USER")"
          if [[ -n "$TO" && -n "$MSG" ]]; then
            sms_send "$TO" "$MSG"
            echo "$NOW_EPOCH" >"$SMS_STAMP"
            log "SMS_EXPIRY_WARN user=$USER expires_at=${EXP_STR:-}"
          fi
        fi
      fi
    fi
    if (( SECS_LEFT > 0 && SECS_LEFT <= SMS_RENEW_REMINDER_HOURS*3600 )); then
      SMS_RENEW_REMINDER_TEXT="$(sms_setting SMS_RENEW_REMINDER_TEXT)"
      if [[ -n "${SMS_RENEW_REMINDER_TEXT:-}" ]]; then
        EXP_STR="$(get_expiry_str)"
        SMS_STAMP="$STATE_DIR/${USER}.sms_renew_reminder"
        if sms_should_send "$SMS_STAMP" "$NOW_EPOCH" "$SMS_DEBOUNCE_HOURS"; then
          MSG="$(sms_template "$SMS_RENEW_REMINDER_TEXT" \
            NAME "" MSISDN "$(msisdn_local "$USER")" PLAN "${PLAN_CODE:-}" \
            EXPIRES_AT "${EXP_STR:-}" LOGIN_URL "$SMS_LOGIN_URL")"
          TO="$(msisdn_local "$USER")"
          if [[ -n "$TO" && -n "$MSG" ]]; then
            sms_send "$TO" "$MSG"
            echo "$NOW_EPOCH" >"$SMS_STAMP"
            log "SMS_RENEW_REMINDER user=$USER expires_at=${EXP_STR:-}"
          fi
        fi
      fi
    fi
  fi
fi

if (( EXPIRED == 1 || EXHAUSTED == 1 )); then
  set_cap_zero
  set_hs_limited
  kick_sessions
  if (( WAS_LIMITED == 0 )); then
    log "LIMIT user=$USER users=${USERS[*]} plan=${PLAN_CODE:-na} used=$USED cap=$CAP_BYTES cap_src=$CAP_SRC days=$DAYS expired=$EXPIRED exhausted=$EXHAUSTED"
    alert "LIMIT user=$USER plan=${PLAN_CODE:-na} expired=$EXPIRED exhausted=$EXHAUSTED used=$USED cap=$CAP_BYTES"
  fi
else
  if is_limited_state; then
    clear_limited_state
    kick_sessions
    log "UNLIMIT user=$USER users=${USERS[*]} plan=${PLAN_CODE:-na} used=$USED cap=$CAP_BYTES cap_src=$CAP_SRC days=$DAYS"
    SMS_BACK_ONLINE_TEXT="$(sms_setting SMS_BACK_ONLINE_TEXT)"
    if [[ -n "${SMS_BACK_ONLINE_TEXT:-}" ]]; then
      SMS_STAMP="$STATE_DIR/${USER}.sms_back_online"
      if sms_should_send "$SMS_STAMP" "$NOW_EPOCH" "${SMS_DEBOUNCE_HOURS:-24}"; then
        MSG="$(sms_template "$SMS_BACK_ONLINE_TEXT" \
          NAME "" MSISDN "$(msisdn_local "$USER")" PLAN "${PLAN_CODE:-}" \
          EXPIRES_AT "$(get_expiry_str)")"
        TO="$(msisdn_local "$USER")"
        if [[ -n "$TO" && -n "$MSG" ]]; then
          sms_send "$TO" "$MSG"
          echo "$NOW_EPOCH" >"$SMS_STAMP"
          log "SMS_BACK_ONLINE user=$USER"
        fi
      fi
    fi
  fi
  if (( EXP_EPOCH > 0 || CAP_BYTES > 0 )); then
    ensure_hs_active
  fi
  log "OK user=$USER users=${USERS[*]} plan=${PLAN_CODE:-na} used=$USED cap=$CAP_BYTES cap_src=$CAP_SRC days=$DAYS expired=0 exhausted=0"
fi
