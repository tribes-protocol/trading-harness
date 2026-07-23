---
name: options
description: >-
  Expert on US equity OPTIONS data. Handles: option chain snapshots with bid/ask, IV, greeks, and
  open interest; single-contract snapshots; contract discovery by underlying, expiry, and type;
  options trades and NBBO quote history; last trade; daily contract candles; and the previous-day
  bar. Call for "AAPL option chain", greeks or IV on a contract, unusual options flow, or option
  price history. NOT for: the underlying stock's price or candles (use stock-analyst); SEC
  fundamentals or filings (use stock-fundamentals); indicator math on candles (use
  technical-analyst); executing trades (options are data-only here — no options venue exists in
  this harness).
allowed-tools: bash read
---

# Options

Backing command group: `tribes-cli options` — the Tribes options proxy and Massive as
structured JSON, answering in seconds. YOU are the analyst: pull the numbers with the
subcommands below and do the interpretation — skew reads, flow analysis, IV context —
yourself. There is no backend specialist behind this skill and no `ask` subcommand.

## When to use

- Chain overview for an underlying (`chain`), one contract's full snapshot (`contract`),
  discovering contract tickers (`contracts`).
- Flow and microstructure: `trades`, `quotes`, `last-trade`.
- Price history: `candles` (daily OHLCV, chains into `ta`), `prev-day`.
- NOT for the underlying stock's own quote or candles — use `stock-analyst`.
- NOT for SEC fundamentals, short interest, or filings — use `stock-fundamentals`.
- NOT for placing any trade: no options venue exists in this harness. Options data can inform a
  stock perp thesis executed via `hyperliquid`, but never present an options trade as executable.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. Contract tickers are OCC format (`O:AAPL250620C00200000`). When you only know the
   underlying, resolve contracts first with `chain` or `contracts`, then query the contract.
3. `chain` and `contract` ride the Tribes proxy (bearer auth); `contracts`, `trades`, `quotes`,
   `last-trade`, `candles`, and `prev-day` call Massive directly and need `MASSIVE_API_KEY`.
4. `candles` emits the shared candle contract (`{source, candles: [{t,o,h,l,c,v}]}`) — write it
   with `--out` and feed the file to `tribes-cli ta` for any indicator math.
5. If a command reports `MASSIVE_API_KEY is not set`, the direct-Massive subcommands are
   unavailable on this box — report that plainly instead of retrying or working around it.

## Command reference

All under `tribes-cli options`; every subcommand accepts `--out <file>`. All read-only.

| Subcommand   | Purpose                                          | Required flags | Useful flags                                                 | Source               |
| ------------ | ------------------------------------------------ | -------------- | ------------------------------------------------------------ | -------------------- |
| `chain`      | Chain snapshot: strikes, bid/ask, IV, greeks, OI | `--symbol`     | `--expiry` (YYYY-MM-DD), `--strike-range` MIN-MAX, `--limit` | Tribes options proxy |
| `contract`   | One contract: quote, IV, greeks, day bar, OI     | `--contract`   |                                                              | Tribes options proxy |
| `contracts`  | List contract tickers for an underlying          | `--symbol`     | `--expiry`, `--type call\|put`, `--limit` (default 100)      | Massive direct       |
| `trades`     | Recent trades, newest first                      | `--contract`   | `--limit` (default 50)                                       | Massive direct       |
| `quotes`     | Recent NBBO quotes, newest first                 | `--contract`   | `--limit` (default 50)                                       | Massive direct       |
| `last-trade` | Last trade for a contract                        | `--contract`   |                                                              | Massive direct       |
| `candles`    | Daily OHLCV candles (shared candle contract)     | `--contract`   | `--from`/`--to` (YYYY-MM-DD), `--limit` (default 100)        | Massive direct       |
| `prev-day`   | Previous trading day OHLCV bar                   | `--contract`   |                                                              | Massive direct       |

## Examples

### Chain read ("show me AAPL calls near the money")

```bash
tribes-cli options chain --symbol AAPL --expiry 2026-08-21 --strike-range 190-220
```

Relay strike ladder with bid/ask, IV, delta, and open interest; note where OI and volume
cluster and what the skew implies.

### Drill into one contract, then its flow

```bash
tribes-cli options contracts --symbol TSLA --expiry 2026-08-21 --type put --limit 50
tribes-cli options contract --contract O:TSLA260821P00400000
tribes-cli options trades --contract O:TSLA260821P00400000 --limit 100
```

### Chain option candles into TA indicators

```bash
tribes-cli options candles --contract O:AAPL260918C00210000 --limit 200 --out /tmp/aapl-call-candles.json
tribes-cli ta indicators --candles-file /tmp/aapl-call-candles.json --set rsi,ema,macd
```

For signals, levels, or backtests on the same file, use `technical-analyst`.

## Error recovery

| Symptom                               | Action                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `MASSIVE_API_KEY is not set`          | Direct-Massive subcommands unconfigured on this box — report it; `chain` and `contract` may still work via the proxy. |
| Auth error on `chain`/`contract`      | Run `tribes-cli login`, retry the original command once, then stop and report.                                        |
| `Cannot derive the underlying ticker` | The `--contract` value is not an OCC ticker — resolve it with `chain` or `contracts` first.                           |
| Unknown option error                  | Drop the extra flag — see the command reference for each subcommand's flags.                                          |
| Any other API failure                 | Retry the same command once; if it fails again, stop and report the error.                                            |

## Related skills

- `stock-analyst` — the underlying's live quote, candles, profile, and ticker search.
- `stock-fundamentals` — SEC fundamentals, short interest, and filings for the underlying.
- `technical-analyst` — indicator computation, signals, and backtests on candle files from here.
- `news` — stock news, catalysts, and sentiment for the underlying.
- `hyperliquid` — execute a directional stock thesis as a Hyperliquid perp.
