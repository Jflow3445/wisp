#!/bin/sh
set -eu

base_ref=${WISP_BOUNDARY_BASE:-}

if [ -z "$base_ref" ] && [ -n "${GITHUB_BASE_REF:-}" ]; then
  base_ref="origin/$GITHUB_BASE_REF"
fi

if [ -z "$base_ref" ]; then
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    base_ref=origin/main
  elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    base_ref=HEAD~1
  else
    echo "WISP boundary check skipped: no comparison commit is available."
    exit 0
  fi
fi

changed_files=$(git diff --name-only "$base_ref"...HEAD)
violations=$(printf '%s\n' "$changed_files" | awk '
  /^commerce-platform\// { next }
  /^\.github\/workflows\/commerce-platform-ci\.yml$/ { next }
  /^AGENTS\.md$/ { next }
  /^$/ { next }
  { print }
')

if [ -n "$violations" ]; then
  echo "Marketplace change crosses the protected WISP boundary:"
  printf '%s\n' "$violations"
  exit 1
fi

echo "Marketplace changes remain inside the approved additive boundary."
