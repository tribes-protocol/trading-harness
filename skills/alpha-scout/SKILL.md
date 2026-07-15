---
name: alpha-scout
description: >-
  Discovers opportunities BEFORE a specific token is chosen. Handles: trending tokens, new token
  listings, and smart-money flows and accumulation. Call to find what is hot or where smart money
  is rotating. NOT for: one identified token's price, safety, or trades (use token-analyst);
  market-wide rankings or top movers (use market-strategist); trending pools (use defi-analyst).
allowed-tools: bash read
---

# Alpha Scout

Answer by calling discovery providers **directly** (BirdEye + Nansen), reading keys from `.env`.
Endpoints below; full catalog and auth details live in `docs/inlined-provider-apis.md`.

## When to use

- "What's trending?" / "What's hot right now?" — trending-token discovery.
- "What are whales / smart money buying?" — smart-money accumulation and flows.
- "Any new tokens worth watching?" — new listings plus a validation pass.
- NOT for one identified token's price, security, or trades — use `token-analyst`.
- NOT for market-wide rankings, global caps, or top gainers/losers — use `market-strategist`.
- NOT for trending or new pools and DEX pairs — use `defi-analyst`.

## Data sources

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

- **BirdEye** — `https://public-api.birdeye.so`, header `X-API-KEY` [+ `x-chain`]:
  trending `GET /defi/token_trending`, new listings `GET /defi/v2/tokens/new_listing`,
  smart-money token list `GET /smart-money/v1/token/list`, name→address `GET /defi/v3/search`.
- **Nansen** — `https://api.nansen.ai`, header `apiKey`, POST JSON: smart-money
  `POST /api/v1/smart-money/{netflow,holdings,historical-holdings,dex-trades,perp-trades,dcas}`.

`x-chain` values: `1 ethereum`, `10 optimism`, `56 bsc`, `137 polygon`, `8453 base`,
`42161 arbitrum`, `solana`.

## Workflow patterns

- **"What's trending / hot?":** `/defi/token_trending` (BirdEye) → smart-money (Nansen
  `/smart-money/netflow` or BirdEye `/smart-money/v1/token/list`) → **cross-reference**: a token
  that is BOTH trending and net-accumulated by smart money is a stronger signal than either alone.
- **"What are whales buying?":** Nansen `/smart-money/netflow` / `/holdings` (filter chain, window).
- **New-token discovery:** `/defi/v2/tokens/new_listing` — and **flag the age** (fresh = higher risk).
- **Resolve a name/symbol** with `/defi/v3/search?chain=<net>&keyword=` before deeper tools.

Also: prioritize recency (alpha is being early); include the timeframe + signal strength; do NOT
make buy/sell recommendations — present the data and let the user decide. Holder/trader deep-dives
hand off to `token-analyst`. On a fixable param error, adjust and retry (≤2×) before giving up.

## Rules

1. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
2. Filter deliberately: choose the chain (`x-chain`), a sort, and a limit that match the ask.
3. Intersect signals yourself — a token that is BOTH trending and net-accumulated by smart money
   ranks above one that only shows up in a single list.
4. Verify Hyperliquid tradability before presenting ideas as executable (AGENTS.md guardrail).
5. IF the request was unscoped, add securities (`stock-analyst`) and commodities
   (`commodity-analyst`) passes (AGENTS.md cross-asset guardrail).
6. Hand off a chosen token: on-chain deep-dive → `token-analyst`; profile → `fundamentals-analyst`.

## Examples

### What's hot right now (trending)

```bash
curl -s 'https://public-api.birdeye.so/defi/token_trending?sort_type=desc&offset=0&limit=20' \
  -H "X-API-KEY: $BIRDEYE_API_KEY" -H 'x-chain: solana' -H 'accept: application/json'
```

### Smart-money accumulation (Nansen netflow)

Nansen bodies are **flat snake_case JSON** — no `parameters` wrapper. `smart-money/netflow` takes
`chains:[...]` (e.g. `ethereum`, `solana`, `base`, `bnb`, `arbitrum`, or `all`), an optional
`filters` object (`include_stablecoins`, `include_native_tokens`, …), and optional `pagination`.

```bash
curl -s -X POST 'https://api.nansen.ai/api/v1/smart-money/netflow' \
  -H "apiKey: $NANSEN_API_KEY" -H 'content-type: application/json' -H 'accept: application/json' \
  -d '{"chains":["solana"],"filters":{"include_stablecoins":false},"pagination":{"page":1,"per_page":20}}'
```

### New listings (then validate with a trending or smart-money overlap)

```bash
curl -s "https://public-api.birdeye.so/defi/v2/tokens/new_listing?limit=20&time_to=$(date +%s)" \
  -H "X-API-KEY: $BIRDEYE_API_KEY" -H 'x-chain: solana' -H 'accept: application/json'
```

## Error recovery

| Symptom                                   | Action                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| 401 / 403 from a provider                 | The key in `.env` is missing/invalid — check it, then retry once.             |
| 429 / 5xx (rate limit or outage)          | Wait briefly, retry once; if it still fails, stop and report plainly.         |
| Empty or thin result                      | Widen the window/limit or switch chain once; if still thin, report the gap.   |
| Nansen 400/422 (body rejected)            | Body must be flat snake_case (no `parameters` wrapper); use `chains`+`filters`. |

## Related skills

- `token-analyst` — deep-dive on one identified token (price, security, trades, holders).
- `fundamentals-analyst` — research profile of one listed coin.
- `hyperliquid` — tradability verification and execution for discovered ideas.
