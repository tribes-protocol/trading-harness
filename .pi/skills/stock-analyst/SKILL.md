---
name: stock-analyst
description: >-
  Expert on stock market DATA. Handles: real-time prices, OHLCV candles, ticker snapshots,
  multi-ticker comparisons, company profiles, and ticker search. Call for any stock/equity data
  question. NOT for: indicator values, signals, or backtests (use technical-analyst); stock news
  and sentiment (use news); executing stock trades (use hyperliquid — stocks are Hyperliquid
  perps); crypto movers or rankings (use market-strategist).
allowed-tools: bash read
---

# Stock Analyst

Backing command group: `tribes-cli stock-analyst`. Queries Marketstack for stock market data and
returns JSON.
Requires `MARKETSTACK_API_KEY` in the environment (already set in `.env`).

## When to use

- Price, day range, previous close, or change for one stock, or for many at once.
- OHLCV candles for a ticker over a date range and timeframe.
- Company profile (exchange, sector, industry, identifiers) or ticker lookup by name.
- NOT for indicator values, signals, backtests, or any indicator math — use `technical-analyst`.
- NOT for stock news, catalysts, or sentiment — use `news`.
- NOT for placing or sizing stock trades — use `hyperliquid` (stocks are Hyperliquid perps).
- NOT for crypto movers or market-wide crypto data — use `market-strategist`.

## Hard rules

1. Output is JSON on stdout. Every subcommand also accepts `--out <file>` to write it to a file.
2. These commands answer in seconds; a default bash timeout is enough.
3. Relay exact figures with the timeframe and direction of change, never approximations.
4. `price` is the latest trade or intraday close; `prev_close` is the last settled daily close.
   Outside market hours both can come from the same session, so quote the `as_of` timestamp
   rather than implying the number is live.
5. A `null` field means the provider returned no value — say so; never substitute a guess.
6. For unscoped movers/discovery, also run crypto via `market-strategist` and commodities via
   `commodity-analyst` (AGENTS.md).
7. Apply the Hyperliquid tradability guardrail before pitching trade ideas (see AGENTS.md).

## Command reference

| Subcommand        | Purpose                                                 | Required flags                     | Read-only or signed |
| ----------------- | ------------------------------------------------------- | ---------------------------------- | ------------------- |
| `snapshot`        | Price, day OHLC/volume, prev close, change for 1 ticker | `--ticker`                         | read-only           |
| `market-snapshot` | Price and change for up to 50 tickers at once           | `--tickers`                        | read-only           |
| `candles`         | OHLCV bars over a date range                            | `--ticker --timeframe --from --to` | read-only           |
| `details`         | Company profile and identifiers                         | `--ticker`                         | read-only           |
| `search`          | Find tickers by symbol or company name                  | `--query`                          | read-only           |

Optional flags: `--limit` on `candles` (1-5000, returns the most recent N bars) and on `search`
(1-50, default 10); `--out <file>` on all five.

Timeframes for `candles`: `1m`, `3m`, `5m`, `15m`, `30m`, `1H`, `2H`, `4H`, `6H`, `8H`, `12H`,
`1D`, `3D`, `1W`, `1M` — exactly these spellings, case included (`1m` is one minute, `1M` one
month). Dates are `YYYY-MM-DD`.

## Examples

### Price check

```bash
tribes-cli stock-analyst snapshot --ticker AAPL
```

### Compare several tickers

```bash
tribes-cli stock-analyst market-snapshot --tickers AAPL,MSFT,NVDA
```

### Candles over a timeframe

```bash
tribes-cli stock-analyst candles --ticker NVDA --timeframe 1D --from 2026-06-01 --to 2026-07-01
```

### Latest 10 four-hour bars

```bash
tribes-cli stock-analyst candles --ticker TSLA --timeframe 4H --from 2026-07-01 --to 2026-07-14 --limit 10
```

### Company profile and ticker lookup

```bash
tribes-cli stock-analyst details --ticker MSFT
tribes-cli stock-analyst search --query "apple" --limit 5
```

## Error recovery

| Symptom                           | Action                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `MARKETSTACK_API_KEY is not set`  | The key is missing from the environment. Stop and report; `tribes-cli login` cannot fix it. |
| Any other API failure             | Retry the same command once; if it fails again, stop and report the error.                  |
| Empty `candles` or a `null` price | Widen the date range, or confirm the ticker with `search`; then report the gap plainly.     |

## Related skills

- `technical-analyst` — indicator computation, signals, and backtests across asset classes.
- `news` — stock news, catalysts, and sentiment for a ticker.
- `hyperliquid` — discover the hosting dex and execute stock trades as Hyperliquid perps.
- `market-strategist` — crypto movers, rankings, and market-wide aggregates.
