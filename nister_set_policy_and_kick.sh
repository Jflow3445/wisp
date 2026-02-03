#!/usr/bin/env bash
set -euo pipefail

USER_RAW="${1:-}"
TARGET="${2:-HS_LIMITED}"   # HS_LIMITED | HS_ACTIVE | HS_NOPAID
NAS="${NAS:-192.168.88.1}"
NAS_IPS="${NAS_IPS:-}"
PORT="${PORT:-3799}"
COA_NAME="${COA_NAME:-mikrotik_coa}"
PROXYCONF="${PROXYCONF:-/etc/freeradius/3.0/proxy.conf}"
COA_SECRET="${COA_SECRET:-}"
ADMIN_ALERT_URL="${ADMIN_ALERT_URL:-}"
HS_ACTIVE="${HS_ACTIVE:-HS_ACTIVE}"
HS_LIMITED="${HS_LIMITED:-HS_LIMITED}"
HS_NOPAID="${HS_NOPAID:-HS_NOPAID}"

die(){ echo "ERROR: $*" >&2; exit 2; }
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

[[ -n "$USER_RAW" ]] || die "Usage: $0 <msisdn> [HS_LIMITED|HS_ACTIVE|HS_NOPAID]"
[[ "$TARGET" == "$HS_LIMITED" || "$TARGET" == "$HS_ACTIVE" || "$TARGET" == "$HS_NOPAID" ]] || die "TARGET must be HS_LIMITED, HS_ACTIVE, or HS_NOPAID"

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

CNF="$(mktemp /tmp/.mysql.XXXXXX)"
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

sql_exec(){ mysql --defaults-extra-file="$CNF" -e "$1" 2>/dev/null; }
sql_one(){ mysql --defaults-extra-file="$CNF" -N -B -e "$1" 2>/dev/null | head -n 1; }

# ---- CoA target ----
COA_IP="$(awk -v n="$COA_NAME" '$1=="home_server"&&$2==n{blk=1;next} blk&&$1=="ipaddr"{gsub(/"|;/,"",$3);print $3;exit} blk&&/}/{blk=0}' "$PROXYCONF" 2>/dev/null || true)"
COA_PORT="$(awk -v n="$COA_NAME" '$1=="home_server"&&$2==n{blk=1;next} blk&&$1=="port"{gsub(/"|;/,"",$3);print $3;exit} blk&&/}/{blk=0}' "$PROXYCONF" 2>/dev/null || true)"
COA_SECRET_CONF="$(awk -v n="$COA_NAME" '$1=="home_server"&&$2==n{blk=1;next} blk&&$1=="secret"{gsub(/"|;/,"",$3);print $3;exit} blk&&/}/{blk=0}' "$PROXYCONF" 2>/dev/null || true)"
COA_PORT="${COA_PORT:-$PORT}"

if [[ -z "$COA_SECRET" ]]; then
  if [[ -n "${COA_SECRET_CONF:-}" ]]; then
    COA_SECRET="$COA_SECRET_CONF"
  elif [[ -r /etc/nister/coa_secret ]]; then
    COA_SECRET="$(< /etc/nister/coa_secret)"
  fi
fi
[[ -n "$COA_SECRET" ]] || die "Could not load CoA secret (set COA_SECRET or fix proxy.conf or /etc/nister/coa_secret)."

# digits-only (kills SQL injection)
U="$(echo "$USER_RAW" | tr -cd '0-9')"
[[ -n "$U" ]] || die "Bad username"

# build variants (0XXXXXXXXX <-> 233XXXXXXXXX)
VARS=()
if [[ "$U" =~ ^0[0-9]{9}$ ]]; then
  VARS+=("$U" "233${U:1}")
elif [[ "$U" =~ ^233[0-9]{9}$ ]]; then
  VARS+=("$U" "0${U:3}")
else
  VARS+=("$U")
fi

# unique variants
VARS_UNIQ=()
for x in "${VARS[@]}"; do
  [[ " ${VARS_UNIQ[*]} " == *" $x "* ]] || VARS_UNIQ+=("$x")
done

IN_LIST="$(printf "'%s'," "${VARS_UNIQ[@]}")"
IN_LIST="${IN_LIST%,}"

