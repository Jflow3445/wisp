#!/usr/bin/env bash
set -euo pipefail
umask 077

STATE_DIR="${STATE_DIR:-/var/lib/nister/account-queue-sync}"
LOG_FILE="${LOG_FILE:-/var/log/nister/account-queue-sync.log}"
ROUTER_HOST="${ROUTER_HOST:-10.10.20.2}"
ROUTER_USER="${ROUTER_USER:-certsync}"
ROUTER_SSH_KEY="${ROUTER_SSH_KEY_ON_VPS:-/root/.ssh/mikrotik_certsync}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-6}"
SERVER_ALIVE_INTERVAL="${SERVER_ALIVE_INTERVAL:-5}"
SERVER_ALIVE_COUNT_MAX="${SERVER_ALIVE_COUNT_MAX:-2}"
QUEUE_PREFIX="${QUEUE_PREFIX:-nister-acct-}"
QUEUE_COMMENT_PREFIX="${QUEUE_COMMENT_PREFIX:-NISTER ACCOUNT SHAPER}"
QUEUE_TYPE="${QUEUE_TYPE:-default-small/default-small}"
MYSQL_DEFAULTS_FILE="${MYSQL_DEFAULTS_FILE:-}"
PRINT_STATUS="${PRINT_STATUS:-0}"
LOG_TO_SYSLOG="${LOG_TO_SYSLOG:-0}"

mkdir -p "$STATE_DIR" "$(dirname "$LOG_FILE")"
touch "$LOG_FILE" || true

log(){
  local msg="$1"
  printf '%s %s\n' "$(date -Is)" "$msg" >>"$LOG_FILE" || true
  if [[ "$LOG_TO_SYSLOG" == "1" || "$msg" != status=ok* ]]; then
    logger -t nister-account-queue -- "$msg" || true
  fi
}

need(){
  command -v "$1" >/dev/null 2>&1 || {
    log "status=skipped reason=missing_dep dep=$1"
    exit 0
  }
}

cleanup_files=""
cleanup(){
  local p
  for p in $cleanup_files; do
    [[ -n "$p" ]] && rm -rf "$p"
  done
}
trap cleanup EXIT

need awk
need mysql
need ssh
need sort
need sed

LOCK_DIR="$STATE_DIR/.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "status=skipped reason=locked"
  exit 0
fi
cleanup_files="$cleanup_files $LOCK_DIR"

if [[ ! -r "$ROUTER_SSH_KEY" ]]; then
  log "status=skipped reason=missing_router_key key=$ROUTER_SSH_KEY"
  exit 0
fi

SQL_CNF=""
if [[ -n "$MYSQL_DEFAULTS_FILE" && -r "$MYSQL_DEFAULTS_FILE" ]]; then
  SQL_CNF="$MYSQL_DEFAULTS_FILE"
elif [[ -r /etc/nister/radius_mysql.cnf ]]; then
  SQL_CNF="/etc/nister/radius_mysql.cnf"
else
  SQLMOD="$(readlink -f /etc/freeradius/3.0/mods-enabled/sql 2>/dev/null || true)"
  if [[ -z "${SQLMOD:-}" || ! -r "$SQLMOD" ]]; then
    log "status=skipped reason=missing_sql_config"
    exit 0
  fi
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
  SQL_CNF="$(mktemp "$STATE_DIR/.mysql.XXXXXX")"
  cleanup_files="$cleanup_files $SQL_CNF"
  chmod 600 "$SQL_CNF"
  cat >"$SQL_CNF" <<EOF2
[client]
host=$DB_HOST
port=$DB_PORT
user=$DB_USER
password=$DB_PASS
database=$DB_NAME
EOF2
fi

sql_one(){
  mysql --defaults-extra-file="$SQL_CNF" -N -B -e "$1" 2>/dev/null | head -n 1
}

if ! mysql --defaults-extra-file="$SQL_CNF" -N -B -e "SELECT 1" >/dev/null 2>&1; then
  log "status=skipped reason=db_unreachable"
  exit 0
fi

