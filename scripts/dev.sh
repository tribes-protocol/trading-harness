#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

ARTIFACT="node_modules/.bin/tribes-cli"
ENTRY="src/cli/Tribes.ts"

install_global() {
  for dir in /usr/local/bin "$HOME/.local/bin" "$HOME/.bun/bin"; do
    mkdir -p "$dir" 2>/dev/null && cp -f "$ARTIFACT" "$dir/tribes-cli" 2>/dev/null && chmod +x "$dir/tribes-cli" &&
      echo "[dev] installed tribes-cli -> $dir/tribes-cli" && return 0
  done
}

(
  last_mtime=0
  while sleep 0.5; do
    [ -f "$ARTIFACT" ] || continue
    mtime=$(stat -f %m "$ARTIFACT" 2>/dev/null || stat -c %Y "$ARTIFACT")
    [ "$mtime" = "$last_mtime" ] && continue
    last_mtime=$mtime
    install_global
  done
) &
trap 'kill $! 2>/dev/null || true' EXIT INT TERM

NODE_ENV=development bun build --compile --watch --no-clear-screen --outfile "$ARTIFACT" "$ENTRY"
