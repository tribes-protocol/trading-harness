---
name: exchange-analyst
description: >-
  Expert on centralized exchanges, derivatives markets, and institutional crypto holdings.
  Handles: exchange rankings and volume trends, individual exchange profiles and tickers,
  derivatives/futures tickers and open interest, derivatives exchange rankings, perp funding-rate
  history, long/short ratio, liquidation clusters and large liquidation prints, options market
  data, spot-ETF net flows, public treasury holdings (which companies hold BTC or ETH and how
  much), and Hyperliquid order-book depth. Call when the EXCHANGE or derivatives market is the subject. NOT for: which exchanges
  list a specific coin (use fundamentals-analyst); what is tradable on Hyperliquid or your own
  positions/orders (use hyperliquid); DEX pools and pairs (use defi-analyst).
allowed-tools: bash read
---

# Exchange Analyst

Backing command groups: `tribes-cli exchanges` — CoinGecko-Pro-backed exchange, derivatives, and
treasury data as structured JSON, answering in seconds. Plus `tribes-cli surf` for the
derivatives internals CoinGecko does not carry (funding history, liquidations, options, ETF
flows), and `tribes-cli hyperliquid order-book` for Hyperliquid depth. YOU are the analyst: pull the numbers with the subcommands below and do
the interpretation — venue comparisons, open-interest reads, treasury trends — yourself.

## When to use

- Rank or compare centralized exchanges by trust score or 24h BTC volume (`list`).
- Profile one exchange: trust, volume, top tickers (`detail`), its listed pairs (`tickers`),
  volume trend over time (`volume-chart`).
- Derivatives market context: futures/perp tickers with open interest, volume, and funding
  across venues (`derivatives`).
- Rank derivatives venues by open interest (`derivatives-exchanges`).
- Funding-rate HISTORY for one perp, or the long/short account ratio over time
  (`surf funding-history`, `surf long-short`) — `exchanges derivatives` gives one live snapshot
  across venues; these give the time series for a single market.
- Where the stops are: liquidation volume over time, totals ranked by venue, and individual
  large prints (`surf liquidations`, `surf liquidation-venues`, `surf liquidation-orders`).
- Options market data for a volatility read (`surf options`).
- Spot-ETF net flows — the TradFi bid, invisible to every on-chain source (`surf etf-flows`).
- Public treasuries: which companies hold BTC or ETH and their holdings size (`treasury`);
  per-entity holdings, buy/sell history, and holdings-over-time (`treasury-entities`,
  `treasury-entity`, `treasury-history`, `treasury-chart`).
- Hyperliquid L2 depth for a perp coin (`hyperliquid order-book`).
- NOT for which exchanges list a specific coin (coin is the subject) — use `fundamentals-analyst`.
- NOT for tradable Hyperliquid markets or your own positions/orders/balances — use `hyperliquid`.
- NOT for DEX pools, pairs, or on-chain liquidity — use `defi-analyst`.
- NOT for placing or canceling orders — use `hyperliquid` or `trade-execution`.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. Exchange ids are CoinGecko exchange ids (`binance`, not "Binance") — resolve unknown venues
   from the `list` output first.
3. Findings here are research only — verify Hyperliquid tradability via the `hyperliquid` skill
   (`hyperliquid list-assets --all-dexes`) before presenting any asset as an actionable trade
   idea, and split actionable, watchlist-only, and not-tradable markets (see AGENTS.md).
4. `treasury` covers `bitcoin` and `ethereum` only and reports current holdings. For per-entity
   depth, resolve the entity id from `treasury-entities` first, then use `treasury-entity`
   (current holdings), `treasury-history` (buy/sell transactions), or `treasury-chart`
   (holdings over time).
5. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.
6. `surf` takes a PAIR, not a ticker: `--pair BTC/USDT`, or `BTC/USDC:USDC` for Hyperliquid's
   USDC-settled perps. A bare `BTC` is accepted and returns nothing.
7. `surf` exchange names are case-sensitive and the casing DIFFERS by subcommand:
   `funding-history` and `long-short` take lowercase (`binance`); the liquidation subcommands
   take title case (`Binance`). Using the wrong case fails locally with a clear error.
8. A `surf` 402 does NOT mean the balance is spent — it means the request reached SurfAI without
   a key. Report it as a provider misconfiguration, not as a quota problem.

## Command reference

All under `tribes-cli exchanges` unless noted; every subcommand accepts `--out <file>`. All
read-only.

