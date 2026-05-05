#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SRC="$REPO_DIR/systemd/nister-nfcapd.service"
SERVICE_DST="/etc/systemd/system/nister-nfcapd.service"
ENV_FILE="/etc/default/nister-netflow"
LOGROTATE_FILE="/etc/logrotate.d/nister-netflow"
DEFAULT_NETFLOW_DIR="/var/log/netflow"
DEFAULT_NETFLOW_PORT="2055"
DEFAULT_NETFLOW_INTERVAL="300"
DEFAULT_NETFLOW_WEB_GROUP="www-data"

if [[ ${EUID:-0} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

file_uid() {
  local path="$1"
  stat -c '%u' "$path" 2>/dev/null || stat -f '%u' "$path" 2>/dev/null
}

file_gid() {
  local path="$1"
  stat -c '%g' "$path" 2>/dev/null || stat -f '%g' "$path" 2>/dev/null
}

file_mode() {
  local path="$1"
  stat -c '%a' "$path" 2>/dev/null || stat -f '%Lp' "$path" 2>/dev/null
}

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

strip_matching_quotes() {
  local s="$1"
  local len="${#s}"
  local first last
  if (( len < 2 )); then
    printf '%s' "$s"
    return
  fi
  first="${s:0:1}"
  last="${s:len-1:1}"
  if [[ "$first" == "$last" && ( "$first" == "'" || "$first" == '"' ) ]]; then
    printf '%s' "${s:1:len-2}"
    return
  fi
  printf '%s' "$s"
}

is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

env_file_is_secure() {
  local path="$1"
  local uid gid mode mode_int
  [[ -f "$path" && ! -L "$path" ]] || return 1
  uid="$(file_uid "$path")" || return 1
  gid="$(file_gid "$path")" || return 1
  [[ "$uid" == "0" ]] || return 1
  [[ "$gid" == "0" ]] || return 1
  mode="$(file_mode "$path")" || return 1
  mode="$(trim "$mode")"
  [[ "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  if ((${#mode} > 3)); then
    mode="${mode:${#mode}-3}"
  fi
  mode_int="$((8#$mode))"
  (( (mode_int & 8#022) == 0 ))
}

load_env_file() {
  local path="$1"
  local line lineno=0 key value
  [[ -f "$path" ]] || return 0
  if ! env_file_is_secure "$path"; then
    echo "Warning: ignoring insecure env file '$path' (owner/mode check failed)" >&2
    return 0
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$((lineno + 1))
    line="${line%$'\r'}"
    line="$(trim "$line")"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    if [[ "$line" =~ ^export[[:space:]]+ ]]; then
      line="$(trim "${line#export}")"
    fi
    if [[ ! "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      echo "Warning: ignoring invalid env line $lineno in $path" >&2
      continue
    fi
    key="${BASH_REMATCH[1]}"
    value="$(strip_matching_quotes "${BASH_REMATCH[2]}")"
    case "$key" in
      NETFLOW_DIR) NETFLOW_DIR="$value" ;;
      NETFLOW_PORT) NETFLOW_PORT="$value" ;;
      NETFLOW_INTERVAL) NETFLOW_INTERVAL="$value" ;;
      NETFLOW_WEB_GROUP) NETFLOW_WEB_GROUP="$value" ;;
      *)
        echo "Warning: ignoring unknown env key '$key' in $path" >&2
        ;;
    esac
  done <"$path"
}

if [[ ! -f "$SERVICE_SRC" ]]; then
  echo "Missing service template: $SERVICE_SRC" >&2
  exit 1
fi

if ! command -v nfcapd >/dev/null 2>&1 || ! command -v nfdump >/dev/null 2>&1; then
  echo "Installing nfdump package..."
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y nfdump
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
NETFLOW_DIR=/var/log/netflow
NETFLOW_PORT=2055
NETFLOW_INTERVAL=300
NETFLOW_WEB_GROUP=www-data
EOF
  chown root:root "$ENV_FILE"
  chmod 0644 "$ENV_FILE"
fi

NETFLOW_DIR="$DEFAULT_NETFLOW_DIR"
NETFLOW_PORT="$DEFAULT_NETFLOW_PORT"
NETFLOW_INTERVAL="$DEFAULT_NETFLOW_INTERVAL"
NETFLOW_WEB_GROUP="$DEFAULT_NETFLOW_WEB_GROUP"
load_env_file "$ENV_FILE"
NETFLOW_DIR="${NETFLOW_DIR:-$DEFAULT_NETFLOW_DIR}"
NETFLOW_PORT="${NETFLOW_PORT:-$DEFAULT_NETFLOW_PORT}"
NETFLOW_INTERVAL="${NETFLOW_INTERVAL:-$DEFAULT_NETFLOW_INTERVAL}"
NETFLOW_WEB_GROUP="${NETFLOW_WEB_GROUP:-$DEFAULT_NETFLOW_WEB_GROUP}"

if ! is_uint "$NETFLOW_PORT" || (( 10#$NETFLOW_PORT < 1 || 10#$NETFLOW_PORT > 65535 )); then
  echo "Warning: invalid NETFLOW_PORT='$NETFLOW_PORT'; falling back to $DEFAULT_NETFLOW_PORT" >&2
  NETFLOW_PORT="$DEFAULT_NETFLOW_PORT"
else
  NETFLOW_PORT="$((10#$NETFLOW_PORT))"
fi
if ! is_uint "$NETFLOW_INTERVAL" || (( 10#$NETFLOW_INTERVAL < 1 )); then
  echo "Warning: invalid NETFLOW_INTERVAL='$NETFLOW_INTERVAL'; falling back to $DEFAULT_NETFLOW_INTERVAL" >&2
  NETFLOW_INTERVAL="$DEFAULT_NETFLOW_INTERVAL"
else
  NETFLOW_INTERVAL="$((10#$NETFLOW_INTERVAL))"
fi

if ! getent group "$NETFLOW_WEB_GROUP" >/dev/null 2>&1; then
  echo "Warning: group '$NETFLOW_WEB_GROUP' not found; falling back to root" >&2
  NETFLOW_WEB_GROUP="root"
fi

install -d -o root -g "$NETFLOW_WEB_GROUP" -m 0750 "$NETFLOW_DIR"
install -m 0644 "$SERVICE_SRC" "$SERVICE_DST"

cat > "$LOGROTATE_FILE" <<EOF
${NETFLOW_DIR}/nfcapd.* {
  daily
  rotate 180
  missingok
  notifempty
  compress
  delaycompress
  sharedscripts
  postrotate
    /bin/systemctl kill -s HUP nister-nfcapd.service >/dev/null 2>&1 || true
  endscript
}
EOF
chmod 0644 "$LOGROTATE_FILE"

systemctl daemon-reload
systemctl enable --now nister-nfcapd.service
systemctl restart nister-nfcapd.service

echo "nister-nfcapd configured"
echo "  dir      : $NETFLOW_DIR"
echo "  web group: $NETFLOW_WEB_GROUP"
echo "  port     : $NETFLOW_PORT"
echo "  interval : $NETFLOW_INTERVAL"

echo
echo "Collector status:"
systemctl --no-pager --full status nister-nfcapd.service | sed -n '1,25p'

echo
echo "Listening sockets:"
ss -lunp | awk 'NR==1 || /:2055\\b|:4739\\b|:9995\\b|:9996\\b/'
