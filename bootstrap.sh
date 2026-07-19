#!/bin/sh
# First-boot bootstrap for the trading-harness.
#
# The sandbox clones this repo into /root/workspace and runs this ONCE before launching
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

# Install the synced zipbox catalog once under the sandbox-wide read-only path.
# Trading-only skills remain real directories in this repo; the synced zipbox
# entries become per-slug links to /root/skills.
sh "$PWD/scripts/install-shared-skills.sh" \
  || echo "[bootstrap] shared skills: install did not complete (non-fatal, continuing)"

# Preallocate a swapfile sized to the VM's RAM, BEFORE the heavy steps below so
# they all benefit. Each sandbox tier pins a fixed RAM size (xs=2G, s=4G, m=8G,
# l=16G, …) but the tier is NOT passed into the guest — the only in-guest signal
# is /proc/meminfo's MemTotal. swap == RAM gives the memory-hungry steps that
# follow (bun install + the native `bun build --compile`) somewhere to spill
# under pressure instead of getting OOM-killed. Idempotent and non-fatal: a box
# without swap privileges or free disk must not block the harness from starting.
setup_swapfile() {
  # Idempotent: bail if we already have swap (our file present, or swap active
  # by any means — swapon --show non-empty, or a /proc/swaps device line).
  if [ -e /swapfile ]; then
    echo "[bootstrap] swap: /swapfile already present; skipping"
    return 0
  fi
  if [ -n "$(swapon --show 2>/dev/null)" ] || grep -q '^/' /proc/swaps 2>/dev/null; then
    echo "[bootstrap] swap: swap already active; skipping"
    return 0
  fi

  # Size = MemTotal rounded UP to whole GB, floored at 1. MemTotal is in KiB and
  # 1 GiB = 1048576 KiB, so adding (1048576 - 1) before the integer divide rounds up.
  mem_kib=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
  [ -n "$mem_kib" ] || mem_kib=1048576
  gb=$(( (mem_kib + 1048575) / 1048576 ))
  [ "$gb" -ge 1 ] || gb=1
  echo "[bootstrap] swap: MemTotal=${mem_kib}KiB -> preallocating ${gb}G /swapfile"

  # Create a REAL (non-sparse) swapfile. fallocate is instant but can leave holes
  # that mkswap rejects, so verify by formatting; on any failure remove the file
  # and rewrite it fully with dd, which writes every byte (never sparse).
  if ! { fallocate -l "${gb}G" /swapfile 2>/dev/null \
         && chmod 600 /swapfile && mkswap /swapfile >/dev/null 2>&1; }; then
    rm -f /swapfile
    if ! { dd if=/dev/zero of=/swapfile bs=1M count=$(( gb * 1024 )) status=none 2>/dev/null \
           && chmod 600 /swapfile && mkswap /swapfile >/dev/null 2>&1; }; then
      echo "[bootstrap] swap: could not create /swapfile; continuing without swap"
      rm -f /swapfile
      return 1
    fi
  fi

  if ! swapon /swapfile 2>/dev/null; then
    echo "[bootstrap] swap: swapon failed; continuing without swap"
    rm -f /swapfile
    return 1
  fi

  # Persist across reboots — append only if the exact line isn't already there.
  if ! grep -qsF '/swapfile none swap sw 0 0' /etc/fstab 2>/dev/null; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  echo "[bootstrap] swap: enabled ${gb}G /swapfile (persisted to /etc/fstab)"
  return 0
}

# Call via `||` so its failure can't abort bootstrap (set -e is suppressed for a
# command on the left of ||); each internal failure already logs its own reason.
setup_swapfile || echo "[bootstrap] swap: setup did not complete (non-fatal, continuing)"

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

# NOTE: this agent declares NO npm Pi packages in .pi/agent/settings.json — it
# runs vanilla Pi plus the two LOCAL extensions in .pi/extensions (hyperliquid,
# tribes), which need no registry fetch. Do not re-add a `packages` list or an
# install loop here: every declared npm package is also auto-installed by Pi at
# LAUNCH time, where a registry transport failure is fatal and bricks the box
# (P0 #2273 — pi-subagents returned a zero-byte body → EINTEGRITY at launch).
#
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
# clutter the user's /root/workspace (the dispatcher gates re-runs on package.json,
# not on this script's presence).
rm -f -- "$0"
