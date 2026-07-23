---
name: stock-analyst
description: >-
  Expert on stock market DATA. Handles: live snapshot quotes (price, change, day range, volume,
  market cap), daily OHLCV candles, ticker profiles (name, sector, industry, exchange),
  company/ticker search, US market open/closed status, and top gaining/losing US stocks. Call
  for any stock/equity data question. NOT for: indicator values,
  signals, or backtests (use technical-analyst); stock news, catalysts, and sentiment (use
  news); executing stock trades (use hyperliquid — stocks are Hyperliquid perps); crypto movers
  or rankings (use market-strategist).
allowed-tools: bash read
---

# Stock Analyst

Backing command group: `tribes-cli stocks` — Marketstack, Massive, and the Tribes stocks proxy
as structured JSON, answering in seconds. YOU are the analyst: pull the numbers with the
subcommands below and do the interpretation — trend reads, day-move context, comparisons —
yourself. There is no backend specialist behind this skill and no `ask` subcommand.

## When to use

- Live snapshot quote for a ticker (`quote`), daily OHLCV history (`candles`), ticker
  profile (`detail`), resolving a company name to a ticker (`search`).
- Is the US market open right now (`market-status`); top gaining/losing US stocks (`movers`).
- NOT for indicator values, signals, backtests, or any indicator math — use
  `technical-analyst`: run `stocks candles --out <file>` here, then feed the file to
  `tribes-cli ta`.
- NOT for stock news, catalysts, or sentiment — use `news`.
- NOT for placing or sizing stock trades — use `hyperliquid` (stocks are Hyperliquid perps).
- NOT for crypto movers or market-wide crypto data — use `market-strategist`.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. Symbols are stock tickers (`AAPL`, not "Apple") — resolve company names with
   `stocks search` first when unsure.
3. Candles are daily EOD only (`--interval` supports only `1d`). For intraday questions use
   `quote` and say the granularity you actually have.
4. Relay exact figures with the timeframe and direction of change, never approximations.
5. For unscoped movers/discovery requests, also run crypto via `market-strategist` and
   commodities via `commodity-analyst` (cross-asset guardrail, see AGENTS.md).
6. Apply the Hyperliquid tradability guardrail before pitching trade ideas: verify with
   `hyperliquid list-assets --all-dexes` and split actionable, watchlist-only, and
   not-tradable markets (see AGENTS.md).
7. If a command reports `MARKETSTACK_API_KEY is not set` (or `MASSIVE_API_KEY is not set` for
   `market-status`/`movers`), the capability is unavailable on this box — report that plainly
   instead of retrying or working around it.

## Command reference

All under `tribes-cli stocks`; every subcommand accepts `--out <file>`. All read-only.

| Subcommand      | Purpose                                                        | Required flags | Useful flags                                                                                  | Source              |
| --------------- | -------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- | ------------------- |
| `candles`       | Daily OHLCV candles for a symbol                               | `--symbol`     | `--from`/`--to` (YYYY-MM-DD), `--limit` 1-1000 (default 100), `--interval` (only `1d`)        | Marketstack         |
| `detail`        | Ticker profile: name, sector, industry, exchange               | `--symbol`     |                                                                                               | Marketstack         |
| `search`        | Resolve company names/symbols to stock tickers                 | `--query`      | `--limit` 1-100 (default 20)                                                                  | Marketstack         |
| `quote`         | Live snapshot: price, change, day range, volume, market cap    | `--symbol`     |                                                                                               | Tribes stocks proxy |
| `market-status` | US market state: open/closed plus early- and after-hours flags | none           |                                                                                               | Massive             |
| `movers`        | Top gaining/losing US stocks: price, change, change %, volume  | none           | `--direction gainers\|losers\|both` (default both), `--limit` 1-50 per direction (default 10) | Massive             |

## Examples

### Price and day-move check

```bash
tribes-cli stocks quote --symbol AAPL
```

Relay price, change and change %, day range, volume, and market cap with direction.

### Candles over a timeframe

```bash
tribes-cli stocks candles --symbol NVDA --from 2026-06-20 --to 2026-07-21
```

State the trend direction over the range yourself from the OHLCV series.

### Market open check and top movers

```bash
tribes-cli stocks market-status
tribes-cli stocks movers --direction both --limit 10
```

State whether the session is regular, early, or after hours; report gainers and losers with
change % and volume.

### Resolve a company name, then profile it

```bash
tribes-cli stocks search --query "palantir"
tribes-cli stocks detail --symbol PLTR
```

### Chain candles into TA indicators

```bash
tribes-cli stocks candles --symbol MSFT --limit 200 --out /tmp/msft-candles.json
tribes-cli ta indicators --candles-file /tmp/msft-candles.json --set rsi,macd,ema
```

For signals, levels, or backtests on the same file, use `technical-analyst`.

## Error recovery

| Symptom                              | Action                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `MARKETSTACK_API_KEY is not set`     | Provider unconfigured on this box — report it; do not retry or work around.    |
| `MASSIVE_API_KEY is not set`         | Same — `market-status` and `movers` are unavailable on this box; report it.    |
| Auth error on `quote` (stocks proxy) | Run `tribes-cli login`, retry the original command once, then stop and report. |
| Unknown option error                 | Drop the extra flag — see the command reference for each subcommand's flags.   |
| Any other API failure                | Retry the same command once; if it fails again, stop and report the error.     |

## Related skills

- `technical-analyst` — indicator computation, signals, and backtests on candle files from here.
- `news` — stock news, catalysts, and sentiment for a ticker.
- `hyperliquid` — discover the hosting dex and execute stock trades as Hyperliquid perps.
- `market-strategist` — crypto movers, rankings, and market-wide aggregates.
- `commodity-analyst` — the commodities pass for unscoped movers/opportunity questions.
