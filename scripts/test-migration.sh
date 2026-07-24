#!/usr/bin/env bash
# Migration test suite for the /llm/proxy removal cutover. Run inside a sandbox
# VM from the repo root (or via `bash scripts/test-migration.sh`); every check
# prints PASS/FAIL/SKIP and the script exits non-zero if anything failed.
#
# Covers, per PR:
#   #91  tribes provider deleted; settings pin pi-native openrouter
#   #89  runtime API_BASE_URL honored over the NODE_ENV default (Env.ts)
#   #86  direct provider calls with egress-placeholder keys (LLM leg testable
#        everywhere; market-data legs are env-gated and SKIP when the boot env
#        doesn't inject their placeholders)
set -u
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

PASS=0 FAIL=0 SKIP=0
ok() { echo "PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $1"; FAIL=$((FAIL + 1)); }
skip() { echo "SKIP: $1"; SKIP=$((SKIP + 1)); }

echo "== migration tests @ $(git rev-parse --short HEAD) ($(git branch --show-current 2>/dev/null || echo detached)) =="

# --- #91: provider cutover -------------------------------------------------
if [ ! -f .pi/extensions/tribes/Provider.ts ]; then
  ok "tribes provider deleted"
else
  bad "Provider.ts still present"
fi
# Pi core merges ~/.pi/agent/settings.json (global) with <cwd>/.pi/settings.json
# (project, takes precedence). The repo's .pi/agent/settings.json is NOT read by
# pi, so the model pin must live in the PROJECT settings file.
if grep -q '"defaultProvider": "openrouter"' .pi/settings.json; then
  ok "project settings pin the native openrouter provider"
else
  bad "defaultProvider is not openrouter in .pi/settings.json"
fi
if grep -q '"defaultModel": "deepseek/deepseek-v4-pro"' .pi/settings.json; then
  ok "project settings pin the namespaced default model"
else
  bad "defaultModel is not deepseek/deepseek-v4-pro in .pi/settings.json"
fi
if grep -q '"defaultModel"' .pi/agent/settings.json 2>/dev/null; then
  bad "a defaultModel lingers in .pi/agent/settings.json (dead config pi never reads)"
else
  ok "no model pin in the unread .pi/agent/settings.json"
fi
if grep -rq 'llm/proxy' src .pi agent 2>/dev/null; then
  bad "a llm/proxy reference remains in the source"
else
  ok "no /llm/proxy references remain"
fi

# --- #89: runtime API_BASE_URL wins over the NODE_ENV default --------------
# Negative probe: a dead-port override must fail to CONNECT. Run the compiled
# binary directly from an .env-less cwd — the tribes-cli wrapper cd's into the
# workspace, where bun auto-loads .env and its API_BASE_URL takes precedence
# over the caller's env, which would defeat the probe. The pre-fix binary
# ignored the env var entirely and hit prod instead, surfacing as a 401.
COMPILED="$PWD/node_modules/.bin/tribes-cli-compiled"
if [ ! -x "$COMPILED" ]; then
  skip "API_BASE_URL probe (no compiled binary at $COMPILED)"
elif out=$(cd /tmp && API_BASE_URL="http://127.0.0.1:9" timeout 15 "$COMPILED" wallet list 2>&1); then
  bad "API_BASE_URL override ignored (dead-port call succeeded)"
else
  case "$out" in
    *401*) bad "API_BASE_URL override ignored (still reached a real backend: 401)" ;;
    *) ok "API_BASE_URL override honored (dead-port probe cannot connect)" ;;
  esac
fi

# --- wallet CLI against the real backend (auth + Env resolution together) --
if timeout 30 tribes-cli wallet list 2>/dev/null | grep -q evmWalletAddress; then
  ok "tribes-cli wallet list returns wallets"
else
  bad "tribes-cli wallet list failed"
fi
if [ -s .tribes/privy-wallets.json ]; then
  ok "wallet snapshot written (.tribes/privy-wallets.json)"
else
  bad "wallet snapshot missing after wallet list"
fi

# --- /agent/wallets with a freshly minted sandbox JWT ----------------------
API="${API_BASE_URL:-$(grep -m1 '^API_BASE_URL=' .env 2>/dev/null | cut -d= -f2-)}"
if [ -z "$API" ]; then
  skip "/agent/wallets probe (no API_BASE_URL in env or .env)"
else
  TOKEN=$(bun .pi/extensions/tribes/AgentProxyToken.ts 2>/dev/null)
  code=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$API/agent/wallets" || echo 000)
  if [ "$code" = "200" ]; then
    ok "/agent/wallets -> 200 with minted JWT"
  else
    bad "/agent/wallets -> $code"
  fi
fi

# --- #91: ENV_PASSTHROUGH persists the LLM placeholder into .env -----------
if bun -e 'const m = await import("./.pi/extensions/tribes/AuthBootstrap.ts"); await m.writeAuthEnv(process.cwd())' 2>/dev/null; then
  if grep -q '^OPENROUTER_API_KEY=' .env; then
    ok "writeAuthEnv persists OPENROUTER_API_KEY to .env"
  else
    bad "OPENROUTER_API_KEY missing from .env after writeAuthEnv"
  fi
else
  bad "writeAuthEnv failed to run"
fi

# --- #86: LLM leg — direct openrouter with the placeholder key -------------
KEY="${OPENROUTER_API_KEY:-$(grep -m1 '^OPENROUTER_API_KEY=' .env 2>/dev/null | cut -d= -f2-)}"
if [ -z "$KEY" ]; then
  skip "openrouter probes (no OPENROUTER_API_KEY in env or .env)"
else
  code=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' https://openrouter.ai/api/v1/models || echo 000)
  if [ "$code" = "200" ]; then
    ok "openrouter /models reachable (public, zero-rated)"
  else
    bad "openrouter /models -> $code"
  fi
  code=$(curl -sS -m 60 -o /tmp/or-chat.json -w '%{http_code}' \
    -X POST https://openrouter.ai/api/v1/chat/completions \
    -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
    -d '{"model":"deepseek/deepseek-v4-pro","messages":[{"role":"user","content":"Reply with the single word: pong"}],"max_tokens":8}' || echo 000)
  if [ "$code" = "200" ] && grep -q '"content"' /tmp/or-chat.json; then
    ok "openrouter chat completion on the pinned model (placeholder key swapped at egress)"
  else
    bad "openrouter chat completion -> $code ($(head -c 120 /tmp/or-chat.json 2>/dev/null))"
  fi
fi

# --- #86: market-data legs (env-gated; the boot env injects these only on --
# --- control planes that shipped the placeholder injection) ----------------
for var in COIN_GECKO_PRO_API_KEY BIRDEYE_API_KEY NANSEN_API_KEY MARKETSTACK_API_KEY; do
  val="${!var:-$(grep -m1 "^${var}=" .env 2>/dev/null | cut -d= -f2-)}"
  if [ -z "$val" ]; then
    skip "$var not injected on this box"
  else
    ok "$var placeholder present"
  fi
done

echo "== summary: $PASS passed, $FAIL failed, $SKIP skipped =="
[ "$FAIL" -eq 0 ]
