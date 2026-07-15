# Inlined provider APIs

**Direct provider calls are the default data path for the analyst skills.** The backend
specialist proxy (`tribes-cli <analyst> ask`, proxied to `/agent/lucy/*`) is being retired, so
each analyst skill now hits its third-party providers directly. This document is the shared
catalog of those providers: base URLs, auth, `.env` key names, and the endpoints behind each
analyst's functionality.

Every call authenticates with a key from the environment — **never hardcode a key in a command,
skill, or committed file.** See `.env.example` for the full key list.

## Where the keys live

Each provider key is a first-class constant in `src/common/Env.ts` (e.g. `BIRDEYE_API_KEY`), read
from `process.env.*` and loaded from `.env`. The skills reference the matching **environment
variable** directly in their calls (`$BIRDEYE_API_KEY`, `$FRED_API_KEY`, …) rather than parsing
the file.

```bash
# Load .env into the shell environment once (populates $BIRDEYE_API_KEY, $FRED_API_KEY, ...),
# then reference the variables directly. `set -a` marks the sourced vars for export.
set -a; . ./.env; set +a
curl -s 'https://public-api.birdeye.so/defi/token_trending' -H "X-API-KEY: $BIRDEYE_API_KEY"
```

The env-var names match the `Env.ts` constant names exactly: `BIRDEYE_API_KEY`, `NANSEN_API_KEY`,
`COIN_GECKO_PRO_API_KEY`, `FRED_API_KEY`, `NEWSDATAIO_API_KEY`, `MORALIS_API_KEY`,
`ALCHEMY_API_KEY`, `HELIUS_API_KEY`, `MARKETSTACK_API_KEY`. Keep values in the shell only; never
echo a key.

## Provider quick reference

| Provider          | `.env` key              | Base URL                          | Auth                                   |
| ----------------- | ----------------------- | --------------------------------- | -------------------------------------- |
| BirdEye           | `BIRDEYE_API_KEY`       | `https://public-api.birdeye.so`   | header `X-API-KEY` (+ `x-chain`)       |
| Nansen            | `NANSEN_API_KEY`        | `https://api.nansen.ai`           | header `apiKey` (POST JSON)            |
| CoinGecko Pro     | `COIN_GECKO_PRO_API_KEY`| `https://pro-api.coingecko.com`   | header `x-cg-pro-api-key`              |
| FRED              | `FRED_API_KEY`          | `https://api.stlouisfed.org`      | query `api_key` (+ `file_type=json`)   |
| NewsData.io       | `NEWSDATAIO_API_KEY`    | `https://newsdata.io`             | query `apikey`                         |
| Moralis           | `MORALIS_API_KEY`       | `https://deep-index.moralis.io`   | header `X-API-Key`                     |
| Alchemy (EVM RPC) | `ALCHEMY_API_KEY`       | `https://<net>-mainnet.g.alchemy.com/v2/<key>` | key in URL path           |
| Helius (SOL RPC)  | `HELIUS_API_KEY`        | `https://mainnet.helius-rpc.com/?api-key=<key>`| key in query              |
| Marketstack       | `MARKETSTACK_API_KEY`   | `https://api.marketstack.com`     | query `access_key`                     |

### Which analyst uses which provider

| Analyst skill          | Providers                                          |
| ---------------------- | -------------------------------------------------- |
| `token-analyst`        | BirdEye, Nansen (+ Moralis metadata, Alchemy/Helius RPC) |
| `alpha-scout`          | BirdEye (trending/new/smart-money list), Nansen (smart-money) |
| `defi-analyst`         | CoinGecko onchain (GeckoTerminal), BirdEye (pairs) |
| `exchange-analyst`     | CoinGecko (exchanges, derivatives, public treasury) |
| `fundamentals-analyst` | CoinGecko                                          |
| `market-strategist`    | CoinGecko                                          |
| `wallet-analyst`       | BirdEye (wallet), Nansen (profiler), Alchemy/Helius RPC |
| `technical-analyst`    | OHLCV from BirdEye / CoinGecko, then indicator math |
| `macros`               | FRED                                               |
| `news`                 | NewsData.io                                        |
| `stock-analyst`        | Marketstack                                        |

---

## BirdEye — `https://public-api.birdeye.so`

Auth header on every request: `X-API-KEY: $BIRDEYE_API_KEY`. Chain-scoped endpoints also need
`x-chain: <network>`. Pass `accept: application/json`. Most list endpoints take
`ui_amount_mode=raw`.

**`x-chain` values** (numeric chain id → BirdEye network): `1 → ethereum`, `10 → optimism`,
`56 → bsc`, `137 → polygon`, `8453 → base`, `42161 → arbitrum`, and `solana → solana`.

### Token endpoints (token-analyst)

