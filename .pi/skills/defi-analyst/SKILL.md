---
name: defi-analyst
description: >-
  Expert on DEX activity and liquidity pools. Handles: pool discovery and search, trending and new pools, pool metrics (TVL, volume, fees), pool OHLCV charts, pool trade activity, pair-level analysis, DEX rankings by network, advanced pool filtering by FDV/liquidity/volume, and pool category exploration. Call for any question about liquidity pools, DEXes, trading pairs, or on-chain DeFi activity.
allowed-tools: bash read
---

# Defi Analyst

Use this skill for DeFi market structure and pool intelligence powered by the `defi_analyst`
Lucy specialist. It focuses on pools, DEX activity, liquidity/volume context, and pair-level
trading behavior.

## When To Use

Use this skill for:

- Liquidity pool discovery and ranking
- Trending and newly launched pools
- Pool metrics (liquidity, volume, fees, composition)
- Pair-level OHLCV and historical trade activity
- DEX-level comparisons by network
- Advanced pool filtering by liquidity/volume/FDV thresholds

## Core Capabilities

- Pool discovery across networks, DEXes, and categories
- Pool and pair analytics with market activity context
- DEX intelligence and cross-venue comparisons
- Trend spotting for hot pools and new launches

## Recommended Workflows

Pool lookup (known pool address):

- Ask for pool details first, then chart/trade activity.

Find pools for a token:

- Ask for top pools, compare candidates, then drill into trades/charts.

Pool discovery ("what pools are hot?"):

- Ask for trending/new pools first, then filter by liquidity/volume quality.

DEX analysis:

- Ask for DEX list by network and then inspect top pools for selected DEXes.

Pair-level analysis:

- Ask for pair OHLCV and historical trades in the same timeframe.

## Input Guidance

Best results come from queries that include:

- Network and DEX when relevant
- Pool address or pair tokens when known
- Explicit timeframe for volume/trade comparisons

If multiple pools match, prefer the one with stronger liquidity and meaningful volume.

## Command examples

### Show CLI help

```bash
bun src/cli/DefiAnalyst.ts --help
```

### Ask the specialist

```bash
bun src/cli/DefiAnalyst.ts ask \
  --query "top SOL pools by liquidity and 24h volume"
```

## Endpoint Contract

The CLI calls:

- `POST /agent/lucy/defi-analyst`
- Query string param: `q=<user-query>`
- Response: JSON object `{ "result": "<analysis string>" }`
