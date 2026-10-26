#!/usr/bin/env bash
# Clone the committed HEAD into an empty folder and run every install and check step from the
# README there, so nothing on this machine that git does not track can make it pass.
#
#   pnpm verify            check HEAD in a fresh clone, then delete the clone
#   pnpm verify --keep     keep the clone and print where it is
#
# Needs Node 20.9+, pnpm 10, uv and FFmpeg on PATH, and the network for the installs only.
# Exits non-zero at the first failing step, and prints both coverage summaries on success.
set -euo pipefail

keep=false
[[ "${1:-}" == "--keep" ]] && keep=true

repo="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)"
tmp="${TMPDIR:-/tmp}"
dir="$(mktemp -d "${tmp%/}/frametrail-verify.XXXXXX")"
log="$dir.log"
if ! $keep; then
  trap '/bin/rm -rf "$dir"' EXIT
fi

step() {
  printf '==> %s\n' "$1"
  shift
  if ! (cd "$dir" && "$@") >>"$log" 2>&1; then
    printf 'FAILED: %s\n' "$*"
    tail -40 "$log"
    exit 1
  fi
}

printf 'Verifying %s at %s in %s\n' "$(basename "$repo")" "$(git -C "$repo" rev-parse --short HEAD)" "$dir"
: >"$log"
git clone --quiet --no-local "$repo" "$dir"

step "install the web app from pnpm-lock.yaml" pnpm install --frozen-lockfile
step "install the engine from engine/uv.lock" uv sync --project engine --frozen
step "check names, typecheck, lint" pnpm check
step "lint the engine" pnpm engine:lint
step "typecheck the engine" pnpm engine:typecheck
step "test the web app" pnpm test:unit
step "test the engine" pnpm engine:test
step "build the workbench" pnpm build

printf '\nWeb coverage\n'
grep -E '^(Statements|Branches|Functions|Lines) ' "$log" | tail -4
printf '\nEngine coverage\n'
grep -E '^TOTAL ' "$log" | tail -1
grep -E '^[0-9]+ passed' "$log" | tail -1
printf '\nAll steps passed. Full log: %s\n' "$log"
$keep && printf 'Clone kept at %s\n' "$dir"
exit 0