| Purpose                    | Method + path                               | Key query params                         |
| -------------------------- | ------------------------------------------- | ---------------------------------------- |
| Price (batch)              | `GET /defi/multi_price`                     | `list_address`                           |
| Overview (vol/liq)         | `GET /defi/token_overview`                  | `address`, `frames`                      |
| Metadata (batch)           | `GET /defi/v3/token/meta-data/multiple`     | `list_address`                           |
| Market data (batch)        | `GET /defi/v3/token/market-data/multiple`   | `list_address`                           |
| Security / rug flags       | `GET /defi/token_security`                  | `address`                                |
| Creation info              | `GET /defi/token_creation_info`             | `address`                                |
| Recent trades              | `GET /defi/v3/token/txs`                    | `address`, `sort_by=block_unix_time`     |
| Trades by volume (whales)  | `GET /defi/v3/token/txs-by-volume`          | `token_address`, `volume_type`           |
| All trades (cross-market)  | `GET /defi/v3/txs`                          | `sort_by`, `sort_type`, `owner`/`pool_id`|
| Trades seek by time        | `GET /defi/txs/token/seek_by_time`          | `address`, `before_time`/`after_time`    |
| All-time trade stats       | `GET /defi/v3/all-time/trades/single`       | `address`, `time_frame`                  |
| Mint/burn txs              | `GET /defi/v3/token/mint-burn-txs`          | `address`, `type`                        |
| Exit-liquidity (batch)     | `GET /defi/v3/token/exit-liquidity/multiple`| `list_address`                           |
| Historical price (range)   | `GET /defi/history_price`                   | `address`, `type`, `time_from`,`time_to` |
| Historical price @ unix    | `GET /defi/historical_price_unix`           | `address`, `unixtime`                    |
| Holder distribution        | `GET /holder/v1/distribution`               | `token_address`, `top_n`, `mode`         |
| Holder batch check         | `POST /token/v1/holder/batch`               | body `{token_address, wallets[]}`        |
| Transfer list / total      | `POST /token/v1/transfer` · `/transfer/total`| body per BirdEye transfer schema        |
| Price stats (batch)        | `POST /defi/v3/price/stats/multiple`        | body `{list_address}`, `list_timeframe`  |
| OHLCV                      | `GET /defi/ohlcv`                           | `address`, `type`, `time_from`,`time_to` |

### Discovery endpoints (alpha-scout)

| Purpose                  | Method + path                     | Key query params                    |
| ------------------------ | --------------------------------- | ----------------------------------- |
| Trending tokens          | `GET /defi/token_trending`        | `sort_type`, `offset`, `limit`      |
| New listings             | `GET /defi/v2/tokens/new_listing` | `time_to`, `limit`                  |
| Smart-money token list   | `GET /smart-money/v1/token/list`  | `interval`, `trader_style`, `sort_by`|
| Search (name→address)    | `GET /defi/v3/search`             | `keyword`, `target`, `search_mode`  |

### Pair / pool endpoints (defi-analyst)

`GET /defi/v3/pair/overview/multiple` (`list_address`) · `GET /defi/ohlcv/pair` &
`/defi/ohlcv/base_quote` · `GET /defi/txs/pair` & `/defi/txs/pair/seek_by_time`.

### Wallet endpoints (wallet-analyst)

`GET /wallet/v2/current-net-worth`, `/wallet/v2/net-worth`, `/wallet/v2/net-worth-details`,
`/wallet/v2/pnl`, `/wallet/v2/pnl/summary`, `/wallet/v2/balance-change`, `/v1/wallet/token_list`,
`/v1/wallet/tx_list`, `/v1/wallet/token_balance`; `POST /wallet/v2/transfer`,
`/wallet/v2/transfer/total`, `/wallet/v2/token-balance`.

**Worked example** (security audit for PEPE on Ethereum):

```bash
curl -s 'https://public-api.birdeye.so/defi/token_security?address=0x6982508145454ce325ddbe47a25d4ec3d2311933' \
  -H "X-API-KEY: $BIRDEYE_API_KEY" -H 'x-chain: ethereum' -H 'accept: application/json'
```

---

## Nansen — `https://api.nansen.ai`

All endpoints are `POST` with a JSON body. Headers: `apiKey: $NANSEN_API_KEY`,
`content-type: application/json`, `accept: application/json`.

### Smart money (alpha-scout)

`POST /api/v1/smart-money/netflow` · `/holdings` · `/historical-holdings` · `/dex-trades` ·
`/perp-trades` · `/dcas`.

### TokenGodMode — one token (token-analyst)

`POST /api/v1/tgm/token-information` · `/indicators` · `/holders` · `/flows` ·
`/flow-intelligence` · `/who-bought-sold` · `/dex-trades` · `/transfers` · `/pnl-leaderboard`;
plus `POST /api/v1/token-screener` and `/api/v1/perp-screener`.

