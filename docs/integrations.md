# Direct market-data provider integrations

The harness integrates ten external data providers directly — these are the agent's ONLY
research surface: the former remote analyst agents (`<name> ask`) were removed, and Pi performs
all analysis itself from the structured commands below (plus the `technicals` indicator engine
computed from their candles). Direct integrations give deterministic, seconds-fast data and
fallbacks when the Tribes proxy is unavailable.

## Shared machinery

| Piece                           | Purpose                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/common/Env.ts`             | One optional env var per provider (below). Empty string = provider disabled; dependent commands fail with a clear message or fall back.                         |
| `src/helpers/ProviderHttp.ts`   | All provider I/O. 15s timeout, ≤2 retries with exponential backoff, honors `Retry-After` on 429/5xx, redacts every configured secret from error text.           |
| `src/helpers/ProviderCache.ts`  | Read-through file TTL cache at `.tribes/provider-cache/` (gitignored). Raw payloads cached; zod parsing happens after retrieval. Cache keys never contain keys. |
| `src/helpers/ProviderChains.ts` | Per-provider chain-slug maps for the six supported EVM chains + Solana.                                                                                         |
| `src/cli/Tribes.ts`             | Last-resort redaction: every known secret is stripped from fatal CLI error output.                                                                              |

Env vars (read only in `Env.ts`, never logged): `ALCHEMY_API_KEY`, `HELIUS_API_KEY`,
`MORALIS_API_KEY`, `BIRDEYE_API_KEY`, `COIN_GECKO_PRO_API_KEY`, `NANSEN_API_KEY`,
`MARKETSTACK_API_KEY`, `FRED_API_KEY`, `NEWSDATAIO_API_KEY`, `TAVILY_API_KEY`.

Every normalized payload carries a `source` field naming the provider that actually answered.

## Provider map

### FRED — macro series (`macros`)

- Purpose: direct macro data; fallback source for the `macros market` snapshot.
- Commands: `macros series --id <FRED_ID> [--limit]` (always direct);
  `macros market` (Tribes proxy first, rebuilt from FRED on proxy failure — same shape,
  stderr note).
- Endpoint: `GET /fred/series/observations` (api.stlouisfed.org, `api_key` query param).
- Cache: 10 min. Limits: ~120 req/min, free.
- Quirks handled: values arrive as strings with `.` for missing (dropped); monthly series can
  have gaps (the never-published Oct 2025 CPI print) so CPI YoY matches the year-ago month by
  date, not index; `GOLDAMGBD228NLBM` was discontinued by FRED — the direct snapshot reports it
  in `errors` and leaves gold null.

### CoinGecko Pro — crypto market data (`market-data`)

- Purpose: fast structured crypto prices, rankings, global aggregates, trending, coin profiles,
  OHLC, id search. The data surface behind the `market-strategist`/`fundamentals-analyst` playbooks.
- Commands: `market-data prices|top|global|trending|coin|ohlc|search`.
- Base: `pro-api.coingecko.com/api/v3`, header `x-cg-pro-api-key` (Pro keys only — Demo keys
  need a different base URL and are not supported).
- Cache: prices 60s, top 2m, global 5m, trending/coin 10m, ohlc 5m, search 24h.
- Limits: plan-dependent (Analyst 500k credits/mo @ 500/min); failed calls also count.
- Quirks handled: `/global` `{data}` envelope unwrap; trending `coins[].item` nesting with
  formatted-string numerics (normalized to null unless cleanly numeric); OHLC `interval` param
  is plan-gated and never sent.
- Also used as the `token overview` fallback via `/onchain/networks/{net}/tokens/{addr}`
  (GeckoTerminal JSON:API; numeric attributes are strings, parsed defensively).

### Marketstack — stock market data (`stocks`)

- Purpose: deterministic equity EOD/intraday OHLCV, ticker search, ticker profiles.
  The data surface behind the `stock-analyst` playbook.
- Commands: `stocks eod|intraday|search|ticker`.
- Base: `api.marketstack.com/v2` (v1 is deprecated), `access_key` query param (redacted
  everywhere; cache keys built from non-secret query parts only).
- Cache: eod 15m (latest 5m), intraday 60s, search/ticker 24h.
- Limits: 5 req/s all plans; free plan is 100 req/mo EOD-only — intraday is Basic+ and its
  403 plan-gate errors surface plainly.
- Quirks handled: v2 search rows use `ticker` (not `symbol`); intraday IEX quote fields are
  null without entitlement; `.`→`-` symbol mapping for intraday (BRK.B → BRK-B).

### NewsData.io — fast headlines (`news headlines`)

- Purpose: seconds-fast raw headlines for crypto coins, business/macro categories, and keyword
  topics — the gap the analyzed `news fetch` flow (slow, asset-scoped) does not cover.
- Command: `news headlines [--query|--coin btc,eth|--category business] [--country] [--language]
[--timeframe 1-48] [--size 1-50] [--page <token>]`.
- Endpoints: `/api/1/latest`; `/api/1/crypto` when `--coin` is set (which rejects
  `--category`/`--country` — the crypto feed does not document them). `apikey` query param.
- Cache: 5 min (key includes every filter and the page token).
- Limits: free tier 200 credits/day, 30 credits/15min, ≤10 articles/credit, ~12h delay;
  paid tiers are real-time.
- Quirks handled: plan-gated fields arrive as placeholder strings ("ONLY AVAILABLE IN …") and
  normalize to null; provider sentiment is `positive|negative|neutral` (kept) or anything else
  (nulled) — it is NOT the harness's analyzed bullish/bearish sentiment.

### Tavily — web search fallback (`web-search`)

- Purpose: transparent direct fallback when the `/agent/web` proxy fails; output shape is
  identical to the proxy so callers can't tell the difference.
- Endpoints: `POST /search` (basic depth, 8 results), `POST /extract` (api.tavily.com,
  Bearer header).
- No new commands; no caching (results must stay fresh). Limits: 100 req/min dev tier;
  1 credit/search, 1 credit per 5 extracted URLs.

### Birdeye — per-token on-chain market data (`token`)

- Purpose: deterministic token price/overview/OHLCV/security/holders/trending across Solana +
  major EVM chains. The data surface behind the `token-analyst` playbook.
- Commands: `token price|overview|ohlcv|security|holders|trending` (existing `token search`
  proxy command unchanged).
- Base: `public-api.birdeye.so`, headers `X-API-KEY` + `x-chain` (slugs from ProviderChains).
- Envelope `{success, data}` — `success:false` is treated as failure even on HTTP 200.
- Fallbacks: price → Moralis (EVM `/erc20/{addr}/price`, Solana `/token/mainnet/{addr}/price`);
  overview → CoinGecko onchain; holders on EVM → Moralis `/erc20/{addr}/owners` (Birdeye's
  holder endpoint is Solana-only). OHLCV/security/trending have no fallback.
- Cache: price 60s, overview/ohlcv 5m, security 1h, holders/trending 10m.
- Limits: Standard free tier 1 rps / 30k CU per month — the cache matters.

### Moralis — wallet + token data (fallback and EVM primary)

- Purpose: EVM wallet balances with USD prices (`onchain balances` primary), EVM net worth
  (`onchain net-worth`), BNB-chain transfer history (Alchemy doesn't cover BNB), token price
  and EVM holders fallbacks for `token`.
- Bases: `deep-index.moralis.io/api/v2.2` (EVM), `solana-gateway.moralis.io` (Solana),
  header `X-API-Key`.
- Limits: CU-based (free 40k CU/day, 40 rps burst). Extreme wallets (100k+ token balances,
  e.g. vitalik.eth on mainnet) are refused by the net-worth endpoint provider-side; the error
  surfaces plainly.

### Alchemy — EVM RPC fallback, balances, transfers (`onchain`)

- Purpose: (1) RPC reliability — when `ALCHEMY_API_KEY` is set, every EVM public client uses a
  viem `fallback` transport: Tribes proxy RPC first, Alchemy second; (2) `onchain balances`
  fallback via `alchemy_getTokenBalances` + `alchemy_getTokenMetadata` (no USD prices — left
  null, never fabricated); (3) `onchain transfers` primary via `alchemy_getAssetTransfers`
  (two calls, from+to, merged and direction-labeled).
- Key is a URL path segment (`{net}.g.alchemy.com/v2/{key}`) — never cached in keys, and the
  CLI's last-resort redaction covers RPC errors that echo URLs.
- `alchemy_getAssetTransfers` is not documented on BNB — BNB transfers route to Moralis.
- Limits: 30M CU/month free, 429 with Retry-After honored.

### Helius — Solana RPC + portfolio + enhanced transactions (`onchain`)

- Purpose: (1) Solana `onchain balances` primary via DAS `searchAssets` (fungible, with
  prices); (2) Solana `onchain transfers` via the Enhanced Transactions API (human-readable
  types); (3) Solana RPC endpoint for the harness when no Tribes bearer token exists (a
  tokenless environment would otherwise get a guaranteed-broken proxy URL).
- Auth: `api-key` query param. Limits: free 10 rps RPC / 2 rps DAS+Enhanced, 1M credits/mo.

### Nansen — smart-money flows and wallet PnL (`smart-money`)

- Purpose: deterministic smart-money data feeding alpha-scout-style discovery and wallet
  forensics: netflows, holdings, DEX trades, per-token flow series, wallet PnL summary.
- Commands: `smart-money netflows|holdings|dex-trades|token-flows|wallet-pnl`.
- Base: `api.nansen.ai/api/v1` (POST + JSON body, `apikey` header; the beta API paths are
  legacy and not used).
- Notes: `netflows --timeframe` selects the ranking column (`order_by net_flow_<tf>_usd`) —
  every row still carries all four windows; `token-flows` fetches the whole `--days` window
  page-by-page and reports `granularity` (Nansen returns hourly rows for windows ≤7 days, daily
  beyond); `wallet-pnl` requires a date window (`--days`, default 30), is realized-only
  (`unrealized_pnl_usd` always null), and `win_rate_pct` passes through in the provider's
  undocumented scale.
- Cache: 5–10 min per command; keys include all body filters.
- Limits: free tier 15 rps / 300 rpm + credit-based quotas; plan-gate errors surface plainly.

## Fallback chains at a glance

| Capability               | Order                                                        |
| ------------------------ | ------------------------------------------------------------ |
| Macro snapshot           | Tribes proxy → FRED direct (same schema)                     |
| Web search / extract     | Tribes proxy → Tavily direct (same schema)                   |
| Token price              | Birdeye → Moralis (EVM + Solana)                             |
| Token overview           | Birdeye → CoinGecko onchain                                  |
| Token holders            | Solana: Birdeye; EVM: Moralis                                |
| Wallet balances (EVM)    | Moralis (with USD) → Alchemy (amounts only, usd null)        |
| Wallet balances (Solana) | Helius DAS → Moralis portfolio                               |
| Wallet transfers         | EVM: Alchemy (BNB: Moralis); Solana: Helius                  |
| EVM RPC                  | Tribes proxy RPC → Alchemy (viem fallback transport)         |
| Solana RPC               | Tribes proxy; Helius only when no bearer token is configured |

## Testing

Each service has a vitest suite under `tests/services/` (plus `tests/helpers/` for the shared
machinery) mocking `fetch`: happy-path normalization, provider errors (asserting the key never
appears in messages), unconfigured behavior, fallback routing, and provider-specific quirks
(placeholder strings, string-numbers, hex balances, sparse monthly series). Tests isolate the
file cache via `TRIBES_PROVIDER_CACHE_BASE`.

## Not integrated / intentionally narrow

- Pool/pair/DEX-level data (TVL, pool OHLCV, pair analysis, DEX rankings) and CEX/derivatives
  data (exchange rankings, open interest, funding, public treasuries) have NO structured source:
  the `defi-analyst` and `exchange-analyst` skills that covered them were removed in July 2026
  by owner decision. Questions in those areas route to `research-analyst` / `web-search`.

- Alchemy Prices API and Portfolio API: overlapping coverage already provided by
  CoinGecko/Birdeye/Moralis; Portfolio's 2-address/5-network caps make it a poor fit.
- NewsData.io `/archive`: paid-plan-gated and the harness trades on current news.
- Marketstack commodities/bonds/indices: Professional+ plan-gated with 1 req/min caps;
  commodity context comes from FRED and the commodity-analyst.
- Nansen web-search/profiler perp endpoints: tight rate caps (5–15 req/min) and overlap with
  existing skills.
- Tavily crawl/map: out of scope for the trading loop.
- CoinGecko Demo-key mode: only the Pro base URL is wired (the configured key is a Pro key).
- Solana RPC fallback-on-failure: `@solana/web3.js` `Connection` binds one endpoint at
  construction; Helius is used when no bearer token exists, but mid-call failover was not
  worth wrapping the Connection for.
