#!/usr/bin/env bash
set -euo pipefail
task_dir="$(mktemp -d -t nister-revoke.XXXXXX)"
cleanup() { rm -f "$task_dir/bin/ip" "$task_dir/bin/ssh" "$task_dir/key" "$task_dir/capture"; rmdir "$task_dir/bin" "$task_dir"; }
trap cleanup EXIT
mkdir "$task_dir/bin"
printf 'fixture key placeholder' >"$task_dir/key"
cat >"$task_dir/bin/ip" <<'SH'
#!/usr/bin/env bash
printf '10.10.20.2 dev %s src 10.99.99.1\n' "${FAKE_DEV:-ppp0}"
SH
cat >"$task_dir/bin/ssh" <<'SH'
#!/usr/bin/env bash
printf '%s' "$*" >"$CAPTURE_PATH"
printf 'status=ok action=hotspot_session_revoke remaining=0\n'
SH
chmod +x "$task_dir/bin/ip" "$task_dir/bin/ssh"
export PATH="$task_dir/bin:$PATH" ROUTER_SSH_KEY_ON_VPS="$task_dir/key" CAPTURE_PATH="$task_dir/capture"
bash ops/clear_hotspot_cookies.sh 0190000001 --disconnect >/dev/null
captured="$(cat "$CAPTURE_PATH")"
[[ "$captured" == *'/ip hotspot cookie remove'* && "$captured" == *'/ip hotspot active remove'* ]]
[[ "$captured" == *'233190000001'* && "$captured" == *'0190000001'* ]]
[[ "$captured" == *'remaining=0'* ]]
[[ "$captured" == *'/ip hotspot cookie remove'*'/ip hotspot active remove'* ]]
printf 'PASS account_revoke_exact_aliases_cookie_before_session\n'
rm "$task_dir/capture"
if FAKE_DEV=eth0 bash ops/clear_hotspot_cookies.sh 0190000001 --disconnect >/dev/null; then exit 1; fi
[[ ! -e "$task_dir/capture" ]]
printf 'PASS account_revoke_requires_tunnel\n'
if bash ops/clear_hotspot_cookies.sh 'invalid;account' --disconnect >/dev/null; then exit 1; fi
[[ ! -e "$task_dir/capture" ]]
printf 'PASS account_revoke_rejects_invalid_account\n'
if ROUTER_SSH_KEY_ON_VPS="$task_dir/missing" bash ops/clear_hotspot_cookies.sh 0190000001 --disconnect >/dev/null; then exit 1; fi
printf 'PASS account_revoke_missing_key_is_failure\n'
bash ops/clear_hotspot_cookies.sh 0190000001 >/dev/null
captured="$(cat "$task_dir/capture")"
[[ "$captured" == *'/ip hotspot cookie remove'* && "$captured" != *'/ip hotspot active remove'* ]]
printf 'PASS account_revoke_preserves_default_cookie_only_behavior\n'
bash ops/clear_hotspot_cookies.sh codex_admin 20260506011033 codex_233190000001 --disconnect >/dev/null
captured="$(cat "$CAPTURE_PATH")"
[[ "$captured" == *'user="codex_admin"'* && "$captured" == *'user="20260506011033"'* && "$captured" == *'user="codex_233190000001"'* ]]
[[ "$captured" != *'user="233190000001"'* && "$captured" != *'user="0190000001"'* ]]
printf 'PASS account_revoke_named_and_long_numeric_ids_exactly\n'
