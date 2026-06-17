---
name: fundamentals-analyst
description: >-
  Expert on in-depth coin research via CoinGecko data. Handles: comprehensive coin profiles (description, links, community, developer metrics), historical market charts over custom date ranges, OHLCV candle data, circulating and total supply trends, exchange tickers showing where a coin trades, contract/address data across chains, and fiat exchange rates. Call when the user wants detailed coin research, historical performance charts, supply analytics, or needs to know which exchanges list a coin.
allowed-tools: bash read
---

# Fundamentals Analyst

Use this skill for deep coin research powered by the `fundamentals_analyst` Lucy specialist.
It focuses on rich CoinGecko fundamentals, historical charts, supply data, and exchange listings.

## When To Use

Use this skill for:

- Full coin profile analysis (project context, links, community, developer metrics)
- Historical performance analysis with explicit time windows
- OHLCV and market-chart based trend review
- Circulating and total supply trend analysis
- Exchange listing and ticker discovery for specific coins
- Contract-address based coin market context

## Core Capabilities

- Coin fundamentals: profile, ecosystem links, community/developer signals
- Historical market analytics: price, volume, market cap, OHLC over date ranges
- Supply analytics: circulating and total supply trend exploration
- Market venue visibility: where a coin trades and with what volume
- Contract-aware analysis across chains and fiat exchange-rate context

## Recommended Workflows

Coin due diligence:

- Ask for full coin profile first, then drill into historical performance and supply trends.

Historical analysis:

- Ask for market chart over a clear period, then request OHLC candles for structure.

Supply thesis checks:

- Ask for circulating and total supply charts across the same timeframe.

Exchange discovery:

- Ask for coin tickers by ID to identify listing coverage and venue liquidity.

Contract-address research:

- Ask for contract data first, then contract market chart for performance context.

## Input Guidance

Best results come from queries that include:

- CoinGecko coin ID when known
- Explicit timeframe (`days` or a date range)
- Target output type (profile, chart, supply, tickers, or contract data)

For live on-chain holder/trader/security analysis, switch to `token-analyst`.

## Command examples

### Show CLI help

```bash
bun src/cli/FundamentalsAnalyst.ts --help
```

### Ask the specialist

```bash
bun src/cli/FundamentalsAnalyst.ts ask \
  --query "fundamentals and supply trend for ethereum over 90d"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/fundamentals-analyst`
- Query string param: `q=<user-query>`
- Response: JSON object `{ "result": "<analysis string>" }`
