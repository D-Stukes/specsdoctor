#!/usr/bin/env bash
# Builds the stale-README demo repository (EV-5, T25) from fixtures/demo-habit-tracker.
#   build-demo-repo.sh --git <outdir>        a git repo: `main` (README matches the code) and branch
#                                            `demo-stale-readme` (code renamed, README left alone)
#   build-demo-repo.sh --flat v1|v2 <outdir> just the files of one version, for tests
# Publishing the repo to GitHub is a separate, deliberate step (see docs/demo/DEMO-SCRIPT.md).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../../fixtures/demo-habit-tracker"

apply_v2() { # the code moves on; README.md is deliberately not touched
  local dir="$1"
  perl -pi -e 's/\bcreateHabit\b/addHabit/g' "$dir/server/controllers/habits.js" "$dir/server/routes/habits.js"
  perl -pi -e 's/process\.env\.DB_URL/process.env.DATABASE_URL/' "$dir/server/db.js"
  perl -pi -e 's/"dev":/"start":/' "$dir/package.json"
}

case "${1:-}" in
  --flat)
    [ "${2:-}" = v1 ] || [ "${2:-}" = v2 ] || { echo "usage: $0 --flat v1|v2 <outdir>"; exit 2; }
    mkdir -p "$3" && cp -R "$SRC/." "$3/"
    if [ "$2" = v2 ]; then apply_v2 "$3"; fi
    ;;
  --git)
    out="$2"
    [ ! -e "$out" ] || { echo "$out already exists"; exit 1; }
    mkdir -p "$out" && cp -R "$SRC/." "$out/"
    cd "$out"
    git init -q -b main
    git add -A && git -c user.name=demo -c user.email=demo@example.com commit -q -m "Habit tracker: API, schema, client, README"
    git checkout -q -b demo-stale-readme
    apply_v2 "$out"
    git add -A && git -c user.name=demo -c user.email=demo@example.com commit -q -m "Rename createHabit to addHabit, DB_URL to DATABASE_URL, dev script to start (README not updated)"
    git checkout -q main
    echo "built $out (branches: main, demo-stale-readme)"
    ;;
  *) echo "usage: $0 --git <outdir> | --flat v1|v2 <outdir>"; exit 2 ;;
esac