router_ssh(){
  local ros="$1"
  ssh \
    -i "$ROUTER_SSH_KEY" \
    -o BatchMode=yes \
    -o ConnectTimeout="$CONNECT_TIMEOUT" \
    -o ConnectionAttempts=1 \
    -o ServerAliveInterval="$SERVER_ALIVE_INTERVAL" \
    -o ServerAliveCountMax="$SERVER_ALIVE_COUNT_MAX" \
    -o LogLevel=ERROR \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    "${ROUTER_USER}@${ROUTER_HOST}" \
    "$ros"
}

msisdn_local(){
  local d="${1//[^0-9]/}"
  if [[ "$d" =~ ^233[0-9]{9}$ ]]; then
    echo "0${d:3}"
  elif [[ "$d" =~ ^0[0-9]{9}$ ]]; then
    echo "$d"
  else
    echo "$d"
  fi
}

sql_in_for_user(){
  local local_user="$1" canonical=""
  if [[ "$local_user" =~ ^0[0-9]{9}$ ]]; then
    canonical="233${local_user:1}"
    printf "'%s','%s'" "$local_user" "$canonical"
  elif [[ "$local_user" =~ ^233[0-9]{9}$ ]]; then
    printf "'%s','0%s'" "$local_user" "${local_user:3}"
  else
    printf "'%s'" "$local_user"
  fi
}

rate_to_max_limit(){
  local raw="$1" first=""
  first="$(printf '%s' "$raw" | awk '{print $1}')"
  [[ -n "$first" ]] || return 1
  if [[ "$first" =~ ^[0-9]+[kKmMgG]?$ ]]; then
    printf '%s/%s\n' "$first" "$first"
    return 0
  fi
  if [[ "$first" =~ ^[0-9]+[kKmMgG]?/[0-9]+[kKmMgG]?$ ]]; then
    printf '%s\n' "$first"
    return 0
  fi
  return 1
}

rate_from_radius(){
  local local_user="$1" in_users
  in_users="$(sql_in_for_user "$local_user")"
  sql_one "
    SELECT value
    FROM (
      SELECT rr.value AS value, 1 AS ord, rr.id AS sort_id
      FROM radreply rr
      WHERE rr.username IN (${in_users})
        AND rr.attribute='Mikrotik-Rate-Limit'
        AND rr.value <> ''
      UNION ALL
      SELECT rgr.value AS value, 2 AS ord, rr.id AS sort_id
      FROM radreply rr
      JOIN radgroupreply rgr
        ON rgr.groupname=rr.value
       AND rgr.attribute='Mikrotik-Rate-Limit'
       AND rgr.value <> ''
      WHERE rr.username IN (${in_users})
        AND rr.attribute='Nister-Plan-Code'
        AND rr.value <> ''
      UNION ALL
      SELECT rgr.value AS value, 3 AS ord, COALESCE(1000000-rug.priority,0) AS sort_id
      FROM radusergroup rug
      JOIN radgroupreply rgr
        ON rgr.groupname=rug.groupname
       AND rgr.attribute='Mikrotik-Rate-Limit'
       AND rgr.value <> ''
      WHERE rug.username IN (${in_users})
    ) q
    ORDER BY ord ASC, sort_id DESC
    LIMIT 1;"
}

ros_escape(){
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\$/\\$/g'
}

tmpdir="$(mktemp -d "$STATE_DIR/run.XXXXXX")"
cleanup_files="$cleanup_files $tmpdir"
active_raw="$tmpdir/router-active.tsv"
active_pairs="$tmpdir/active-pairs.tsv"
desired="$tmpdir/desired.tsv"
ros_file="$tmpdir/sync.rsc"

if ! router_ssh ':foreach a in=[/ip hotspot active find] do={ :put ("ACTIVE|" . [/ip hotspot active get $a user] . "|" . [/ip hotspot active get $a address]) }' >"$active_raw" 2>"$tmpdir/router.err"; then
  log "status=skipped reason=router_active_failed detail=$(tr '\n' ' ' <"$tmpdir/router.err" | head -c 200)"
  exit 0
fi

