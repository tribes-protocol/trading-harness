---
name: market-strategist
description: >-
  Expert on the big-picture crypto market. Handles: global market cap and BTC dominance, DeFi TVL, market cap trends over time, coin rankings and market data tables, daily top gainers and losers, category performance, recently added coins, quick price lookups, and market-wide search. Call for "how's the market?", ranking questions, top movers, category analysis, or broad trend questions.
allowed-tools: bash read
---

# Market Strategist

Use this skill for big-picture crypto market analysis powered by the `market_strategist` Lucy
specialist. It focuses on market-wide metrics, rankings, movers, categories, and broad trends.

## When To Use

Use this skill for:

- Macro market checks ("how is crypto doing overall?")
- Global context (total market cap, BTC dominance, DeFi TVL)
- Top movers and ranking-based analysis
- Category and sector performance comparisons
- Broad market discovery and trending asset lookup

## Core Capabilities

- Global metrics and trend context: market cap, dominance, DeFi health, market-cap charts
- Rankings and leaders: top coins by market cap/volume and performance
- Movers intelligence: daily gainers/losers and broad risk-on/risk-off signals
- Category analytics: sector-level performance and rotation analysis
- Discovery and lookup: trending search, new coins, and quick price checks

## Recommended Workflows

Market overview ("How is the market today?"):

- Ask for global crypto metrics first, then DeFi metrics, then top gainers/losers.

Coin ranking analysis:

- Ask for ranked markets, then compare top names with category-level performance.

Category rotation checks:

- Ask for category performance first, then drill into specific sectors.

Trend confirmation:

- Ask for market-cap chart context and combine it with current movers.

Quick directional checks:

- Ask for simple price lookups after setting market context.

## Input Guidance

Best results come from queries that include:

- Time window (for example 24h / 7d / 30d)
- Scope (global market, category, or ranked coin list)
- Explicit metric focus (market cap, dominance, volume, gainers/losers)

For token-specific on-chain depth (holders/traders/security), switch to `token-analyst`.

## Code

```bash
bun run build --filter=@tribes-terminal/skill-market-strategist
```

## Command examples

### Show CLI help

```bash
bun .pi/skills/market-strategist/src/cli/MarketStrategist.ts --help
```

### Ask the specialist

```bash
API_BEARER_TOKEN="$(bun src/cli/llm-token.ts)" \
bun .pi/skills/market-strategist/src/cli/MarketStrategist.ts ask \
  --query "global crypto market overview for the last 24h"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/market-strategist`
- Query string param: `q=<user-query>`
- Authorization header: `Bearer <API_BEARER_TOKEN>`
- Response: JSON object `{ "result": "<analysis string>" }`
