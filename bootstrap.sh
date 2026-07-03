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

# @solana/web3.js pulls in bigint-buffer, whose native binding is optional.
# Bundle the package into tribes-cli so the compiled binary can use the pure JS
# fallback instead of depending on a runtime .node artifact. Patch only the
# package's noisy warning before compile so Pi startup stays quiet.
quiet_bigint_buffer_warning() {
  TARGET="$PWD/node_modules/bigint-buffer/dist/node.js"
  [ -f "$TARGET" ] || return 0

  bun --eval '
const fs = require("fs")
const target = process.argv[1]
const warning = "        console.warn('\''bigint: Failed to load bindings, pure JS will be used (try npm run rebuild?)'\'');"
const source = fs.readFileSync(target, "utf8")
fs.writeFileSync(target, source.replace(warning, "        // Native bigint-buffer binding is optional; use the bundled JS fallback."))
' "$TARGET"
}

quiet_bigint_buffer_warning

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

# Pre-install the Pi extensions this agent declares in .pi/agent/settings.json
# (pi-subagents plus its companions pi-intercom + pi-prompt-template-model) so
# the npm fetch is paid here at boot rather than on the first `pi` session.
# `pi install` is idempotent against the committed `packages` list and writes
# each package under .pi/agent/npm (gitignored). Keep it non-fatal: a registry
# hiccup must not block the trading harness from starting, and Pi will
# auto-install any still-missing declared package on launch.
echo "[bootstrap] installing declared pi extensions (pi-subagents + companions)…"
for ext in pi-subagents pi-intercom pi-prompt-template-model; do
  if pi install "npm:$ext"; then
    echo "[bootstrap] installed $ext"
  else
    echo "[bootstrap] could not install $ext now; pi will retry it on first launch"
  fi
done

# NOTE: do NOT run `pi update` here. This repo PINS pi (@earendil-works/
# pi-coding-agent + pi-tui at 0.79.8) and the .pi extensions are written against
# that exact API. Updating pi out from under them desyncs the runtime from the
# pinned extension API and breaks the tribes extension's session_start hook —
# which silently leaves .env unwritten (no bearer token → every proxy/wallet
# call fails). Bump the pin in package.json + bun.lock instead.

ENTRY="src/cli/Tribes.ts"
# Build artifact. node_modules/.bin is writable and already on PATH in the
# sandbox, so this is both the build output and the in-sandbox PATH fallback.
ARTIFACT="$PWD/node_modules/.bin/tribes-cli"
COMPILED_ARTIFACT="$PWD/node_modules/.bin/tribes-cli-compiled"

echo "[bootstrap] compiling the harness into a single tribes-cli binary…"
rm -f "$ARTIFACT" "$COMPILED_ARTIFACT"
if NODE_ENV=production bun build --compile --outfile "$COMPILED_ARTIFACT" "$ENTRY"; then
  printf '#!/bin/sh\ncd "%s"\nexec "%s" "$@"\n' "$PWD" "$COMPILED_ARTIFACT" >"$ARTIFACT"
  chmod +x "$ARTIFACT"
  echo "[bootstrap] compiled $ENTRY -> $COMPILED_ARTIFACT"
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

# First-boot install is done. Remove this once-only installer so it does not
# clutter the user's /workspace (the dispatcher gates re-runs on package.json,
# not on this script's presence).
rm -f -- "$0"
