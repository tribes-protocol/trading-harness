#!/bin/sh
# First-boot bootstrap for the trading-harness.
#
# The sandbox clones this repo into /workspace and runs this ONCE before launching
# the agent. BOOT SPEED is the priority: just install deps so `pi` can run.
#
# No typecheck / lint / build here — CI does those (the code is assumed solid).
# Bun runs the TypeScript directly (CLIs via `bun .../X.ts`, extensions via jiti),
# so there is NOTHING to compile at boot; a tsc pass would only add latency and
# doesn't even warm bun's transpile cache.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

echo "[bootstrap] installing deps (incl. the pinned pi CLI)…"
# Pi ships as a devDependency -> node_modules/.bin/pi, on PATH via vm-init.
# --frozen-lockfile uses the committed bun.lock (skips resolution: faster +
# deterministic); fall back to a normal install if the lockfile is ever stale.
bun install --frozen-lockfile || bun install

echo "[bootstrap] done — run the harness with: pi"
