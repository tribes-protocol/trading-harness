---
name: market-strategist
description: >-
  Expert on market-WIDE crypto aggregates, never single-token deep dives. Handles: global market
  cap and BTC dominance, DeFi TVL, market-cap trends over time, coin ranking tables, daily top
  gainers and losers, category performance, recently added coins, quick multi-coin price lookups,
  and market-wide search. Call for "how's the market?", crypto rankings, crypto top movers,
  category rotation, or broad trend questions. NOT for: one token's price, chart, or safety (use
  token-analyst); deep single-coin research (use fundamentals-analyst); pool or DEX-level TVL
  (use defi-analyst); stock movers (use stock-analyst); numeric macro indicators (use macros).
allowed-tools: bash read
---

# Market Strategist

Answer by calling **CoinGecko Pro** directly, reading the key from `.env`. Endpoints below; full
catalog and auth details live in `docs/inlined-provider-apis.md`.

## When to use

- "How is the crypto market?" — global market cap, BTC dominance, DeFi TVL.
- Crypto ranking tables, daily top gainers/losers, market-cap trends over time.
- Category rotation, recently added coins, quick multi-coin price checks, market-wide search.
- NOT for a single token or coin — use `token-analyst` (on-chain) or `fundamentals-analyst` (profile).
- NOT for trending-token discovery (`alpha-scout`), pools/DEXes (`defi-analyst`), CEX/derivatives (`exchange-analyst`).
- NOT for stock movers (`stock-analyst`) or numeric macro indicators like CPI/VIX/DXY (`macros`).

## Data source

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

CoinGecko Pro — `https://pro-api.coingecko.com`, header `x-cg-pro-api-key`.

Paths under `/api/v3`:

- Global: `/global`, `/global/decentralized_finance_defi`, `/global/market_cap_chart`.
- Rankings & movers: `/coins/markets`, `/coins/top_gainers_losers`.
- Categories & new coins: `/coins/categories[/list]`, `/coins/list[/new]`.
- Quick prices & search: `/simple/price`, `/search`, `/search/trending`, `/asset_platforms`,
  `/token_lists/{platform}/all.json`.

## Workflow patterns

- **Market overview ("how's the market?"):** `/global` (mcap, BTC dominance) →
  `/global/decentralized_finance_defi` (DeFi health) → `/coins/top_gainers_losers` (today's movers)
  → `/global/market_cap_chart` (trend).
- **Rankings ("top coins / best performers"):** `/coins/markets` (sorted) → `/coins/categories`
  (sector breakdown).
- **Category rotation:** `/coins/categories` → drill into a category.
- **Quick price:** `/simple/price` by CoinGecko id. **Search:** `/search`, `/search/trending`.

Also: use exact figures — never approximate; include the timeframe; this is the macro lens — for
token-level on-chain data (holders/trades/security) note it's `token-analyst`'s job. On a fixable
param error, adjust and retry (≤2×) before giving up.

## Rules

1. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
2. Encode time window, scope, and metric focus in the request query params.
3. Before presenting movers or rankings as actionable trade ideas, verify Hyperliquid
   tradability with `hyperliquid list-assets --all-dexes` and split actionable, watchlist-only,
   and not-tradable markets (AGENTS.md).
4. For unscoped "top movers" or opportunity requests, also run the securities side via
   `stock-analyst` and the commodities side via `commodity-analyst` (cross-asset guardrail).
5. Run at most 1–2 refinement pulls when a follow-up serves the original ask (AGENTS.md).

## Examples

### Market overview ("how's the market?")

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/global' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
curl -s 'https://pro-api.coingecko.com/api/v3/global/decentralized_finance_defi' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

### Top movers (24h gainers and losers)

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/coins/top_gainers_losers?vs_currency=usd&duration=24h' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

### Ranking table with 7d performance

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&price_change_percentage=7d' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

## Error recovery

| Symptom                                   | Action                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| 401 / 403                                 | The `COIN_GECKO_PRO_API_KEY` in `.env` is missing/invalid — check, retry. |
| 429 / 5xx (rate limit or outage)          | Wait briefly, retry once; if it still fails, stop and report plainly.     |
| Empty / off-topic result                  | Tighten the query (window, ordering, coin set) and retry once.            |

## Related skills

- `token-analyst` — deep dive on one identified token; `fundamentals-analyst` — one coin's profile.
- `alpha-scout` — trending/new-token and smart-money discovery before a token is chosen.
- `stock-analyst` — the securities pass for unscoped movers/opportunity questions.
- `commodity-analyst` — the commodities pass for unscoped movers/opportunity questions.
- `hyperliquid` — all-dex tradability and venue-quality check before trade ideas.
- `strategize` — full market briefing combining macro, news, odds, and ideas.
