---
name: exchange-analyst
description: >-
  Expert on centralized exchanges, derivatives markets, and institutional crypto holdings. Handles: exchange rankings and volume data, individual exchange profiles and tickers, exchange volume trends, derivatives/futures tickers and open interest, derivatives exchange rankings, and public treasury data (which companies hold crypto, their holdings and transaction history). Call for exchange comparisons, derivatives data, futures markets, or institutional/treasury tracking.
allowed-tools: bash read
---

# Exchange Analyst

Use this skill for exchange and derivatives intelligence powered by the `exchange_analyst` Lucy
specialist. It covers centralized exchanges, derivatives venues, and public treasury holdings.

## When To Use

Use this skill for:

- Exchange ranking/comparison requests (volume, quality, coverage)
- Exchange profile and ticker-level market availability checks
- Derivatives venue analysis, including futures/perpetual market context
- Perps flow views (positions, trades, order book depth)
- Institutional/public-treasury holdings and transaction tracking

## Core Capabilities

- Centralized exchange intelligence: rankings, profiles, tickers, and volume trends
- Derivatives intelligence: exchange-level and instrument-level derivatives context
- Perpetual market views: market info, order book, screener, positions, and trade flow
- Treasury tracking: entity list, holdings by coin/entity, holdings trend charts, transaction history

## Recommended Workflows

Exchange comparison:

- Ask for ranked exchanges first, then drill into specific exchange profiles and tickers.

Derivatives overview:

- Ask for derivatives tickers and derivatives exchange rankings before focusing on a venue.

Perps diagnostics:

- Ask for perps markets overview, then inspect market info and order book on selected assets.

Institutional tracking:

- Ask for treasury entities, then holdings and transaction history for chosen entities.

## Input Guidance

Best results come from queries that include:

- Target venue/entity identifiers when known
- Scope (spot exchange, derivatives exchange, perps market, or treasury)
- Timeframe context for trend requests

For token-level on-chain holder/trader/security depth, switch to `token-analyst`.

## Code

```bash
bun run build --filter=@tribes-terminal/skill-exchange-analyst
```

## Command examples

### Show CLI help

```bash
bun .pi/skills/exchange-analyst/src/cli/ExchangeAnalyst.ts --help
```

### Ask the specialist

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun .pi/skills/exchange-analyst/src/cli/ExchangeAnalyst.ts ask \
  --query "compare top derivatives exchanges by open interest"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/exchange-analyst`
- Query string param: `q=<user-query>`
- Authorization header: `Bearer <API_BEARER_TOKEN>`
- Response: JSON object `{ "result": "<analysis string>" }`
