#!/usr/bin/env bash
set -euo pipefail
umask 077

# Closes stale/duplicate "open" sessions in radacct that should have received
# Accounting-Stop/Interim updates but didn't (e.g., due to acct_unique mismatch).
#
# Safe defaults:
# - Only closes sessions that have not updated in 24 hours.
# - For duplicates (same NAS + Acct-Session-Id open multiple times), closes all
#   but the most recently updated row.

TAG="nister-radacct-cleanup"
log(){
  local msg="$*"
  printf '%s %s\n' "$(date -Is)" "$msg"
  logger -t "$TAG" -- "$msg" || true
}

STALE_MINUTES="${STALE_MINUTES:-1440}"   # 24h
[[ "$STALE_MINUTES" =~ ^[0-9]+$ ]] || STALE_MINUTES=1440

DRY_RUN="${DRY_RUN:-0}"
[[ "$DRY_RUN" =~ ^[01]$ ]] || DRY_RUN=0

need(){ command -v "$1" >/dev/null 2>&1 || { log "ERR missing_dep=$1"; exit 1; }; }
need mysql

SQLMOD="$(readlink -f /etc/freeradius/3.0/mods-enabled/sql 2>/dev/null || true)"
if [[ -z "${SQLMOD:-}" || ! -r "$SQLMOD" ]]; then
  log "ERR sql_module_not_readable path=${SQLMOD:-<none>}"
  exit 1
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
DB_PASS="$(awk -F= '/^[[:space:]]*password[[:space:]]*=/{sub(/^[[:space:]]*/,"",$2);gsub(/^[ \t"]+|[ \t"]+$/,"",$2);print $2;exit}' "$SQLMOD")"

CNF="$(mktemp /tmp/.nister-radacct-cleanup.XXXXXX.cnf)"
trap 'rm -f "$CNF"' EXIT
cat >"$CNF" <<EOCNF
[client]
host=$DB_HOST
port=$DB_PORT
user=$DB_USER
password=$DB_PASS
database=$DB_NAME
EOCNF
chmod 600 "$CNF"

if (( DRY_RUN == 1 )); then
  log "INFO dry_run=1 stale_minutes=$STALE_MINUTES"
fi

mysql_run(){
  mysql --defaults-extra-file="$CNF" --batch --skip-column-names "$@"
}

open_before="$(mysql_run -e "SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL;" 2>/dev/null || echo 0)"
dups_before="$(mysql_run -e "SELECT COUNT(*) FROM (SELECT 1 FROM radacct WHERE acctstoptime IS NULL AND acctsessionid IS NOT NULL AND acctsessionid<>'' GROUP BY nasipaddress,acctsessionid HAVING COUNT(*)>1) t;" 2>/dev/null || echo 0)"
stale_before="$(mysql_run -e "SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL AND COALESCE(acctupdatetime,acctstarttime) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${STALE_MINUTES} MINUTE);" 2>/dev/null || echo 0)"

log "INFO open_before=$open_before dup_groups_before=$dups_before stale_before=$stale_before stale_minutes=$STALE_MINUTES"

if (( DRY_RUN == 0 )); then
  # Close older duplicates (keep the most recently updated row per (NAS, Acct-Session-Id)).
  dup_closed="$(mysql_run <<SQL
UPDATE radacct ra
JOIN (
  SELECT nasipaddress,
         acctsessionid,
         CAST(SUBSTRING_INDEX(
           GROUP_CONCAT(radacctid ORDER BY COALESCE(acctupdatetime, acctstarttime) DESC, radacctid DESC),
           ',', 1
         ) AS UNSIGNED) AS keep_id
  FROM radacct
  WHERE acctstoptime IS NULL
    AND acctsessionid IS NOT NULL
    AND acctsessionid <> ''
  GROUP BY nasipaddress, acctsessionid
  HAVING COUNT(*) > 1
) d
  ON ra.nasipaddress = d.nasipaddress
 AND ra.acctsessionid = d.acctsessionid
SET ra.acctstoptime = COALESCE(ra.acctupdatetime, UTC_TIMESTAMP()),
    ra.acctsessiontime = GREATEST(0, TIMESTAMPDIFF(SECOND, ra.acctstarttime, COALESCE(ra.acctupdatetime, UTC_TIMESTAMP()))),
    ra.acctterminatecause = 'Cleanup-Duplicate'
WHERE ra.acctstoptime IS NULL
  AND ra.radacctid <> d.keep_id;
SELECT ROW_COUNT();
SQL
)"
  dup_closed="$(tail -n1 <<<"${dup_closed:-0}" 2>/dev/null || echo 0)"
  [[ "$dup_closed" =~ ^[0-9]+$ ]] || dup_closed=0

  # Close stale open sessions.
  stale_closed="$(mysql_run -e "
UPDATE radacct
SET acctstoptime = COALESCE(acctupdatetime, UTC_TIMESTAMP()),
    acctsessiontime = GREATEST(0, TIMESTAMPDIFF(SECOND, acctstarttime, COALESCE(acctupdatetime, UTC_TIMESTAMP()))),
    acctterminatecause = 'Cleanup-Stale'
WHERE acctstoptime IS NULL
  AND COALESCE(acctupdatetime,acctstarttime) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${STALE_MINUTES} MINUTE);
SELECT ROW_COUNT();
" 2>/dev/null | tail -n1 || echo 0)"

  open_after="$(mysql_run -e "SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL;" 2>/dev/null || echo 0)"
  dups_after="$(mysql_run -e "SELECT COUNT(*) FROM (SELECT 1 FROM radacct WHERE acctstoptime IS NULL AND acctsessionid IS NOT NULL AND acctsessionid<>'' GROUP BY nasipaddress,acctsessionid HAVING COUNT(*)>1) t;" 2>/dev/null || echo 0)"
  stale_after="$(mysql_run -e "SELECT COUNT(*) FROM radacct WHERE acctstoptime IS NULL AND COALESCE(acctupdatetime,acctstarttime) < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${STALE_MINUTES} MINUTE);" 2>/dev/null || echo 0)"

  log "INFO dup_closed=$dup_closed dup_groups_after=$dups_after stale_closed=$stale_closed open_after=$open_after stale_after=$stale_after"
fi
