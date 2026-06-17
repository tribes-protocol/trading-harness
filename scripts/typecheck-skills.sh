#!/bin/sh
# Typecheck every skill under .pi/skills (each has a self-contained tsconfig.json),
# IN PARALLEL. Concurrency defaults to the CPU count (override with TYPECHECK_JOBS).
set -u
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TSC="$ROOT/node_modules/.bin/tsc"
JOBS="${TYPECHECK_JOBS:-$(nproc 2>/dev/null || echo 4)}"
export TSC

# xargs -P fans the skills out; it exits non-zero if any child fails, so a single
# broken skill still fails the build.
ls -d "$ROOT"/.pi/skills/*/ 2>/dev/null | xargs -P "$JOBS" -I {} sh -c '
  d="$1"
  [ -f "$d/tsconfig.json" ] || exit 0
  name=$(basename "$d")
  if ( cd "$d" && "$TSC" -p tsconfig.json --noEmit ); then
    echo "[skill] $name ok"
  else
    echo "[skill] $name FAILED" >&2
    exit 1
  fi
' _ {}
