#!/bin/sh
# First-boot bootstrap for the trading-harness.
#
# The sandbox clones this repo into /workspace and runs this script ONCE, as root,
# before launching the agent. Its job: install the deps the thin warmup base lacks
# so `pi` can run. The base ships bun (the bridge runtime) + git; everything else
# the harness needs is installed here, at claim time, watched live in the terminal.
#
# Idempotent: re-running is safe (bun install is a no-op when satisfied).
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

echo "[bootstrap] installing node deps (incl. the pinned pi CLI)…"
# Pi ships as a devDependency, so this drops node_modules/.bin/pi — on PATH inside
# the VM because vm-init adds /workspace/node_modules/.bin. No global npm install.
bun install

# Build the entire world — the ata CLIs, the extensions, and every skill — so any
# compile error surfaces here at first boot instead of mid-trade.
echo "[bootstrap] building the world (ata + extensions + all skills)…"
bun run build

echo "[bootstrap] done — run the harness with: pi"
