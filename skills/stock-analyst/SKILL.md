---
name: stock-analyst
description: >-
  Expert on stock market DATA. Handles: daily OHLCV candles, ticker profiles (name, sector,
  industry, exchange), and company/ticker search. NO live quotes, movers, or market open/closed
  status — the freshest price is the latest daily close from candles; say so plainly. Call for
  any stock/equity data question. NOT for: indicator values, signals, or backtests (use
  technical-analyst); stock news, catalysts, and sentiment (use news); executing stock trades
  (use hyperliquid — stocks are Hyperliquid perps); crypto movers or rankings (use
  market-strategist).
allowed-tools: bash read
---

# Stock Analyst

Backing command group: `tribes-cli stocks` — Marketstack as structured JSON, answering in
seconds. YOU are the analyst: pull the numbers with the subcommands below and do the
interpretation — trend reads, day-move context, comparisons — yourself. There is no backend
specialist behind this skill and no `ask` subcommand.

## When to use

- Daily OHLCV history for a ticker (`candles`), ticker profile (`detail`), resolving a
  company name to a ticker (`search`).
- There is NO top-movers or market open/closed command, and no live quote in this group.
  The freshest figure here is the latest daily close from `candles` — relay it as such,
  never as a live quote. A near-live single-symbol price IS available via
  `tribes-cli asset price --ticker <SYMBOL>` (generic router, see `asset-data`); its
  upstream is rate-limited, and when throttled it falls back to the latest daily close
  marked `stale: true` — relay staleness either way. That is the only extra: for movers or
  market-status questions, still say the data is not available here.
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
3. Candles are daily EOD only (`--interval` supports only `1d`). There is no intraday
   candle data — always state that candle figures are end-of-day closes.
4. Relay exact figures with the timeframe and direction of change, never approximations.
5. For unscoped movers/discovery requests, also run crypto via `market-strategist` and
   commodities via `commodity-analyst` (cross-asset guardrail, see AGENTS.md).
6. Apply the Hyperliquid tradability guardrail before pitching trade ideas: verify with
   `hyperliquid list-assets --all-dexes` and split actionable, watchlist-only, and
   not-tradable markets (see AGENTS.md).
7. If a command reports `MARKETSTACK_API_KEY is not set`, the capability is unavailable on
   this box — report that plainly instead of retrying or working around it.

## Command reference

All under `tribes-cli stocks`; every subcommand accepts `--out <file>`. All read-only.

| Subcommand | Purpose                                          | Required flags | Useful flags                                                                           | Source      |
| ---------- | ------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------- | ----------- |
| `candles`  | Daily OHLCV candles for a symbol                 | `--symbol`     | `--from`/`--to` (YYYY-MM-DD), `--limit` 1-1000 (default 100), `--interval` (only `1d`) | Marketstack |
| `detail`   | Ticker profile: name, sector, industry, exchange | `--symbol`     |                                                                                        | Marketstack |
| `search`   | Resolve company names/symbols to stock tickers   | `--query`      | `--limit` 1-100 (default 20)                                                           | Marketstack |

## Examples

### Latest price check (daily close)

```bash
tribes-cli stocks candles --symbol AAPL --limit 2
```

Relay the latest close, the change vs the prior close, and the date of that close — state
explicitly it is an end-of-day figure, not a live quote. For a near-live figure use
`tribes-cli asset price --ticker AAPL` instead (rate-limited upstream; falls back to the
latest daily close marked `stale: true`).

### Candles over a timeframe

```bash
tribes-cli stocks candles --symbol NVDA --from 2026-06-20 --to 2026-07-21
```

State the trend direction over the range yourself from the OHLCV series.

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

`tribes-cli asset candles --ticker MSFT --out /tmp/msft-candles.json` is the equivalent
generic-router fetch — same candle contract, same downstream `ta` use. For signals, levels,
or backtests on the same file, use `technical-analyst`.

## Error recovery

| Symptom                          | Action                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `MARKETSTACK_API_KEY is not set` | Provider unconfigured on this box — report it; do not retry or work around.  |
| Unknown option error             | Drop the extra flag — see the command reference for each subcommand's flags. |
| Any other API failure            | Retry the same command once; if it fails again, stop and report the error.   |

## Related skills

- `technical-analyst` — indicator computation, signals, and backtests on candle files from here.
- `news` — stock news, catalysts, and sentiment for a ticker.
- `hyperliquid` — discover the hosting dex and execute stock trades as Hyperliquid perps.
- `market-strategist` — crypto movers, rankings, and market-wide aggregates.
- `commodity-analyst` — the commodities pass for unscoped movers/opportunity questions.