echo "[*] Variants: ${VARS_UNIQ[*]}"
echo "[*] Target policy: $TARGET"

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
  [[ -z "${NAS_IPS:-}" ]] && return 0
  IFS=',' read -r -a _tmp <<< "${NAS_IPS// /,}"
  for n in "${_tmp[@]}"; do
    is_valid_ipv4 "$n" || continue
    [[ "$n" == "$ip" ]] && return 0
  done
  return 1
}

echo "[*] DB update: remove overrides + force only $TARGET"

VALUES_LIST="$(for u in "${VARS_UNIQ[@]}"; do printf "('%s','%s',0)," "$u" "$TARGET"; done)"
VALUES_LIST="${VALUES_LIST%,}"

sql_exec "
START TRANSACTION;

-- remove per-user reply overrides that can force HS_ACTIVE
DELETE FROM radreply
WHERE username IN ($IN_LIST)
  AND attribute IN (
    'Mikrotik-Address-List','MT-Address-List',
    'Mikrotik-Rate-Limit','MT-Rate-Limit',
    'Nister-Quota-Bytes',
    'Mikrotik-Total-Limit','MT-Total-Limit',
    'Mikrotik-Total-Limit-Gigawords','MT-Total-Limit-Gigawords'
  );

-- wipe ONLY HS group memberships (keep PLAN_* and others)
DELETE FROM radusergroup
WHERE username IN ($IN_LIST)
  AND groupname IN ('${HS_ACTIVE}','${HS_LIMITED}','${HS_NOPAID}');

-- set the one true policy
INSERT INTO radusergroup (username, groupname, priority)
VALUES $VALUES_LIST;

-- set address list to match policy
DELETE FROM radreply
WHERE username IN ($IN_LIST)
  AND attribute IN ('Mikrotik-Address-List','MT-Address-List');
INSERT INTO radreply (username,attribute,op,value)
SELECT username,'Mikrotik-Address-List',':=','$TARGET'
FROM radusergroup
WHERE username IN ($IN_LIST)
  AND groupname='$TARGET';

COMMIT;
"

echo "[*] DB state now:"
sql_exec "SELECT username,groupname,priority FROM radusergroup WHERE username IN ($IN_LIST) ORDER BY username,priority;"

# find active session (if any) for ANY variant
SESS_USER=""; NASIP=""; FRAMEDIP=""; ACCTSID=""
read -r SESS_USER NASIP FRAMEDIP ACCTSID < <(
  mysql --defaults-extra-file="$CNF" -N -B -e "
    SELECT username, nasipaddress, framedipaddress, acctsessionid
    FROM radacct
    WHERE username IN ($IN_LIST) AND acctstoptime IS NULL
    ORDER BY acctstarttime DESC
    LIMIT 1;" || true
)

if [[ -z "${SESS_USER:-}" || -z "${ACCTSID:-}" ]]; then
  echo "[*] No active session found in radacct -> nothing to kick."
  exit 0
fi

echo "[*] Active session found:"
echo "    user=$SESS_USER ip=$FRAMEDIP sid=$ACCTSID nasip=${NASIP:-$NAS}"


echo "[*] Sending Disconnect-Request (forces re-login onto new policy)..."
NAS_TARGET="${NASIP:-$NAS}"
if ! is_valid_ipv4 "$NAS_TARGET"; then NAS_TARGET="$NAS"; fi
if ! is_allowed_nas "$NAS_TARGET"; then NAS_TARGET="$NAS"; fi

payload="User-Name = \"${SESS_USER}\"
Acct-Session-Id = \"${ACCTSID}\"
Message-Authenticator = 0x00
"
if is_valid_ipv4 "${FRAMEDIP:-}"; then
  payload="User-Name = \"${SESS_USER}\"
Framed-IP-Address = ${FRAMEDIP}
Acct-Session-Id = \"${ACCTSID}\"
Message-Authenticator = 0x00
"
fi
out="$(echo -e "$payload" | radclient -x -r 1 -t 3 "${NAS_TARGET}:${COA_PORT}" disconnect "$COA_SECRET" 2>&1 || true)"
if echo "$out" | grep -q "Disconnect-ACK"; then
  echo "$out"
else
  echo "$out"
  alert "COA_FAIL user=$SESS_USER target=${NAS_TARGET}:${COA_PORT} sid=$ACCTSID ip=${FRAMEDIP:-na} out=$(echo "$out" | tr '\n' ' ' | head -c 300)"
fi

echo "[OK] Kicked. Next login MUST show MT-Address-List=\"$TARGET\" in MikroTik /log radius debug."
