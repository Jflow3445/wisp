#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-0} -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_SRC="$REPO_DIR/systemd/nister-nfcapd.service"
SERVICE_DST="/etc/systemd/system/nister-nfcapd.service"
ENV_FILE="/etc/default/nister-netflow"
LOGROTATE_FILE="/etc/logrotate.d/nister-netflow"

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
  chmod 0644 "$ENV_FILE"
fi

# shellcheck disable=SC1090
source "$ENV_FILE"
NETFLOW_DIR="${NETFLOW_DIR:-/var/log/netflow}"
NETFLOW_PORT="${NETFLOW_PORT:-2055}"
NETFLOW_INTERVAL="${NETFLOW_INTERVAL:-300}"
NETFLOW_WEB_GROUP="${NETFLOW_WEB_GROUP:-www-data}"

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
