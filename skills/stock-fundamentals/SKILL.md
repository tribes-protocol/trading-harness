---
name: stock-fundamentals
description: >-
  Expert on SEC stock FUNDAMENTALS and filings. Handles: income statements, balance sheets, cash
  flow statements, valuation and health ratios, free float, short interest and short volume,
  dividend and split history, the SEC filings index, 10-K section text, 8-K material-event text,
  and categorized risk factors. Call for earnings quality, balance-sheet health, short squeeze
  setups, dividend history, or "what does the 10-K say" questions. NOT for: live prices, quotes,
  or candles (use stock-analyst); options chains or greeks (use options); indicator math (use
  technical-analyst); stock news and sentiment (use news).
allowed-tools: bash read
---

# Stock Fundamentals

Backing command group: `tribes-cli stock-fundamentals` — Massive-backed SEC fundamentals and
filings as structured JSON, answering in seconds. YOU are the analyst: pull the numbers with
the subcommands below and do the interpretation — earnings trajectory, leverage reads, squeeze
setups, filing summaries — yourself. There is no backend specialist behind this skill and no
`ask` subcommand.

## When to use

- Financial statements over time: `income`, `balance-sheet`, `cash-flow` (annual or quarterly).
- Valuation and health snapshot: `ratios`; ownership structure: `float`.
- Short-squeeze context: `short-interest` (with days-to-cover) plus `short-volume` (daily ratio).
- Corporate actions: `dividends`, `splits`.
- SEC filings: `filings` (index), `tenk-section` (10-K section text), `eightk` (8-K
  material-event text), `risk-factors` (categorized risk disclosures).
- NOT for live prices, quotes, or OHLCV candles — use `stock-analyst`.
- NOT for option chains, contracts, or greeks — use `options`.
- NOT for stock news, catalysts, or sentiment — use `news`.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. Symbols are stock tickers (`AAPL`, not "Apple") — resolve company names with
   `tribes-cli stocks search` first when unsure.
3. Statement rows arrive newest first. Quote period ends and fiscal year/quarter with every
   figure you relay; never mix annual and quarterly rows in one comparison.
4. `tenk-section` and `eightk` return long raw filing text — write it with `--out` and read the
   file instead of dumping it inline.
5. If a command reports `MASSIVE_API_KEY is not set`, the capability is unavailable on this
   box — report that plainly instead of retrying or working around it.

## Command reference

All under `tribes-cli stock-fundamentals`; every subcommand accepts `--out <file>`. All read-only.

| Subcommand       | Purpose                                            | Required flags          | Useful flags                                       |
| ---------------- | -------------------------------------------------- | ----------------------- | -------------------------------------------------- |
| `income`         | Revenue, gross profit, operating/net income, EPS   | `--symbol`              | `--timeframe annual\|quarterly`, `--limit` (def 4) |
| `balance-sheet`  | Assets, liabilities, cash, equity                  | `--symbol`              | `--timeframe annual\|quarterly`, `--limit` (def 4) |
| `cash-flow`      | Operating/investing/financing cash flows           | `--symbol`              | `--timeframe annual\|quarterly`, `--limit` (def 4) |
| `ratios`         | P/E, P/B, P/S, ROE, EV/EBITDA, debt/equity         | `--symbol`              | `--limit` (default 1)                              |
| `float`          | Free float shares and percentage                   | `--symbol`              | `--limit` (default 1)                              |
| `short-interest` | Short interest + days-to-cover per settlement date | `--symbol`              | `--limit` (default 5)                              |
| `short-volume`   | Daily short volume and short volume ratio          | `--symbol`              | `--limit` (default 10)                             |
| `dividends`      | Ex-date, pay date, cash amount, frequency          | `--symbol`              | `--limit` (default 10)                             |
| `splits`         | Split execution dates and ratios                   | `--symbol`              | `--limit` (default 10)                             |
| `filings`        | SEC filings index, newest first                    | `--symbol`              | `--form-type` (e.g. 10-K), `--limit` (default 10)  |
| `tenk-section`   | Full text of a 10-K section                        | `--symbol`, `--section` | `--limit` (default 1)                              |
| `eightk`         | 8-K current report text (material events)          | `--symbol`              | `--limit` (default 1)                              |
| `risk-factors`   | Categorized risk factors from SEC filings          | `--symbol`              | `--limit` (default 10)                             |

## Examples

### Earnings trajectory ("how are AAPL's fundamentals?")

```bash
tribes-cli stock-fundamentals income --symbol AAPL --timeframe quarterly --limit 8
tribes-cli stock-fundamentals ratios --symbol AAPL
tribes-cli stock-fundamentals cash-flow --symbol AAPL --limit 4
```

Synthesize: revenue and margin direction from `income`, valuation context from `ratios`, cash
generation quality from `cash-flow`. State the trend and what is driving it.

### Short-squeeze setup check

```bash
tribes-cli stock-fundamentals short-interest --symbol GME
tribes-cli stock-fundamentals short-volume --symbol GME --limit 10
tribes-cli stock-fundamentals float --symbol GME
```

Relate short interest to float and days-to-cover; call the setup strong, weak, or absent.

### Read the filings

```bash
tribes-cli stock-fundamentals filings --symbol TSLA --form-type 8-K --limit 5
tribes-cli stock-fundamentals eightk --symbol TSLA --out /tmp/tsla-8k.json
tribes-cli stock-fundamentals tenk-section --symbol TSLA --section risk_factors --out /tmp/tsla-10k.json
tribes-cli stock-fundamentals risk-factors --symbol TSLA
```

## Error recovery

| Symptom                      | Action                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `MASSIVE_API_KEY is not set` | Provider unconfigured on this box — report it; do not retry or work around.  |
| Unknown option error         | Drop the extra flag — see the command reference for each subcommand's flags. |
| Any other API failure        | Retry the same command once; if it fails again, stop and report the error.   |

## Related skills

- `stock-analyst` — live quotes, candles, ticker profiles, and company/ticker search.
- `options` — option chains, contracts, greeks, and options trades/quotes for the same ticker.
- `technical-analyst` — indicator computation, signals, and backtests on candle files.
- `news` — stock news, catalysts, and sentiment for a ticker.
- `hyperliquid` — discover the hosting dex and execute stock trades as Hyperliquid perps.