| Subcommand               | Purpose                                                              | Required flags       | Useful flags                                             |
| ------------------------ | -------------------------------------------------------------------- | -------------------- | -------------------------------------------------------- |
| `list`                   | Ranked exchanges: trust score, trust rank, 24h BTC volume            | none                 | `--limit` 1-250 (default 50)                             |
| `detail`                 | One exchange: trust, 24h BTC volume, top tickers                     | `--id`               |                                                          |
| `tickers`                | Tickers on one exchange: pair, USD price/volume, spread, trust       | `--id`               | `--limit` 1-100 (default 50)                             |
| `volume-chart`           | Exchange BTC volume time series                                      | `--id`, `--days`     | `--days 1\|7\|14\|30\|90\|180\|365`                      |
| `derivatives`            | Derivatives tickers: symbol, price, OI, volume, funding              | none                 | `--limit` 1-500 (default 50)                             |
| `derivatives-exchanges`  | Derivatives venues ranked by open interest                           | none                 | `--limit` 1-250 (default 50)                             |
| `treasury`               | Public companies holding BTC or ETH in treasury                      | `--coin`             | `--coin bitcoin\|ethereum`                               |
| `treasury-entities`      | Companies and governments that publicly hold crypto, with entity ids | none                 | `--limit` 1-250 (default 50)                             |
| `treasury-entity`        | Treasury holdings of one entity, optionally narrowed to one coin     | `--entity`           | `--coin` (CoinGecko id, e.g. bitcoin)                    |
| `treasury-chart`         | Holdings of one coin by one entity over time (t in epoch ms)         | `--entity`, `--coin` | `--days 7\|14\|30\|90\|180\|365\|730\|max` (default 365) |
| `treasury-history`       | Buy/sell transaction history of one treasury entity                  | `--entity`           | `--limit` 1-250 (default 50)                             |
| `hyperliquid order-book` | L2 order book snapshot for a perp coin                               | `--coin`             | `--depth` 1-20 (default 10), `--dex`                     |

### `tribes-cli surf` — derivatives internals

All read-only; every subcommand accepts `--out <file>`.

| Subcommand           | Purpose                                                       | Required flags | Useful flags                                                         |
| -------------------- | ------------------------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| `funding-history`    | Funding-rate history for one perp on one venue                | `--pair`       | `--exchange` (lowercase), `--from`, `--limit`                        |
| `long-short`         | Long/short account ratio over time                            | `--pair`       | `--interval 1h\|4h\|1d`, `--exchange`, `--from`, `--limit`           |
| `liquidations`       | Aggregated liquidation volume over time                       | `--symbol`     | `--interval`, `--exchange` (title case), `--limit`, `--from`, `--to` |
| `liquidation-venues` | Liquidation totals ranked across venues (snapshot, no series) | none           | `--symbol`, `--time-range 1h\|4h\|12h\|24h`, `--sort-by`, `--order`  |
| `liquidation-orders` | Individual liquidation prints above a USD threshold           | none           | `--symbol`, `--exchange`, `--min-amount`, `--side`, `--limit`        |
| `options`            | Options market data for one symbol                            | `--symbol`     | `--sort-by open_interest\|volume_24h`, `--order`                     |
| `etf-flows`          | Spot-ETF net flow history                                     | `--symbol`     | `--sort-by flow_usd\|timestamp`, `--order`, `--from`, `--to`         |

## Examples

### Funding, positioning, and where the stops are

```bash
tribes-cli surf funding-history --pair BTC/USDT --exchange binance --limit 100
tribes-cli surf long-short --pair BTC/USDT --interval 4h
tribes-cli surf liquidations --symbol BTC --interval 1h --limit 168
tribes-cli surf liquidation-venues --symbol BTC --time-range 24h
tribes-cli surf liquidation-orders --symbol BTC --min-amount 100000 --limit 20
```

Read them together, not separately: persistently positive funding plus a crowded long/short
ratio plus a dense band of long liquidations just below spot is a squeeze setup, and no one of
those three says so on its own.

### Volatility and the TradFi bid

```bash
tribes-cli surf options --symbol BTC --sort-by open_interest
tribes-cli surf etf-flows --symbol BTC --sort-by timestamp --order desc
```

Options open interest gives the strikes the market is defending; ETF flows give the direction of
the spot bid that on-chain data cannot see at all.

### Rank and profile centralized exchanges

```bash
tribes-cli exchanges list --limit 10
tribes-cli exchanges detail --id binance
tribes-cli exchanges tickers --id binance --limit 50
tribes-cli exchanges volume-chart --id binance --days 30
```

Synthesize: trust and volume ranking from `list`, venue depth and pair quality from `detail`
and `tickers`, volume trend from `volume-chart`.

### Derivatives open interest and funding across venues

```bash
tribes-cli exchanges derivatives --limit 200
tribes-cli exchanges derivatives-exchanges --limit 20
```

Filter the `derivatives` tickers yourself by symbol (for example BTC perps) to compare open
interest and funding across Binance, Bybit, OKX, and the rest.

### Treasury holdings and Hyperliquid depth

```bash
tribes-cli exchanges treasury --coin bitcoin
tribes-cli exchanges treasury-entities --limit 50
tribes-cli exchanges treasury-chart --entity <entity-id> --coin bitcoin --days 365
tribes-cli exchanges treasury-history --entity <entity-id> --limit 50
tribes-cli hyperliquid order-book --coin BTC --depth 20
```

Resolve the entity id from `treasury-entities`, then read accumulation or distribution from
`treasury-chart` and the individual buys/sells from `treasury-history`.

## Error recovery

| Symptom               | Action                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| Key-not-set error     | Provider unconfigured on this box — report it; do not retry or work around.  |
| Unknown option error  | Drop the extra flag — see the command reference for each subcommand's flags. |
| Unknown exchange id   | Run `exchanges list` and match the venue name to its CoinGecko id.           |
| Any other API failure | Retry the same command once; if it fails again, stop and report the error.   |

## Related skills

- `fundamentals-analyst` — which exchanges list a specific coin (coin is the subject).
- `hyperliquid` — tradable Hyperliquid markets, your own positions, orders, and balances.
- `defi-analyst` — DEX pools, pairs, TVL, and on-chain liquidity.
- `market-strategist` — market-wide caps, dominance, rankings, and movers.
- `position-management` — placing stops against the liquidation clusters found here.
