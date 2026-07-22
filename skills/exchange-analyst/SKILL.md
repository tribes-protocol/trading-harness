---
name: exchange-analyst
description: >-
  Expert on centralized exchanges, derivatives markets, and institutional crypto holdings.
  Handles: exchange rankings and volume trends, individual exchange profiles and tickers,
  derivatives/futures tickers and open interest, derivatives exchange rankings, public
  treasury holdings (which companies hold BTC or ETH and how much), and Hyperliquid order-book
  depth. Call when the EXCHANGE or derivatives market is the subject. NOT for: which exchanges
  list a specific coin (use fundamentals-analyst); what is tradable on Hyperliquid or your own
  positions/orders (use hyperliquid); DEX pools and pairs (use defi-analyst).
allowed-tools: bash read
---

# Exchange Analyst

Backing command group: `tribes-cli exchanges` — CoinGecko-Pro-backed exchange, derivatives, and
treasury data as structured JSON, answering in seconds. Plus `tribes-cli hyperliquid order-book`
for Hyperliquid depth. YOU are the analyst: pull the numbers with the subcommands below and do
the interpretation — venue comparisons, open-interest reads, treasury trends — yourself.

## When to use

- Rank or compare centralized exchanges by trust score or 24h BTC volume (`list`).
- Profile one exchange: trust, volume, top tickers (`detail`), its listed pairs (`tickers`),
  volume trend over time (`volume-chart`).
- Derivatives market context: futures/perp tickers with open interest, volume, and funding
  across venues (`derivatives`).
- Rank derivatives venues by open interest (`derivatives-exchanges`).
- Public treasuries: which companies hold BTC or ETH and their holdings size (`treasury`).
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
4. `treasury` covers `bitcoin` and `ethereum` only, and reports current holdings — it has no
   transaction history.
5. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.

## Command reference

All under `tribes-cli exchanges` unless noted; every subcommand accepts `--out <file>`. All
read-only.

| Subcommand               | Purpose                                                        | Required flags   | Useful flags                         |
| ------------------------ | -------------------------------------------------------------- | ---------------- | ------------------------------------ |
| `list`                   | Ranked exchanges: trust score, trust rank, 24h BTC volume      | none             | `--limit` 1-250 (default 50)         |
| `detail`                 | One exchange: trust, 24h BTC volume, top tickers               | `--id`           |                                      |
| `tickers`                | Tickers on one exchange: pair, USD price/volume, spread, trust | `--id`           | `--limit` 1-100 (default 50)         |
| `volume-chart`           | Exchange BTC volume time series                                | `--id`, `--days` | `--days 1\|7\|14\|30\|90\|180\|365`  |
| `derivatives`            | Derivatives tickers: symbol, price, OI, volume, funding        | none             | `--limit` 1-500 (default 50)         |
| `derivatives-exchanges`  | Derivatives venues ranked by open interest                     | none             | `--limit` 1-250 (default 50)         |
| `treasury`               | Public companies holding BTC or ETH in treasury                | `--coin`         | `--coin bitcoin\|ethereum`           |
| `hyperliquid order-book` | L2 order book snapshot for a perp coin                         | `--coin`         | `--depth` 1-20 (default 10), `--dex` |

## Examples

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
tribes-cli hyperliquid order-book --coin BTC --depth 20
```

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
