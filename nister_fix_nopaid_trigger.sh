#!/usr/bin/env bash
set -euo pipefail
umask 077

# Purpose:
# - Remove legacy duplicate "nopaid" rows where HS_NOPAID already exists.
# - Migrate default radcheck->radusergroup trigger to HS_NOPAID (not nopaid).
#
# Safe to run multiple times.

need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERR missing dependency: $1" >&2; exit 1; }; }
need mysql

SQLMOD="$(readlink -f /etc/freeradius/3.0/mods-enabled/sql 2>/dev/null || true)"
if [[ -z "${SQLMOD:-}" || ! -r "$SQLMOD" ]]; then
  echo "ERR cannot read FreeRADIUS sql module at /etc/freeradius/3.0/mods-enabled/sql" >&2
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

CNF="$(mktemp /tmp/.nister-nopaid-fix.XXXXXX.cnf)"
trap 'rm -f "$CNF"' EXIT
cat >"$CNF" <<EOF
[client]
host=$DB_HOST
port=$DB_PORT
user=$DB_USER
password=$DB_PASS
database=$DB_NAME
EOF
chmod 600 "$CNF"

sql_one(){ mysql --defaults-extra-file="$CNF" -N -B -e "$1" 2>/dev/null | head -n 1; }
sql_exec(){ mysql --defaults-extra-file="$CNF" -e "$1" 2>/dev/null; }

before_dupes="$(sql_one "SELECT COUNT(*) FROM radusergroup n JOIN radusergroup h ON h.username=n.username AND h.groupname='HS_NOPAID' WHERE n.groupname='nopaid';")"
[[ "${before_dupes:-}" =~ ^[0-9]+$ ]] || before_dupes=0
echo "INFO duplicate_nopaid_before=$before_dupes"

sql_exec "
DELETE n
FROM radusergroup n
JOIN radusergroup h ON h.username=n.username AND h.groupname='HS_NOPAID'
WHERE n.groupname='nopaid';
"

sql_exec "
DROP TRIGGER IF EXISTS trg_nopaid_default_group;
"

mysql --defaults-extra-file="$CNF" <<'SQL'
DELIMITER $$
CREATE TRIGGER trg_nopaid_default_group
AFTER INSERT ON radcheck
FOR EACH ROW
BEGIN
  DECLARE other VARCHAR(64);
  DECLARE exists_any INT DEFAULT 0;

  SET other = CASE
    WHEN NEW.username REGEXP '^233[0-9]{9}$' THEN CONCAT('0', SUBSTR(NEW.username,4,9))
    WHEN NEW.username REGEXP '^0[0-9]{9}$'   THEN CONCAT('233', SUBSTR(NEW.username,2,9))
    ELSE NEW.username
  END;

  SELECT COUNT(*) INTO exists_any
  FROM radusergroup
  WHERE username IN (NEW.username, other);

  IF exists_any = 0 AND NEW.attribute = 'Cleartext-Password' THEN
    INSERT IGNORE INTO radusergroup (username, groupname, priority)
    VALUES (NEW.username, 'HS_NOPAID', 1);
  END IF;
END$$
DELIMITER ;
SQL

after_dupes="$(sql_one "SELECT COUNT(*) FROM radusergroup n JOIN radusergroup h ON h.username=n.username AND h.groupname='HS_NOPAID' WHERE n.groupname='nopaid';")"
[[ "${after_dupes:-}" =~ ^[0-9]+$ ]] || after_dupes=0
echo "INFO duplicate_nopaid_after=$after_dupes"

echo "OK trigger=trg_nopaid_default_group default_group=HS_NOPAID"
