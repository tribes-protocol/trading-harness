---
name: stock-analyst
description: >-
  Expert on stock market DATA. Handles: real-time prices, NBBO quotes, OHLCV candles, ticker
  snapshots, stock movers, and market status. Call for any stock/equity data question. NOT for:
  indicator values, signals, or backtests (use technical-analyst); stock news and sentiment
  (use news); executing stock trades (use hyperliquid — stocks are Hyperliquid perps); crypto
  movers or rankings (use market-strategist).
allowed-tools: bash read
---

# Stock Analyst

Backing command group: `tribes-cli stock-analyst`. Sends one natural-language question to the
stock market-data specialist and returns a prose analysis.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Price, quote, candle, snapshot, ticker-search, or market open/closed check for stocks.
- Stock market movers — top gainers and losers among stocks.
- NOT for indicator values, signals, backtests, or any indicator math — use `technical-analyst`.
- NOT for stock news, catalysts, or sentiment — use `news`.
- NOT for placing or sizing stock trades — use `hyperliquid` (stocks are Hyperliquid perps).
- NOT for crypto movers or market-wide crypto data — use `market-strategist`.

## Hard rules

1. The ONLY flag is `--query` — no `--out`, `--ticker`, or filter flags. Encode ticker,
   timeframe, indicator set, and date range in the query text.
2. Output is one free-text analysis string on stdout, not JSON.
3. MUST set a bash timeout of at least 120 seconds (prefer 300) for `ask` (see AGENTS.md).
4. The CLI calls the API itself — NEVER call the endpoint or curl directly.
5. Run at most 1–2 refinement `ask` calls when a follow-up serves the original ask (see AGENTS.md).
6. Relay exact figures with the timeframe and direction of change, never approximations.
7. For unscoped movers/discovery, also run crypto via `market-strategist` and commodities via
   `commodity-analyst` (AGENTS.md).
8. Apply the Hyperliquid tradability guardrail before pitching trade ideas (see AGENTS.md).

## Command reference

| Subcommand | Purpose                                             | Required flags | Read-only or signed |
| ---------- | --------------------------------------------------- | -------------- | ------------------- |
| `ask`      | Natural-language query to the stock-data specialist | `--query`      | read-only           |

## Examples

### Price and quote check

```bash
tribes-cli stock-analyst ask --query "AAPL current price, day change, volume, and NBBO bid/ask spread"
```

### Candles over a timeframe

```bash
tribes-cli stock-analyst ask --query "Daily OHLCV candles for NVDA over the last 30 days, note the trend"
```

### Movers and market status

```bash
tribes-cli stock-analyst ask --query "Top stock gainers and losers today, and is the market currently open?"
```

### Snapshot for sizing a trade

```bash
tribes-cli stock-analyst ask --query "Full snapshot for MSFT: last price, day range, volume, and 52-week range"
```

## Error recovery

| Symptom                                  | Action                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.           |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.               |
| Empty or off-topic answer                | Re-ask once with a tighter query (one ticker, explicit timeframe); then stop and report. |

## Related skills

- `technical-analyst` — indicator computation, signals, and backtests across asset classes.
- `news` — stock news, catalysts, and sentiment for a ticker.
- `hyperliquid` — discover the hosting dex and execute stock trades as Hyperliquid perps.
- `market-strategist` — crypto movers, rankings, and market-wide aggregates.
