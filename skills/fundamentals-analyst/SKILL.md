---
name: fundamentals-analyst
description: >-
  Research-grade profile of ONE listed coin via CoinGecko. Handles: descriptions, links,
  community/developer metrics, historical price/market-cap/volume charts over fixed day windows,
  raw OHLC candles (no indicator math), circulating-supply trends, which exchanges list a coin,
  resolving a contract address to its coin, and BTC-relative fiat/crypto rates. Call for deep
  coin research, historical performance, supply analytics, or listing coverage. NOT for: on-chain
  safety/trade forensics (use token-analyst); indicator math or backtests (use
  technical-analyst); coin discovery (use alpha-scout); quick prices or market-wide rankings (use
  market-strategist).
allowed-tools: bash read
---

# Fundamentals Analyst

Backing command group: `tribes-cli coin` — CoinGecko-backed single-coin deep dives as
structured JSON, answering in seconds. YOU are the analyst: pull the numbers with the
subcommands below and do the interpretation — research narrative, supply reads, listing-quality
judgment — yourself. There is no backend specialist behind this skill and no `ask` subcommand.

## When to use

- Full research profile of one listed coin (`profile`): description, links, community/dev
  metrics, sentiment, ath/atl, supply snapshot.
- Historical price/market-cap/volume series (`chart`) or raw OHLC candles (`ohlc`).
- Circulating-supply trend (`supply`), exchange listings for a coin (`tickers`),
  contract-address resolution (`contract`), BTC-relative fiat/crypto rates (`rates`).
- NOT for on-chain safety, holders, or live trade flow — use `token-analyst`.
- NOT for indicator math or backtests on the candles — use `technical-analyst`.
- NOT for discovering trending or new coins — use `alpha-scout`.
- NOT for market-wide rankings, movers, or quick multi-coin price tables — use `market-strategist`.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. Coin ids are CoinGecko ids (`bitcoin`, not `BTC`) — resolve names/symbols with
   `tribes-cli market search --query "<name>"` first when unsure (the one helper outside this
   group). Resolve a contract address with `coin contract`.
3. `--days` accepts only the fixed windows `1|7|14|30|90|180|365|max` — there are no custom
   from/to dates. For an explicit date range, pull the smallest window that covers it and
   filter the timestamps yourself.
4. `ohlc` returns candles WITHOUT volume — pair it with `chart` when volume matters.
5. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.

## Command reference

All under `tribes-cli coin`; every subcommand accepts `--out <file>`. All read-only.

| Subcommand | Purpose                                                      | Required flags            | Useful flags                             |
| ---------- | ------------------------------------------------------------ | ------------------------- | ---------------------------------------- |
| `profile`  | Fundamentals: rank, price, ath/atl, supply, sentiment, links | `--id`                    |                                          |
| `chart`    | Price, market cap, and volume time series                    | `--id`, `--days`          | `--days 1\|7\|14\|30\|90\|180\|365\|max` |
| `ohlc`     | OHLC candles (no volume on this endpoint)                    | `--id`, `--days`          | same `--days` windows                    |
| `tickers`  | Exchange tickers: market, pair, price, volume, trust score   | `--id`                    | `--limit` 1-100 (default 50)             |
| `contract` | Resolve a contract address to a coin id and core market data | `--platform`, `--address` |                                          |
| `supply`   | Circulating supply time series                               | `--id`, `--days`          | same `--days` windows                    |
| `rates`    | BTC-relative fiat and crypto exchange rates                  | none                      |                                          |

## Examples

### Full coin profile with supply trend

```bash
tribes-cli coin profile --id solana
tribes-cli coin supply --id solana --days 180
```

Synthesize: positioning from rank/mcap/fdv, community and dev health from the follower and
GitHub fields, dilution from the supply series against `total_supply`/`max_supply` in the profile.

### Historical chart with raw candles

```bash
tribes-cli coin chart --id ethereum --days 90
tribes-cli coin ohlc --id ethereum --days 30
```

### Listing coverage and rates

```bash
tribes-cli coin tickers --id chainlink --limit 100
tribes-cli coin rates
```

### Resolve an unknown coin first

```bash
tribes-cli market search --query "render"
tribes-cli coin contract --platform ethereum --address 0x6982508145454ce325ddbe47a25d4ec3d2311933
```

## Error recovery

| Symptom               | Action                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------- |
| Key-not-set error     | Provider unconfigured on this box — report it; do not retry or work around.            |
| Unknown option error  | Drop the extra flag — see the command reference for each subcommand's flags.           |
| Coin id not found     | Re-resolve with `tribes-cli market search` (or `coin contract` for an address), retry. |
| Any other API failure | Retry the same command once; if it fails again, stop and report the error.             |

## Related skills

- `token-analyst` — on-chain deep dive: security, holders, live trades, token flow.
- `technical-analyst` — indicator computation and backtests on candles.
- `alpha-scout` — discovery before a specific coin is chosen.
- `market-strategist` — market-wide caps, rankings, movers; also owns `market search`.
