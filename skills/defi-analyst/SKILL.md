---
name: defi-analyst
description: >-
  Expert on DEX activity and liquidity pools. Handles: pool discovery, trending and new pools,
  pool metrics (TVL, volume, fees), pool OHLCV charts, pool trade activity, pair analysis, DEX
  rankings by network, threshold-filtered discovery by FDV/liquidity/volume, and pool
  categories. Call when the pool, pair, or DEX is the subject. NOT for: one token's own price,
  safety, or trades (use token-analyst); trending-token discovery (use alpha-scout); CEX or
  derivatives volume (use exchange-analyst); market-wide caps/rankings (use market-strategist).
allowed-tools: bash read
---

# Defi Analyst

Backing command group: `tribes-cli defi-analyst`. Sends one natural-language question to the
DeFi specialist and returns a prose analysis of pools, pairs, and DEX activity.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- The subject is a liquidity pool, trading pair, or DEX — details, metrics, charts, trades.
- Ranking or discovering pools and DEXes by TVL, volume, fees, FDV, or category on a network.
- NOT for one token's price, security, or holders — use `token-analyst`.
- NOT for trending tokens or smart-money discovery — use `alpha-scout`.

## Hard rules

1. The ONLY flag is `--query` — no `--out`, `--network`, `--limit`, or filter flags. Encode
   network, DEX, pool address, timeframe, and every TVL/volume/FDV threshold in the query text.
2. Output is one free-text analysis string on stdout, not JSON.
3. MUST set a bash timeout of at least 120 seconds (prefer 300) for `ask` (see AGENTS.md).
4. The CLI calls the API itself — NEVER call the endpoint or curl directly.
5. Run at most 1–2 refinement `ask` calls when a follow-up serves the original ask (see AGENTS.md).
6. IF multiple pools match, THEN pick highest TVL with 24h volume above $100k, else ask to re-rank.
7. Render pool and token addresses shown to the user as tribes.xyz Markdown links (see AGENTS.md).
8. Before presenting pool findings as trade ideas, apply the Hyperliquid tradability guardrail
   (see AGENTS.md).

## Command reference

| Subcommand | Purpose                                       | Required flags | Read-only or signed |
| ---------- | --------------------------------------------- | -------------- | ------------------- |
| `ask`      | Natural-language query to the DeFi specialist | `--query`      | read-only           |

## Examples

### Pool details by address

```bash
tribes-cli defi-analyst ask --query "Details for pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 on uniswap-v3 ethereum: TVL, 24h volume, fees, token composition"
```

### Top pools for a token

```bash
tribes-cli defi-analyst ask --query "Top 5 SOL pools on solana by liquidity and 24h volume; compare fee tiers"
```

### Trending or new pools with thresholds

```bash
tribes-cli defi-analyst ask --query "Trending pools on base in the last 24h with liquidity above $500k and FDV below $50M"
```

### DEX rankings by network

```bash
tribes-cli defi-analyst ask --query "Rank DEXes on arbitrum by 24h volume and list the top 3 pools of the leader"
```

### Pair OHLCV and recent trades

```bash
tribes-cli defi-analyst ask --query "Hourly OHLCV for the WETH/USDC 0.05% pool on uniswap-v3 ethereum over the last 3 days, plus notable recent trades"
```

## Error recovery

| Symptom                                  | Action                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.                      |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.                          |
| Empty or off-topic answer                | Re-ask once with a tighter query (add network, DEX, pool address, timeframe); then stop and report. |

## Related skills

- `token-analyst` — one token's price, security, trades, holders.
- `alpha-scout` — trending tokens, new listings, smart-money discovery.
- `market-strategist` — market-wide caps, dominance, rankings, movers.
- `technical-analyst` — indicator computation and backtests on OHLCV candles.
