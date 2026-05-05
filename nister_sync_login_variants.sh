#!/usr/bin/env bash
set -euo pipefail
umask 077

# Sync FreeRADIUS login/auth attributes between Ghana MSISDN variants:
#   0xxxxxxxxx <-> 233xxxxxxxxx
#
# Why:
# - Captive portal auth uses the exact username entered by the user.
# - If radcheck attrs drift between variants, some users cannot log in
#   even though pay-portal auth still works (it checks both variants).
#
# Safe/idempotent:
# - Copies latest auth attrs found across either variant to both variants.
# - Does not delete rows.
#
# Usage:
#   sudo ./nister_sync_login_variants.sh
#   sudo ./nister_sync_login_variants.sh 0536960196

TARGET="${1:-}"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERR missing dependency: $1" >&2; exit 1; }; }
need mysql
need awk

if [[ -n "$TARGET" ]]; then
  TARGET="${TARGET//[^0-9]/}"
  if [[ "$TARGET" =~ ^0[0-9]{9}$ ]]; then
    :
  elif [[ "$TARGET" =~ ^233[0-9]{9}$ ]]; then
    :
  else
    echo "ERR invalid msisdn '$1' (use 05xxxxxxxx or 233xxxxxxxxx)" >&2
    exit 1
  fi
fi

SQLMOD="$(readlink -f /etc/freeradius/3.0/mods-enabled/sql 2>/dev/null || true)"
if [[ -z "${SQLMOD:-}" || ! -r "$SQLMOD" ]]; then
  echo "ERR cannot read FreeRADIUS sql module: /etc/freeradius/3.0/mods-enabled/sql" >&2
  exit 1
fi

get_kv() {
  awk -F= -v k="$1" '$0 ~ "^[[:space:]]*"k"[[:space:]]*=" {
    v=$2
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
    gsub(/^"+|"+$/, "", v)
    print v
    exit
  }' "$SQLMOD"
}

DB_HOST="$(get_kv server)"
DB_PORT="$(get_kv port)"; DB_PORT="${DB_PORT:-3306}"
DB_USER="$(get_kv login)"
DB_NAME="$(get_kv radius_db)"
DB_PASS="$(awk -F= '/^[[:space:]]*password[[:space:]]*=/{sub(/^[[:space:]]*/,"",$2);gsub(/^[ \t"]+|[ \t"]+$/,"",$2);print $2;exit}' "$SQLMOD")"

CNF="$(mktemp /tmp/.nister-sync-login-variants.XXXXXX.cnf)"
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
sql_all(){ mysql --defaults-extra-file="$CNF" -N -B -e "$1" 2>/dev/null; }
sql_exec(){ mysql --defaults-extra-file="$CNF" -e "$1" 2>/dev/null; }

canon_233(){
  local d="${1//[^0-9]/}"
  if [[ "$d" =~ ^0[0-9]{9}$ ]]; then
    echo "233${d:1}"
    return 0
  fi
  if [[ "$d" =~ ^233[0-9]{9}$ ]]; then
    echo "$d"
    return 0
  fi
  echo ""
}

local_0(){
  local d="${1//[^0-9]/}"
  if [[ "$d" =~ ^233[0-9]{9}$ ]]; then
    echo "0${d:3}"
    return 0
  fi
  if [[ "$d" =~ ^0[0-9]{9}$ ]]; then
    echo "$d"
    return 0
  fi
  echo ""
}

sanitize_op(){
  local op="${1:-:=}"
  case "$op" in
    ':='|'='|'=='|'=~'|'!~'|'!='|'<'|'<='|'>'|'>=') echo "$op" ;;
    *) echo ':=' ;;
  esac
}

PASS_ATTRS=(
  "Cleartext-Password"
  "Password"
  "Crypt-Password"
  "MD5-Password"
  "SHA-Password"
  "SSHA-Password"
  "SMD5-Password"
  "NT-Password"
  "LM-Password"
)
SYNC_ATTRS=("${PASS_ATTRS[@]}" "Expiration" "Simultaneous-Use")

TMP_PAIRS="$(mktemp /tmp/.nister-sync-login-pairs.XXXXXX.txt)"
trap 'rm -f "$CNF" "$TMP_PAIRS"' EXIT

if [[ -n "$TARGET" ]]; then
  c233="$(canon_233 "$TARGET")"
  l0="$(local_0 "$TARGET")"
  if [[ -z "$c233" || -z "$l0" ]]; then
    echo "ERR failed to build username variants for target '$TARGET'" >&2
    exit 1
  fi
  printf '%s\t%s\n' "$c233" "$l0" >"$TMP_PAIRS"
else
  sql_all "
    SELECT DISTINCT
      CASE
        WHEN rc.username REGEXP '^233[0-9]{9}$' THEN rc.username
        WHEN rc.username REGEXP '^0[0-9]{9}$' THEN CONCAT('233', SUBSTRING(rc.username,2))
        ELSE NULL
      END AS canon_233,
      CASE
        WHEN rc.username REGEXP '^233[0-9]{9}$' THEN CONCAT('0', SUBSTRING(rc.username,4))
        WHEN rc.username REGEXP '^0[0-9]{9}$' THEN rc.username
        ELSE NULL
      END AS local_0
    FROM radcheck rc
    WHERE rc.username REGEXP '^(233[0-9]{9}|0[0-9]{9})$'
      AND rc.attribute IN ('Cleartext-Password','Password','Crypt-Password','MD5-Password','SHA-Password','SSHA-Password','SMD5-Password','NT-Password','LM-Password','Expiration','Simultaneous-Use')
  " | awk 'NF==2 && $1!="" && $2!=""' >"$TMP_PAIRS"
fi

pair_count=0
attr_updates=0
user_upserts=0

while IFS=$'\t' read -r U233 U0; do
  [[ -n "${U233:-}" && -n "${U0:-}" ]] || continue
  ((pair_count+=1))

  for attr in "${SYNC_ATTRS[@]}"; do
    row="$(sql_one "SELECT TO_BASE64(value), COALESCE(NULLIF(op,''), ':=') FROM radcheck WHERE username IN ('${U233}','${U0}') AND attribute='${attr}' ORDER BY id DESC LIMIT 1;" || true)"
    [[ -n "${row:-}" ]] || continue

    val_b64="$(printf '%s' "$row" | awk -F'\t' '{print $1}')"
    op_raw="$(printf '%s' "$row" | awk -F'\t' '{print $2}')"
    [[ -n "${val_b64:-}" ]] || continue
    op="$(sanitize_op "$op_raw")"

    sql_exec "
      INSERT INTO radcheck (username, attribute, op, value)
      VALUES
        ('${U233}', '${attr}', '${op}', FROM_BASE64('${val_b64}')),
        ('${U0}',   '${attr}', '${op}', FROM_BASE64('${val_b64}'))
      ON DUPLICATE KEY UPDATE
        op=VALUES(op),
        value=VALUES(value);
    "
    ((attr_updates+=1))
    ((user_upserts+=2))
  done
done <"$TMP_PAIRS"

echo "OK pairs=${pair_count} attr_updates=${attr_updates} user_upserts=${user_upserts}"
