#!/bin/sh
# First-boot bootstrap for the trading-harness.
#
# The sandbox clones this repo into /workspace and runs this ONCE before launching
# the agent. It does two things:
#   1. install deps (incl. the pinned pi CLI), and
#   2. compile the whole project into ONE native binary, `tribes-cli`, installed
#      globally so it resolves from any directory.
#
# Why compile: every skill calls `tribes-cli <group> <command> …` instead of
# `bun src/cli/<Name>.ts …`. A single prebuilt native binary means no per-call
# bun transpile and no `@/` alias resolution at runtime — the agent's commands
# start instantly. The one-time compile cost is paid here, at boot.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

echo "[bootstrap] installing deps (incl. the pinned pi CLI)…"
# Pi ships as a devDependency -> node_modules/.bin/pi, on PATH via vm-init.
# --frozen-lockfile uses the committed bun.lock (skips resolution: faster +
# deterministic); fall back to a normal install if the lockfile is ever stale.
bun install --frozen-lockfile || bun install

# Expose pi at /usr/local/bin/pi so it resolves by name from ANY shell — incl.
# the interactive `bash -l` the sandbox drops you into between agent runs, whose
# login-reset PATH drops node_modules/.bin. Vanilla harnesses install pi to
# /usr/local/bin too (npm -g); match that so `which pi` is identical everywhere.
# A symlink (not a copy) keeps pi next to its node_modules so its requires still
# resolve.
if ln -sf "$PWD/node_modules/.bin/pi" /usr/local/bin/pi 2>/dev/null; then
  echo "[bootstrap] linked pi -> /usr/local/bin/pi"
else
  echo "[bootstrap] could not link pi into /usr/local/bin (still on PATH via node_modules/.bin)"
fi

# NOTE: do NOT run `pi update` here. This repo PINS pi (@earendil-works/
# pi-coding-agent + pi-tui at 0.74.0) and the .pi extensions are written against
# that exact API. Updating pi out from under them desyncs the runtime from the
# pinned extension API and breaks the tribes extension's session_start hook —
# which silently leaves .env unwritten (no bearer token → every proxy/wallet
# call fails). Bump the pin in package.json + bun.lock instead.

ENTRY="src/cli/Tribes.ts"
# Build artifact. node_modules/.bin is writable and already on PATH in the
# sandbox, so this is both the build output and the in-sandbox PATH fallback.
ARTIFACT="$PWD/node_modules/.bin/tribes-cli"

echo "[bootstrap] compiling the harness into a single tribes-cli binary…"
if bun build --compile --outfile "$ARTIFACT" "$ENTRY"; then
  echo "[bootstrap] compiled $ENTRY -> $ARTIFACT"
else
  # --compile unavailable (older bun / unsupported target): fall back to a shim
  # that runs the same entry through bun. Same `tribes-cli` interface either way.
  echo "[bootstrap] bun --compile unavailable; installing a bun shim instead"
  printf '#!/bin/sh\nexec bun "%s/%s" "$@"\n' "$PWD" "$ENTRY" >"$ARTIFACT"
  chmod +x "$ARTIFACT"
fi

# Install globally so `tribes-cli` is callable from anywhere. Try the standard
# global bin dirs in order; the compiled binary is self-contained, so a plain
# copy works. node_modules/.bin (the artifact itself) is the last-resort PATH.
install_global() {
  for dir in /usr/local/bin "$HOME/.local/bin" "$HOME/.bun/bin"; do
    [ -n "$dir" ] || continue
    if mkdir -p "$dir" 2>/dev/null && cp -f "$ARTIFACT" "$dir/tribes-cli" 2>/dev/null; then
      chmod +x "$dir/tribes-cli" 2>/dev/null || true
      printf '%s' "$dir"
      return 0
    fi
  done
  return 1
}

if GLOBAL_DIR="$(install_global)"; then
  echo "[bootstrap] installed tribes-cli -> $GLOBAL_DIR/tribes-cli"
  case ":$PATH:" in
    *":$GLOBAL_DIR:"*) : ;;
    *) echo "[bootstrap] note: $GLOBAL_DIR is not on PATH; add it to call tribes-cli by name" ;;
  esac
else
  echo "[bootstrap] no global bin dir was writable; tribes-cli is at $ARTIFACT"
  echo "[bootstrap] (node_modules/.bin is on PATH in the sandbox, so skills still resolve it)"
fi

echo "[bootstrap] done — run the harness with: pi"
