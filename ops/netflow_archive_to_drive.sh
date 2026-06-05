#!/usr/bin/env bash
set -euo pipefail
umask 077

ENV_FILE="${NETFLOW_ENV_FILE:-/etc/default/nister-netflow}"
NETFLOW_DIR="/var/log/netflow"
NETFLOW_ARCHIVE_REMOTE=""
NETFLOW_ARCHIVE_MIN_AGE_MINUTES="1440"
NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD="1"
NETFLOW_ARCHIVE_MAX_FILES_PER_RUN="500"
NETFLOW_ARCHIVE_LOG="/var/log/nister/netflow_archive.log"
NETFLOW_ARCHIVE_LOCK="/run/nister_netflow_archive.lock"

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

strip_quotes() {
  local s="$1"
  local len="${#s}"
  local first last
  if (( len >= 2 )); then
    first="${s:0:1}"
    last="${s:len-1:1}"
    if [[ "$first" == "$last" && ( "$first" == "'" || "$first" == '"' ) ]]; then
      printf '%s' "${s:1:len-2}"
      return
    fi
  fi
  printf '%s' "$s"
}

load_env() {
  local line key value
  [[ -r "$ENV_FILE" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="$(trim "$line")"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    value="$(strip_quotes "$(trim "${BASH_REMATCH[2]}")")"
    case "$key" in
      NETFLOW_DIR) NETFLOW_DIR="$value" ;;
      NETFLOW_ARCHIVE_REMOTE) NETFLOW_ARCHIVE_REMOTE="$value" ;;
      NETFLOW_ARCHIVE_MIN_AGE_MINUTES) NETFLOW_ARCHIVE_MIN_AGE_MINUTES="$value" ;;
      NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD) NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD="$value" ;;
      NETFLOW_ARCHIVE_MAX_FILES_PER_RUN) NETFLOW_ARCHIVE_MAX_FILES_PER_RUN="$value" ;;
      NETFLOW_ARCHIVE_LOG) NETFLOW_ARCHIVE_LOG="$value" ;;
    esac
  done <"$ENV_FILE"
}

log() {
  local msg="$*"
  mkdir -p "$(dirname "$NETFLOW_ARCHIVE_LOG")"
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$msg" >>"$NETFLOW_ARCHIVE_LOG"
}

is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

capture_rows() {
  local cutoff="$1"
  find "$NETFLOW_DIR" -maxdepth 1 -type f -name 'nfcapd.[0-9]*' -printf '%f\t%s\t%p\n' |
    awk -F '\t' -v cutoff="$cutoff" '
      {
        name=$1
        stamp=name
        sub(/^nfcapd\./, "", stamp)
        sub(/\..*$/, "", stamp)
        if (stamp ~ /^[0-9]{12}$/ && stamp <= cutoff) {
          print stamp "\t" $2 "\t" $3 "\t" name
        }
      }
    ' | sort -n
}

remote_size() {
  local remote="$1"
  rclone size --json "$remote" |
    python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("bytes", -1)))'
}

load_env

if [[ -z "$NETFLOW_ARCHIVE_REMOTE" ]]; then
  log "status=skipped reason=no_remote"
  exit 0
fi
command -v rclone >/dev/null 2>&1 || {
  log "status=failed reason=missing_rclone"
  exit 1
}
command -v python3 >/dev/null 2>&1 || {
  log "status=failed reason=missing_python3"
  exit 1
}
[[ -d "$NETFLOW_DIR" ]] || {
  log "status=failed reason=missing_netflow_dir dir=$NETFLOW_DIR"
  exit 1
}
is_uint "$NETFLOW_ARCHIVE_MIN_AGE_MINUTES" || NETFLOW_ARCHIVE_MIN_AGE_MINUTES=1440
is_uint "$NETFLOW_ARCHIVE_MAX_FILES_PER_RUN" || NETFLOW_ARCHIVE_MAX_FILES_PER_RUN=500
[[ "$NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD" =~ ^[01]$ ]] || NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD=1

exec 9>"$NETFLOW_ARCHIVE_LOCK"
if ! flock -n 9; then
  log "status=skipped reason=locked"
  exit 0
fi

cutoff="$(date -u -d "${NETFLOW_ARCHIVE_MIN_AGE_MINUTES} minutes ago" +%Y%m%d%H%M)"
processed=0
uploaded=0
deleted=0
failed=0

while IFS=$'\t' read -r stamp size file name; do
  [[ -n "${file:-}" ]] || continue
  if (( processed >= NETFLOW_ARCHIVE_MAX_FILES_PER_RUN )); then
    break
  fi
  processed=$((processed + 1))

  yyyy="${stamp:0:4}"
  mm="${stamp:4:2}"
  dd="${stamp:6:2}"
  dest="${NETFLOW_ARCHIVE_REMOTE%/}/${yyyy}/${mm}/${dd}/${name}"

  if rclone copyto "$file" "$dest" --retries 3 --low-level-retries 10; then
    if [[ "$(remote_size "$dest")" == "$size" ]]; then
      uploaded=$((uploaded + 1))
      if [[ "$NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD" == "1" ]]; then
        rm -f -- "$file"
        deleted=$((deleted + 1))
      fi
      log "file=ok stamp=$stamp bytes=$size deleted=$NETFLOW_ARCHIVE_DELETE_AFTER_UPLOAD name=$name"
    else
      failed=$((failed + 1))
      log "file=failed reason=size_mismatch stamp=$stamp bytes=$size name=$name"
    fi
  else
    failed=$((failed + 1))
    log "file=failed reason=rclone_copy stamp=$stamp bytes=$size name=$name"
  fi
done < <(capture_rows "$cutoff")

log "status=done processed=$processed uploaded=$uploaded deleted=$deleted failed=$failed remote=$NETFLOW_ARCHIVE_REMOTE"
if (( failed > 0 )); then
  exit 1
fi