### Profiler — one address (wallet-analyst)

`POST /api/v1/profiler/address/current-balance` · `/historical-balances` · `/transactions` ·
`/counterparties` · `/related-wallets` · `/pnl` · `/pnl-summary` · `/labels` · `/premium-labels`;
plus `/api/v1/search/entity-name`, `/api/v1/search/general`, `/api/v1/perp-leaderboard`,
`/api/v1/portfolio/defi-holdings`.

**Worked example** (smart-money netflow):

```bash
curl -s -X POST 'https://api.nansen.ai/api/v1/smart-money/netflow' \
  -H "apiKey: $NANSEN_API_KEY" -H 'content-type: application/json' -H 'accept: application/json' \
  -d '{"parameters":{"chains":["ethereum"],"timeframe":"1d"}}'
```

> Request bodies vary per endpoint. When a body shape is unknown, prefer the backend
> `tribes-cli <analyst> ask` path, which builds the correct payload.

---

## CoinGecko Pro — `https://pro-api.coingecko.com`

Header on every request: `x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY`. All paths below are under
`/api/v3`.

### Coin fundamentals (fundamentals-analyst)

`/coins/{id}` · `/coins/{id}/history` · `/coins/{id}/tickers` · `/coins/{id}/market_chart[/range]`
· `/coins/{id}/ohlc[/range]` · `/coins/{id}/circulating_supply_chart[/range]` ·
`/coins/{id}/total_supply_chart[/range]` · `/coins/{network}/contract/{address}` (+ `/market_chart`)
· `/simple/token_price/{platform}` · `/simple/supported_vs_currencies` · `/exchange_rates`.

### Market-wide aggregates (market-strategist)

`/global` · `/global/decentralized_finance_defi` · `/global/market_cap_chart` · `/coins/markets`
· `/coins/top_gainers_losers` · `/coins/categories[/list]` · `/coins/list[/new]` · `/simple/price`
· `/asset_platforms` · `/token_lists/{platform}/all.json` · `/search` · `/search/trending`.

### Exchanges, derivatives, treasury (exchange-analyst)

`/exchanges[/list]` · `/exchanges/{id}[/tickers]` · `/exchanges/{id}/volume_chart[/range]` ·
`/derivatives` · `/derivatives/exchanges[/list]` · `/derivatives/exchanges/{id}` ·
`/entities/list` · `/public_treasury/{entity}` · `/public_treasury/{entity}/{coin}/holding_chart`
· `/{entity}/public_treasury/{coin}` · `/public_treasury/{entity}/transaction_history`.

### On-chain pools = GeckoTerminal (defi-analyst)

All under `/api/v3/onchain`: `/networks[/{network}/dexes]` · `/networks/{network}/pools` ·
`/networks/{network}/new_pools` · `/networks/trending_pools` · `/networks/{network}/trending_pools`
· `/networks/{network}/dexes/{dex}/pools` · `/pools/megafilter` (filter by `fdv_usd_min/max`,
`reserve_in_usd_min/max`, `h24_volume_usd_min/max`) · `/search/pools` · `/pools/trending_search`
· `/categories[/{id}/pools]` · `/networks/{network}/pools/{addr}` (+ `/ohlcv/{timeframe}`,
`/trades`, `/info`) · `/networks/{network}/tokens/{addr}` (+ `/pools`, `/ohlcv/{tf}`, `/trades`,
`/top_holders`, `/top_traders`, `/holders_chart`, `/info`).

**Worked example** (global market cap + BTC dominance):

```bash
curl -s 'https://pro-api.coingecko.com/api/v3/global' \
  -H "x-cg-pro-api-key: $COIN_GECKO_PRO_API_KEY" -H 'accept: application/json'
```

---

## FRED — `https://api.stlouisfed.org` (macros)

`GET /fred/series/observations` with query `series_id`, `api_key=$FRED_API_KEY`,
`file_type=json`, `sort_order=desc`, `limit=<n>`. Send `User-Agent: tribes-terminal-api/1.0`.
A value of `.` means "no observation" — skip it.

Series behind the macro snapshot (`limit` in parentheses):

| FRED series id     | Snapshot slot        | Unit                                   |
| ------------------ | -------------------- | -------------------------------------- |
| `DTWEXBGS` (4)     | `dxy`                | broad dollar index level               |
| `DGS10` (4)        | `yields.us10y`       | percent                                |
| `DGS2` (4)         | `yields.us2y`        | percent                                |
| `T10Y2Y` (4)       | `yields.curve_2s10s` | percentage points (negative=inverted)  |
| `VIXCLS` (4)       | `vix`                | index level                            |
| `DFF` (4)          | `fed_funds`          | percent                                |
| `CPIAUCSL` (14)    | `cpi`                | index level; YoY from 13 months back   |
| `UNRATE` (4)       | `unemployment`       | percent                                |
| `GOLDAMGBD228NLBM` (4) | `gold`           | USD per troy ounce (optional series)   |
| `DCOILBRENTEU` (4) | `brent`              | USD per barrel                         |

