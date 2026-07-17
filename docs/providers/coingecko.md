# CoinGecko Pro API

| | |
|---|---|
| Official docs | https://docs.coingecko.com |
| Docs review date | 2026-07-17 |
| API version | v3 (docs site v3.0.1; REST paths under `/api/v3`) |
| Base URL | `https://pro-api.coingecko.com/api/v3` |
| Auth | API key in header `x-cg-pro-api-key`; env var `COINGECKO_PRO_API_KEY` |
| Adapter | `src/providers/coingecko/adapter.ts` (`CoinGeckoAdapter`) |
| Research record | `docs/research/providers/coingecko-pro.json` |

## Identifier semantics — READ FIRST

**`getQuote({ symbol })` interprets `symbol` as a CoinGecko COIN ID** (e.g.
`bitcoin`, `usd-coin`), **not** a ticker symbol. CoinGecko is keyed on its own
coin ids; ticker symbols are ambiguous (many coins share the same ticker) and
are never used as a join key anywhere in this adapter. Resolve tickers to coin
ids upstream (canonical map: `GET /coins/list`). The raw coin id is preserved
in `providerIds.coingecko` on every payload.

## Verified capabilities

| Operation | Endpoint | Freshness | Notes |
|---|---|---|---|
| `market.quote` (`getQuote`) | `GET /coins/markets` | delayed (cache ~30 s paid) | Input is a CoinGecko coin id. Aggregated cached price, market cap, 24h volume/change. |
| `onchain.token_price` (`getTokenPrice`) | `GET /simple/price` (by coin id) / `GET /simple/token_price/{platform}` (by chain + contract address) | delayed (cache ~20 s paid) | Chain→platform mapping only for verified platforms (see below); anything else throws `NotSupportedError`. |
| `onchain.token_ohlcv` (`getTokenOhlcv`) | `GET /coins/{id}/ohlc` | delayed (cache ~15 min) | Requires a coin id (`token.providerId`). `1d`/`1h` only (`interval=daily|hourly`, paid plans). No native from/to — the adapter picks the smallest documented `days` bucket for the interval (`daily`: 1/7/14/30/90/180; `hourly`: 1/7/14/30/90 — the only documented combinations) and filters client-side. Requests beyond the documented maximum (180 d daily / 90 d hourly) are truncated to it and stamped `incomplete`. No volume in OHLC responses. |
| `onchain.dex_pairs` (`getDexPairs`) | `GET /onchain/networks/{network}/tokens/{token_address}/pools` (GeckoTerminal) | delayed (cache ~30 s paid) | Top pools by token address, 20/page (page 1 only). Numeric fields arrive as JSON strings; converted with a lineage note. No per-pool timestamp — `asOf` = `receivedAt`. |

Every payload is stamped `source.freshness: "delayed"` and `quality:
["delayed"]` — CoinGecko serves cached aggregates (20 s – 12 h cadence
depending on endpoint/range), never exchange-direct real-time data.

### Verified chain mappings

Only these chains are mapped (verified against the official
`/onchain/networks` and `/asset_platforms` responses — see research record
`platformMappings`); all others throw `NotSupportedError`:

| Platform chain | Asset platform id (`/simple/token_price/{id}`) | Onchain network id (`/onchain/...`) |
|---|---|---|
| ethereum | `ethereum` | `eth` |
| solana | `solana` | `solana` |
| polygon | `polygon-pos` | `polygon_pos` |
| arbitrum | `arbitrum-one` | `arbitrum` |
| optimism | `optimistic-ethereum` | `optimism` |
| base | `base` | `base` |
| bsc | `binance-smart-chain` | `bsc` |
| avalanche | `avalanche` | `avax` |

## Freshness & history

- Simple price / token price: cached every 20 s (paid). `/coins/markets`: 30 s. OHLC: 15 min. Onchain pools: 30 s.
- Daily history since 2014, **plan-gated**: 2 years (Demo/Basic) vs 10 years (Analyst/Lite/Enterprise). Hourly since 2018-01-30 (max 100 days/request); 5-minutely is Enterprise-only.
- Daily points finalize at 00:00 UTC, available ~00:10 UTC (market_chart) / ~00:35 UTC (history snapshot).
- Onchain (GeckoTerminal) history from September 2021, Analyst+ for historical access.

## Rate limits & credits

Per-minute limit + monthly call credits; each HTTP 200 costs 1 credit. Failed
requests (4xx/5xx) cost no credits but **do** count toward the per-minute
limit. No REST `Retry-After` semantics documented — the adapter throttles
client-side at a conservative 4 rps (below the Basic-plan floor of 300/min).

| Plan | Credits/month | Rate limit |
|---|---|---|
| Demo (different host/key type — not usable with this adapter) | 10,000 | 100/min |
| Basic | 100,000 | 300/min |
| Analyst | 500,000 | 500/min |
| Lite | 2M+ (tiered) | 500/min |
| Enterprise | custom | custom |

Quota monitoring: `GET /key`.

## Entitlements

- Pro base URL requires a paid-plan key (Demo keys use a different host and key parameter; mixing them triggers vendor errors 10002/10010/10011).
- `interval=daily|hourly` on `/coins/{id}/ohlc`: paid plans. 5-minutely data and supply charts: Enterprise.
- Many research endpoints (top gainers/losers, OHLC range, onchain token OHLCV/trades/holders, `/key`) require Analyst+; onchain pools pagination beyond 10 pages requires Analyst+.

## Licensing / attribution / storage

- **Attribution required** on commercial plans: "Data provided by CoinGecko" with a hyperlink to https://www.coingecko.com/en/api ("Powered by CoinGecko", font ≥ 10, per TOS s4.4 and brand guidelines). The adapter exports `COINGECKO_ATTRIBUTION` and `COINGECKO_ATTRIBUTION_URL` for display surfaces.
- **No redistribution/resale/syndication** without an executed (Enterprise) agreement (TOS s4.1.6). Internal research use is the safe envelope.
- **Storage constrained**: TOS s6.1 permits limited caching with refresh at least every 24 h; s6.2 prohibits duplicating/deriving/storing Data beyond that scope. Long-term persistence of historical data likely requires an Enterprise agreement. All Data must be deleted on termination (s10.4.3).

## Known limitations

- Cached aggregates only — must never be presented as tick-level or exchange-direct real-time data.
- Crypto/NFT/DEX only; no equities, FX, rates, or commodities.
- Coin ids are the only reliable identifier; symbol filters are capped and non-unique.
- `/coins/{id}/ohlc` auto-granularity is coarse without the paid `interval` param; OHLC has no volume field.
- Ticker quality varies by venue (`is_anomaly`/`is_stale`/nullable `trust_score`); `/exchanges` excludes inactive venues (survivorship bias).
- No documented REST backoff guidance or error-body schema; failed calls still count against the per-minute limit.

## Institutional use

- **PRIMARY**: crypto reference prices, market caps, sector/category analytics, venue-quality screening, long crypto history (plan-gated depth).
- **FALLBACK**: DEX pair data (behind Birdeye), near-real-time price display where 20–60 s cached data is acceptable and labeled.
- **NOT SUITABLE**: non-crypto asset classes, tick-level/execution-grade data, full order books, redistribution products.
