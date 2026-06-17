---
name: technical-analyst
description: Expert technical analyst across crypto tokens, stocks, and perpetuals. Computes momentum, trend, volatility, and volume indicators from OHLCV candles. Can also backtest trading strategies with entry/exit conditions against historical data.
allowed-tools: bash read
---

# Technical Analyst

Use this skill for chart-based technical analysis powered by the `technical_analyst` Lucy
specialist. It computes indicators on OHLCV data and can backtest strategy rules.

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

## Recommended Workflows

Indicator analysis:

- Ask for the asset and timeframe first, then request specific indicators or confluence.

Signal confirmation:

- Ask for trend + momentum + volatility indicators together before concluding direction.

Backtesting:

- Ask for a strategy idea with explicit entry/exit rules and timeframe, then iterate.

Unknown asset identifiers:

- Ask with symbol/name plus chain context so the specialist can resolve the right market.

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
bun src/cli/TechnicalAnalyst.ts --help
```

### Ask the specialist

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun src/cli/TechnicalAnalyst.ts ask \
  --query "BTC 4H technical analysis with RSI, MACD, and ATR"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/technical-analyst`
- Query string param: `q=<user-query>`
- Authorization header: `Bearer <API_BEARER_TOKEN>`
- Response: JSON object `{ "result": "<analysis string>" }`