`curve_2s10s` falls back to `us10y - us2y` if `T10Y2Y` is missing. `cpi.yoy_pct` compares the
latest CPI to the observation ~12 months earlier (hence `limit=14`).

**Worked example** (10-year Treasury yield, latest 4 points):

```bash
curl -s "https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=$FRED_API_KEY&file_type=json&sort_order=desc&limit=4" \
  -H 'User-Agent: tribes-terminal-api/1.0'
```

---

## NewsData.io — `https://newsdata.io` (news)

`GET` with query `apikey=$NEWSDATAIO_API_KEY`, `qInTitle=<terms>`, `removeduplicate=1`, optional
`language=en`. Endpoints: `/api/1/crypto` (crypto news), `/api/1/latest` (latest), `/api/1/market`
(market news).

```bash
curl -s "https://newsdata.io/api/1/crypto?apikey=$NEWSDATAIO_API_KEY&qInTitle=bitcoin&removeduplicate=1"
```

---

## Moralis — `https://deep-index.moralis.io`

Header: `X-API-Key: $MORALIS_API_KEY`. Used for ERC-20 token metadata and price.

- Token price: `GET /api/v2.2/erc20/{address}/price?chain=base`
- Token metadata: `GET /api/v2.2/erc20/metadata?chain=<hex chainId>&addresses=<address>`
  (`chain` is a hex chain id, e.g. `0x1` for Ethereum, `0x2105` for Base).

```bash
curl -s 'https://deep-index.moralis.io/api/v2.2/erc20/metadata?chain=0x1&addresses=0x6982508145454ce325ddbe47a25d4ec3d2311933' \
  -H "X-API-Key: $MORALIS_API_KEY"
```

---

## Alchemy — EVM JSON-RPC (native / ERC-20 balances)

Per-network base URL with the key in the path:
`https://<network>-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY`. Networks used by the harness:
`eth`, `base`, `bnb`, `arb`, `avax`, `opt`, `polygon`, `unichain`, `sonic`.

Standard JSON-RPC — e.g. native balance with `eth_getBalance`, or ERC-20 balance via
`eth_call` of `balanceOf(address)`:

```bash
curl -s "https://eth-mainnet.g.alchemy.com/v2/$ALCHEMY_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getBalance","params":["0x0000000000000000000000000000000000000000","latest"]}'
```

---

## Helius — Solana JSON-RPC (SOL / SPL balances)

Base URL with the key as a query param: `https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY`.
Standard Solana JSON-RPC (`getBalance`, `getTokenAccountsByOwner`, etc.):

```bash
curl -s "https://mainnet.helius-rpc.com/?api-key=$HELIUS_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["So11111111111111111111111111111111111111112"]}'
```

---

## Marketstack — `https://api.marketstack.com` (stock-analyst)

`GET` with query `access_key=$MARKETSTACK_API_KEY`. Endpoints:

- Ticker search: `/v2/tickerslist?search=<name>` · ticker details: `/v2/tickers/{ticker}`.
- Quote / price: `/v2/stockprice?ticker=<TICKER>` · latest EOD: `/v2/eod/latest?symbols=<TICKER>`
  · latest intraday: `/v2/intraday/latest?symbols=<TICKER>`.
- Candles: EOD `/v2/eod?symbols=&date_from=&date_to=&sort=DESC&limit=`; intraday
  `/v2/intraday?symbols=&interval=<1min|5min|15min|1hour>&date_from=&date_to=`.

Marketstack does not expose market-wide movers, market open/closed status, or NBBO — those need a
Massive/Polygon key (`MASSIVE_API_KEY`, not configured here). State the gap if asked for them.

```bash
curl -s "https://api.marketstack.com/v2/stockprice?access_key=$MARKETSTACK_API_KEY&ticker=AAPL"
```

## Notes and guardrails

- **Direct API is the default.** The old `tribes-cli <analyst> ask` backend proxy is deprecated
  and being retired; do not rely on it. Pull data from the providers directly and do the
  multi-step reasoning (disambiguation, cross-checks, synthesis) in the skill itself.
- **Keys stay in `.env`.** Read them with the `grep | cut` one-liner. Never paste a key into a
  command literal, a skill file, or any committed file.
- **Rate limits & errors.** On non-auth failure, retry once, then stop and report (per AGENTS.md).
- **Rendering.** Still render token/pool/perp addresses as tribes.xyz Markdown links (AGENTS.md).
