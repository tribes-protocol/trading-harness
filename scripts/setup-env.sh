#!/bin/sh
# Switch the local `tribes-cli` binary between the production and development
# backends by recompiling it with the right NODE_ENV baked in.
#
#   bun run setup:dev    -> build against localhost  (web :3000, api :8787)
#   bun run setup:prod   -> build against tribes.xyz (the default for clones)
#
# WHY a rebuild and not a runtime flag: `bun build --compile` inlines
# `process.env.NODE_ENV` at BUILD time (src/common/Env.ts reads it once at module
# load). So the environment is chosen here, when the binary is compiled — editing
# .env afterwards does nothing to the already-compiled binary.
#
# A fresh clone only runs bootstrap.sh, which compiles for production. Development
# is therefore strictly opt-in: nobody targets localhost unless they run
# `bun run setup:dev` on purpose.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

MODE="${1:-}"
case "$MODE" in
  dev) NODE_ENV_VALUE=development ;;
  prod) NODE_ENV_VALUE=production ;;
  *)
    echo "usage: setup-env.sh <dev|prod>" >&2
    exit 2
    ;;
esac

ENV_FILE="$PWD/.env"

# A development build points tribes-cli at localhost and reads PRIVY_APP_ID from
# .env (src/common/Env.ts hardcodes it only for production). Without it EVERY
# tribes-cli command throws at startup, so fail here with a clear reason rather
# than deferring the failure to the first confusing command.
if [ "$MODE" = "dev" ] && ! grep -qE '^[[:space:]]*PRIVY_APP_ID=[^[:space:]]+' "$ENV_FILE" 2>/dev/null; then
  cat >&2 <<'MSG'
[setup:dev] PRIVY_APP_ID is missing from .env — cannot build a development binary.

A development build points tribes-cli at your LOCAL machine:
    web (login URL) -> http://localhost:3000
    api             -> http://localhost:8787
and needs the app id of your local Privy app. Production builds use a hardcoded
Privy app, so this is only required for dev.

Fix: add this line to .env, then re-run `bun run setup:dev`:
    PRIVY_APP_ID=<your local Privy app id>
MSG
  exit 1
fi

# Keep .env's NODE_ENV in sync with the build we're producing. This is cosmetic
# for the compiled binary (NODE_ENV is baked in above), but it keeps the
# run-from-source path (`bun run dev`) and .env honest instead of contradicting
# the binary. Drop any prior NODE_ENV line — and the common `ODE_ENV` typo — then
# append the correct value.
if [ -f "$ENV_FILE" ]; then
  ENV_TMP="$ENV_FILE.tmp.$$"
  grep -vE '^[[:space:]]*N?ODE_ENV=' "$ENV_FILE" > "$ENV_TMP" || true
  printf 'NODE_ENV=%s\n' "$NODE_ENV_VALUE" >> "$ENV_TMP"
  mv "$ENV_TMP" "$ENV_FILE"
  chmod 600 "$ENV_FILE" 2>/dev/null || true
fi

ENTRY="src/cli/Tribes.ts"
# Build artifact + a tiny shim. The shim `cd`s to the repo root before exec'ing
# so the workspace .env (PRIVY_APP_ID for dev, the bearer token for both) is
# auto-loaded by bun no matter which directory tribes-cli is invoked from. This
# mirrors bootstrap.sh so dev and prod installs behave identically.
ARTIFACT="$PWD/node_modules/.bin/tribes-cli"
COMPILED_ARTIFACT="$PWD/node_modules/.bin/tribes-cli-compiled"

echo "[setup:$MODE] compiling tribes-cli (NODE_ENV=$NODE_ENV_VALUE)…"
rm -f "$ARTIFACT" "$COMPILED_ARTIFACT"
if NODE_ENV="$NODE_ENV_VALUE" bun build --compile --outfile "$COMPILED_ARTIFACT" "$ENTRY"; then
  printf '#!/bin/sh\ncd "%s"\nexec "%s" "$@"\n' "$PWD" "$COMPILED_ARTIFACT" >"$ARTIFACT"
  chmod +x "$ARTIFACT"
else
  # --compile unavailable (older bun / unsupported target): fall back to a shim
  # that runs the same entry through bun with NODE_ENV set explicitly.
  echo "[setup:$MODE] bun --compile unavailable; installing a bun shim instead"
  printf '#!/bin/sh\ncd "%s"\nexec env NODE_ENV=%s bun "%s/%s" "$@"\n' \
    "$PWD" "$NODE_ENV_VALUE" "$PWD" "$ENTRY" >"$ARTIFACT"
  chmod +x "$ARTIFACT"
fi

# Install globally so `tribes-cli` resolves from anywhere. Same dir order as
# bootstrap.sh; the shim is self-contained (absolute paths), so a plain copy works.
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
  echo "[setup:$MODE] installed tribes-cli -> $GLOBAL_DIR/tribes-cli"
else
  echo "[setup:$MODE] no global bin dir was writable; tribes-cli is at $ARTIFACT"
fi

if [ "$MODE" = "dev" ]; then
  cat <<'MSG'
[setup:dev] Done — tribes-cli now targets the DEVELOPMENT backend:
    web (login URL) -> http://localhost:3000
    api             -> http://localhost:8787
    Privy app       -> PRIVY_APP_ID from .env
Start your local web (:3000) and api (:8787), then run /tribes:login to sign in.
Switch back to production any time with: bun run setup:prod
MSG
else
  cat <<'MSG'
[setup:prod] Done — tribes-cli now targets PRODUCTION (tribes.xyz / api.tribes.xyz).
This is the default backend for a fresh clone. Run /tribes:login to sign in.
MSG
fi
