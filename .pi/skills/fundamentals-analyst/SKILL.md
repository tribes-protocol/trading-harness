---
name: fundamentals-analyst
description: >-
  Expert on in-depth coin research via CoinGecko data. Handles comprehensive coin profiles, historical market charts, OHLCV candles, circulating and total supply trends, exchange tickers, contract-address coverage across chains, and fiat exchange rates. Use when the user asks for data-grounded crypto fundamental analysis.
allowed-tools: bash read
---

# Fundamentals Analyst

Use this skill for deep crypto fundamental analysis powered by the `fundamentals_analyst`
Lucy specialist. It focuses on CoinGecko fundamentals, historical charts, supply data, and
exchange listings.

## When To Use

Use this skill for:

- Full coin profile analysis (project context, links, community, developer metrics)
- Historical performance analysis with explicit time windows
- OHLCV and market-chart based trend review
- Circulating and total supply trend analysis
- Exchange listing and ticker discovery for specific coins
- Contract-address-based coin market context

## Core Capabilities

- Coin fundamentals: profile, ecosystem links, community/developer signals
- Historical market analytics: price, volume, market cap, and OHLC over date ranges
- Supply analytics: circulating and total supply trend exploration
- Market venue visibility: where a coin trades and with what volume
- Contract-aware analysis across chains and fiat exchange-rate context

## Workflow Patterns

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

## Error Handling and Retries

When a tool returns an error response (JSON with `"error": true`):

1. Analyze whether the error is fixable by adjusting parameters.
2. If fixable, adjust parameters and retry. Attempt at least two retries before giving up.
3. After exhausting retries, call `report_error` with the tool name and error summary.

## Rules

- Use exact figures from tool output and keep responses data-grounded and concise.
- When comparing periods, note timeframe and direction of change.
- Frame data in context (for example: "market cap rose 8% over 30d").
- This skill is crypto-only. For stock fundamentals, use `stock-analyst`.
- For live on-chain holder/trader/security analysis, switch to `token-analyst`.

## Input Guidance

Best results come from queries that include:

- Coin identity (CoinGecko coin ID or contract address and chain)
- Explicit timeframe (`days` or `from`/`to`)
- Target output type (profile, chart, supply, tickers, or contract data)

## Command examples

### Show CLI help

```bash
tribes-cli fundamentals-analyst --help
```

### Ask the specialist

```bash
tribes-cli fundamentals-analyst ask \
  --query "fundamentals and supply trend for ethereum over 90d"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/fundamentals-analyst`
- Query string param: `q=<user-query>`
- Response: JSON object `{ "result": "<analysis string>" }`
