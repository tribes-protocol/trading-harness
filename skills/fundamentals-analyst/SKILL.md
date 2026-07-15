---
name: fundamentals-analyst
description: >-
  Research-grade profile of ONE listed coin via CoinGecko. Handles: descriptions, links,
  community/developer metrics, historical charts over custom date ranges, raw OHLCV candles (no
  indicator math), circulating/total supply trends, which exchanges list a coin, contract
  addresses per chain, and fiat rates. Call for deep coin research, historical performance,
  supply analytics, or listing coverage. NOT for: on-chain safety/trade forensics (use
  token-analyst); indicator math or backtests (use technical-analyst); coin discovery (use
  alpha-scout); quick prices or market-wide rankings (use market-strategist).
allowed-tools: bash read
---

# Fundamentals Analyst

Answer by calling **CoinGecko Pro** directly, reading the key from `.env`. Endpoints below; full
catalog and auth details live in `docs/inlined-provider-apis.md`.

## When to use

- Full research profile of one listed coin (description, links, community/dev metrics).
- Historical charts (price, volume, market cap) or raw OHLCV candles over explicit date ranges.
- Supply trends, exchange listings for a coin, contract-address lookup, fiat rates.
- NOT for on-chain safety, holders, or live trade flow — use `token-analyst`.
- NOT for indicator math or backtests on the candles — use `technical-analyst`.
- NOT for discovering trending or new coins — use `alpha-scout`.
- NOT for market-wide rankings or quick price tables — use `market-strategist`.

## Data source

These keys come from the environment — the same names the `src/common/Env.ts` constants
read (`process.env.*`), loaded from `.env`. Reference them directly by name in the calls below. In a bare shell, load them once with
`set -a; . ./.env; set +a`.

CoinGecko Pro — `https://pro-api.coingecko.com`, header `x-cg-pro-api-key`.

Paths under `/api/v3` (use the lowercase, hyphenated CoinGecko id: `bitcoin`, `ethereum`,
`render-token`; resolve an unknown name/symbol with `/search?query=`):

- Profile & links: `/coins/{id}` (community/developer/market data via query flags),
  history `/coins/{id}/history?date=DD-MM-YYYY`, tickers/listings `/coins/{id}/tickers`.
- Charts & candles: `/coins/{id}/market_chart[/range]`, `/coins/{id}/ohlc[/range]`.
- Supply trends: `/coins/{id}/circulating_supply_chart[/range]`,
  `/coins/{id}/total_supply_chart[/range]`.
- By contract: `/coins/{network}/contract/{address}` (+ `/market_chart[/range]`),
  price `/simple/token_price/{platform}`.
- Fiat: `/exchange_rates`, `/simple/supported_vs_currencies`.

## Rules

1. Reference each key from the environment (`.env`, exposed as the `src/common/Env.ts` constants) — e.g. `$BIRDEYE_API_KEY`. Never hardcode a key.
2. Always use an explicit timeframe/date range in historical pulls — NEVER "recently".
3. Bundle the pulls a research goal needs (profile + supply + listings), then synthesize once.
4. Output is your own synthesis of the JSON — relay figures with their timeframe.
5. Run at most 1–2 refinement pulls when a follow-up serves the original ask (AGENTS.md).

## Examples

### Full coin profile (market + community + developer data)

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/coins/solana?localization=false&tickers=false&market_data=true&community_data=true&developer_data=true' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

### Historical chart over an explicit range

```bash
FROM=$(date -j -f %Y-%m-%d 2026-04-01 +%s 2>/dev/null || date -d 2026-04-01 +%s)
TO=$(date -j -f %Y-%m-%d 2026-07-01 +%s 2>/dev/null || date -d 2026-07-01 +%s)
curl -s "https://pro-api.coingecko.com/api/v3/coins/ethereum/market_chart/range?vs_currency=usd&from=$FROM&to=$TO" \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

### Exchange listings for a coin

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/coins/chainlink/tickers?page=1' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

## Error recovery

| Symptom                                   | Action                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| 401 / 403                                 | The `COIN_GECKO_PRO_API_KEY` in `.env` is missing/invalid — check, retry. |
| 429 / 5xx (rate limit or outage)          | Wait briefly, retry once; if it still fails, stop and report plainly.     |
| 404 / "coin not found"                    | Resolve the id via `/search?query=<name>` and rerun with the exact id.    |

## Related skills

- `token-analyst` — on-chain deep dive: security, holders, live trades.
- `technical-analyst` — indicator computation and backtests on candles.
- `alpha-scout` — discovery before a specific coin is chosen.
- `market-strategist` — market-wide caps, rankings, movers.