awk -F '|' '
  /^ACTIVE\|/ {
    u=$2; ip=$3;
    gsub(/\r/, "", u);
    gsub(/\r/, "", ip);
    gsub(/[^0-9]/, "", u);
    if (u ~ /^233[0-9]{9}$/) u="0" substr(u,4);
    if (u !~ /^0[0-9]{9}$/) next;
    if (ip !~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) next;
    n=split(ip, p, ".");
    ok=(n==4);
    for (i=1; i<=4; i++) if (p[i] !~ /^[0-9]+$/ || p[i] < 0 || p[i] > 255) ok=0;
    if (ok) print u "\t" ip;
  }
' "$active_raw" | sort -u >"$active_pairs"

: >"$desired"
cut -f1 "$active_pairs" | sort -u | while IFS= read -r user; do
  [[ -n "$user" ]] || continue
  rate_raw="$(rate_from_radius "$user" || true)"
  if ! max_limit="$(rate_to_max_limit "$rate_raw")"; then
    log "status=warn reason=missing_or_invalid_rate user=$user rate=$(printf '%s' "$rate_raw" | tr ' ' '_')"
    continue
  fi
  targets="$(awk -F '\t' -v u="$user" '$1==u {print $2 "/32"}' "$active_pairs" | sort -u | paste -sd, -)"
  [[ -n "$targets" ]] || continue
  printf '%s\t%s\t%s\n' "$user" "$targets" "$max_limit" >>"$desired"
done

{
  printf ':local changed 0;\n'
  printf ':foreach q in=[/queue simple find where comment~"^%s"] do={\n' "$QUEUE_COMMENT_PREFIX"
  printf '  :local c [/queue simple get $q comment];\n'
  printf '  :local keep false;\n'
  while IFS=$'\t' read -r user targets max_limit; do
    [[ -n "${user:-}" ]] || continue
    printf '  :local p%s [:find $c "user=%s "]; :if ([:typeof $p%s] != "nil") do={ :set keep true };\n' "$user" "$user" "$user"
  done <"$desired"
  printf '  :if ($keep = false) do={ /queue simple remove $q; :set changed ($changed + 1) };\n'
  printf '};\n'
  while IFS=$'\t' read -r user targets max_limit; do
    [[ -n "${user:-}" ]] || continue
    queue_name="${QUEUE_PREFIX}${user}"
    comment="${QUEUE_COMMENT_PREFIX} user=${user} rate=${max_limit}"
    printf ':local q [/queue simple find where name="%s"];\n' "$(ros_escape "$queue_name")"
    printf ':if ([:len $q] = 0) do={ /queue simple add name="%s" target=%s max-limit=%s limit-at=0/0 queue=%s comment="%s"; :set changed ($changed + 1) } else={ /queue simple set $q target=%s max-limit=%s limit-at=0/0 queue=%s disabled=no comment="%s"; :set changed ($changed + 1) };\n' \
      "$(ros_escape "$queue_name")" "$targets" "$max_limit" "$QUEUE_TYPE" "$(ros_escape "$comment")" \
      "$targets" "$max_limit" "$QUEUE_TYPE" "$(ros_escape "$comment")"
  done <"$desired"
  printf ':foreach q in=[/queue simple find where comment~"^%s"] do={ /queue simple move $q 0 };\n' "$QUEUE_COMMENT_PREFIX"
  printf ':put ("status=ok action=account_queue_sync active_accounts=%s active_sessions=%s changed=" . $changed);\n' \
    "$(wc -l <"$desired" | tr -d '[:space:]')" "$(wc -l <"$active_pairs" | tr -d '[:space:]')"
} >"$ros_file"

ros_cmd="$(tr '\n' ' ' <"$ros_file")"
if ! out="$(router_ssh "$ros_cmd" 2>&1)"; then
  log "status=error reason=router_sync_failed detail=$(printf '%s' "$out" | tr '\n' ' ' | head -c 300)"
  exit 0
fi

if [[ "$out" == *"failure:"* || "$out" == *"syntax error"* ]]; then
  log "status=error reason=router_sync_rejected detail=$(printf '%s' "$out" | tr '\n' ' ' | head -c 300)"
  exit 0
fi

log "$(printf '%s' "$out" | tr '\n' ' ' | head -c 500)"
if [[ "$PRINT_STATUS" == "1" ]]; then
  printf '%s\n' "$out"
fi
