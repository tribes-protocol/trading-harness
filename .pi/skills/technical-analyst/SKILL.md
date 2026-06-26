---
name: technical-analyst
description: Expert technical analyst across crypto tokens, stocks, and perpetuals. Computes momentum, trend, volatility, and volume indicators from OHLCV candles. Can also backtest trading strategies with entry/exit conditions against historical data.
allowed-tools: bash read
---

# Technical Analyst

Use this skill for chart-based technical analysis. It has two complementary paths:

- **Primary**: Ask the `technical_analyst` Lucy specialist for indicator computation and backtesting.
- **Candles fallback**: When the specialist is unavailable or returns insufficient data, fetch
  raw OHLCV candles directly via `tribes-cli hyperliquid list-candles` and compute indicators
  locally (Python one-liner or bun script).

## When To Use

Use this skill for:

- Momentum/trend/volatility indicator analysis from OHLCV candles
- Multi-indicator confluence checks (RSI, MACD, SMA/EMA, Bollinger, ADX, ATR, OBV, ROC)
- Timeframe-based technical readouts on tokens/perps (and stocks when enabled)
- Rule-based strategy backtesting over historical candles
- Interpreting indicator states with concrete numeric values

## Core Capabilities

- Indicator computation in one pass over OHLCV candles
- Timeframe-aware analysis with fallback behavior for insufficient candle history
- Asset resolution support before analysis when only symbols/names are provided
- Strategy backtesting with entry/exit conditions and performance statistics

## Fetching Raw Candles (Fallback)

When the Lucy specialist cannot provide indicators (timeout, HTTP error, insufficient data),
fall back to fetching raw candles and computing indicators yourself:

```bash
# xyz dex (HIP-3 perps like COIN, TSLA, NVDA):
tribes-cli hyperliquid list-candles --coin xyz:COIN --interval 1h --limit 200

# Main dex (BTC, ETH, SOL, etc.):
tribes-cli hyperliquid list-candles --coin BTC --interval 1d --limit 90

# Custom time range:
tribes-cli hyperliquid list-candles \
  --coin xyz:COIN \
  --interval 4h \
  --start-time 1750000000000 \
  --end-time 1750896000000
```

Options:
- `--coin`: Asset symbol with dex prefix for HIP-3 (e.g., `xyz:COIN`) or bare for main (e.g., `BTC`)
- `--interval`: `1m` | `3m` | `5m` | `15m` | `30m` | `1h` | `2h` | `4h` | `8h` | `12h` | `1d` | `3d` | `1w` | `1M`
- `--start-time`: Start timestamp in ms (default: 30 days ago or estimated from --limit)
- `--end-time`: End timestamp in ms (default: now)
- `--limit`: Max candles to return (estimates start-time from interval; clamped to limit)

Returns JSON with `{ coin, interval, candles: [{ t, T, s, i, o, c, h, l, v, n }, ...] }`.
Use the `api-ui.hyperliquid.xyz` endpoint under the hood (supports both main and HIP-3 dex candles).

## Recommended Workflows

Indicator analysis:

- Ask for the asset and timeframe first, then request specific indicators or confluence.

Signal confirmation:

- Ask for trend + momentum + volatility indicators together before concluding direction.

Backtesting:

- Ask for a strategy idea with explicit entry/exit rules and timeframe, then iterate.

Unknown asset identifiers:

- Ask with symbol/name plus chain context so the specialist can resolve the right market.

Candles fallback:

- Run `tribes-cli hyperliquid list-candles` to fetch raw OHLCV, then compute RSI/MACD/SMA/Bollinger/ATR
  in a Python one-liner or a small inline script.

## Input Guidance

Best results come from queries that include:

- Asset identity (token symbol/address, perp coin, or stock ticker when available)
- Timeframe (`1m`, `15m`, `1H`, `4H`, `1D`, `1W`, `1M`)
- Indicator set or strategy rules to evaluate
- Optional historical window if you need a specific date range

If you need token fundamentals instead of chart structure, switch to `fundamentals-analyst`.

## Command examples

### Show CLI help

```bash
tribes-cli technical-analyst --help
```

### Ask the specialist

```bash
tribes-cli technical-analyst ask \
  --query "BTC 4H technical analysis with RSI, MACD, and ATR"
```

### Fallback: fetch raw candles and compute locally

```bash
tribes-cli hyperliquid list-candles --coin xyz:COIN --interval 1h --limit 200
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/technical-analyst`
- Query string param: `q=<user-query>`
- Response: JSON object `{ "result": "<analysis string>" }`
