---
name: market-strategist
description: >-
  Expert on market-WIDE crypto aggregates, never single-token deep dives. Handles: global market
  cap and BTC dominance, DeFi TVL, market-cap trends over time, coin ranking tables, daily top
  gainers and losers, category performance, recently added coins, quick multi-coin price lookups,
  and market-wide search. Call for "how's the market?", crypto rankings, crypto top movers,
  category rotation, or broad trend questions. NOT for: one token's price, chart, or safety (use
  token-analyst); deep single-coin research (use fundamentals-analyst); pool or DEX-level TVL
  (use defi-analyst); stock movers (use stock-analyst); numeric macro indicators (use macros).
allowed-tools: bash read
---

# Market Strategist

Backing command group: `tribes-cli market` — CoinGecko-backed market-wide aggregates as
structured JSON, answering in seconds. YOU are the strategist: pull the numbers with the
subcommands below and do the interpretation — narrative, sector rotation, trend reads —
yourself. There is no backend specialist behind this skill and no `ask` subcommand.

## When to use

- "How is the crypto market?" — combine `global` + `defi` + `movers` + `top`.
- Crypto ranking tables (`top`), daily top gainers/losers (`movers`), market-cap trends over
  time (`history`).
- Category rotation (`categories`), recently added coins (`new`), quick multi-coin price
  checks (`price`), market-wide search (`search`), search-popularity trends (`trending`).
- NOT for a single token or coin — use `token-analyst` (on-chain) or `fundamentals-analyst` (profile).
- NOT for trending-token discovery (`alpha-scout`), pools/DEXes (`defi-analyst`), CEX/derivatives (`exchange-analyst`).
- NOT for stock movers (`stock-analyst`) or numeric macro indicators like CPI/VIX/DXY (`macros`).

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. Coin ids are CoinGecko ids (`bitcoin`, not `BTC`) — resolve names/symbols with
   `market search` first when unsure.
3. Before presenting movers or rankings as actionable trade ideas, verify Hyperliquid
   tradability with `hyperliquid list-assets --all-dexes` and split actionable, watchlist-only,
   and not-tradable markets (see AGENTS.md).
4. For unscoped "top movers" or opportunity requests, also run the securities side via
   `stock-analyst` and the commodities side via `commodity-analyst` (cross-asset guardrail, see
   AGENTS.md).
5. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.

## Command reference

All under `tribes-cli market`; every subcommand accepts `--out <file>`. All read-only.

| Subcommand   | Purpose                                               | Required flags | Useful flags                                |
| ------------ | ----------------------------------------------------- | -------------- | ------------------------------------------- |
| `global`     | Global market cap, 24h volume, BTC/ETH dominance      | none           |                                             |
| `defi`       | DeFi market cap, 24h volume, dominance, top coin      | none           |                                             |
| `history`    | Total market cap + volume time series                 | `--days`       | `1\|7\|14\|30\|90\|180\|365\|max`           |
| `top`        | Ranked coin table with 1h/24h/7d change               | none           | `--limit` (default 50)                      |
| `movers`     | Top gainers and losers vs usd                         | none           | `--duration 1h\|24h\|7d\|14d\|30d\|60d\|1y` |
| `categories` | Category table: mcap, 24h change, volume, top-3 coins | none           | `--limit` (default 50)                      |
| `new`        | Recently added coins, newest first                    | none           | `--limit` (default 50)                      |
| `price`      | Quick multi-coin prices + mcap + 24h change           | `--ids`        |                                             |
| `search`     | Resolve names/symbols to CoinGecko ids                | `--query`      |                                             |
| `trending`   | Trending coins by search popularity                   | none           |                                             |

## Examples

### Market overview ("how's the market?")

```bash
tribes-cli market global
tribes-cli market defi
tribes-cli market movers --duration 24h
tribes-cli market top --limit 20
```

Synthesize: total cap and dominance from `global`, TVL context from `defi`, breadth from
`movers` and `top`. State the trend direction and what is driving it.

### Category rotation, trend, and new listings

```bash
tribes-cli market categories --limit 30
tribes-cli market history --days 30
tribes-cli market new --limit 25
```

### Fast structured numbers

```bash
tribes-cli market price --ids bitcoin,ethereum,solana
tribes-cli market search --query "render"
```

## Error recovery

| Symptom               | Action                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| Key-not-set error     | Provider unconfigured on this box — report it; do not retry or work around.  |
| Unknown option error  | Drop the extra flag — see the command reference for each subcommand's flags. |
| Any other API failure | Retry the same command once; if it fails again, stop and report the error.   |

## Related skills

- `token-analyst` — deep dive on one identified token; `fundamentals-analyst` — one coin's profile.
- `alpha-scout` — trending/new-token and smart-money discovery before a token is chosen.
- `stock-analyst` — the securities pass for unscoped movers/opportunity questions.
- `commodity-analyst` — the commodities pass for unscoped movers/opportunity questions.
- `hyperliquid` — all-dex tradability and venue-quality check before trade ideas.
- `strategize` — full market briefing combining macro, news, odds, and ideas.
