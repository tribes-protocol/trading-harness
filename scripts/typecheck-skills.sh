#!/bin/sh
# Typecheck every skill under .pi/skills (each has a self-contained tsconfig.json).
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TSC="$ROOT/node_modules/.bin/tsc"
fail=0
for d in "$ROOT"/.pi/skills/*/; do
  [ -f "$d/tsconfig.json" ] || continue
  name="$(basename "$d")"
  if ( cd "$d" && "$TSC" -p tsconfig.json --noEmit ); then
    echo "[skill] $name ok"
  else
    echo "[skill] $name FAILED" >&2
    fail=1
  fi
done
exit "$fail"
