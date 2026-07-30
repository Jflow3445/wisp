#!/usr/bin/env bash
set -euo pipefail
umask 077

QUERIES_CONF="${QUERIES_CONF:-/etc/freeradius/3.0/mods-config/sql/main/mysql/queries.conf}"
BACKUP_DIR="${BACKUP_DIR:-/root/nister_deploy_backups/freeradius_simultaneous_use}"

if [[ ! -f "$QUERIES_CONF" ]]; then
  echo "ERR queries_conf_not_found path=$QUERIES_CONF" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
backup="$BACKUP_DIR/queries.conf.$(date -u +%Y%m%dT%H%M%SZ).bak"
cp -a "$QUERIES_CONF" "$backup"

python3 - "$QUERIES_CONF" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
src = path.read_text()
start = src.index('simul_count_query =')
marker = '#######################################################################\n# Accounting and Post-Auth Queries'
end = src.index(marker, start)

replacement = r'''simul_count_query = "\
	SELECT COUNT(*) \
	FROM ( \
		SELECT 1 \
		FROM ${acct_table1} \
		WHERE username = '%{SQL-User-Name}' \
		AND (acctstoptime IS NULL OR acctstoptime = '0000-00-00 00:00:00') \
		AND COALESCE(acctupdatetime, acctstarttime) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE) \
		GROUP BY COALESCE(NULLIF(acctsessionid,''), CONCAT('row:', radacctid)), \
		         COALESCE(NULLIF(callingstationid,''), CONCAT('row:', radacctid)), \
		         COALESCE(NULLIF(framedipaddress,''), CONCAT('row:', radacctid)) \
	) s"

simul_verify_query = "\
	SELECT \
		radacctid, acctsessionid, username, nasipaddress, nasportid, framedipaddress, \
		callingstationid, framedprotocol \
	FROM ${acct_table1} \
	WHERE username = '%{SQL-User-Name}' \
	AND (acctstoptime IS NULL OR acctstoptime = '0000-00-00 00:00:00') \
	AND COALESCE(acctupdatetime, acctstarttime) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)"

'''

dst = src[:start] + replacement + src[end:]
if dst != src:
    path.write_text(dst)
PY

if cmp -s "$QUERIES_CONF" "$backup"; then
  rm -f "$backup"
  echo "status=unchanged path=$QUERIES_CONF"
else
  echo "status=updated path=$QUERIES_CONF backup=$backup"
fi
