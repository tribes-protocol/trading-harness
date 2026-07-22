---
name: defi-analyst
description: >-
  Expert on DEX activity and liquidity pools. Handles: pool discovery and search, trending and
  new pools, pool metrics (TVL, volume, fees, FDV), pool OHLCV candles, pool trade activity,
  pair analysis, DEX listings per network, and supported-network lookups. Call when the pool,
  pair, or DEX is the subject. NOT for: one token's own price, safety, or trades (use
  token-analyst); trending-token discovery (use alpha-scout); CEX or derivatives volume (use
  exchange-analyst); market-wide caps/rankings (use market-strategist).
allowed-tools: bash read
---

# Defi Analyst

Backing command group: `tribes-cli onchain` — CoinGecko Pro / GeckoTerminal DEX and pool data
as structured JSON, answering in seconds. YOU are the analyst: pull the numbers with the
subcommands below and do the interpretation — pool quality, liquidity depth, volume trends —
yourself. There is no backend specialist behind this skill and no `ask` subcommand.

## When to use

- The subject is a liquidity pool, trading pair, or DEX — details (`pool`), candles
  (`pool-ohlcv`), trades (`pool-trades`).
- Discovering pools: trending (`trending-pools`), newest (`new-pools`), ranked per network or
  DEX (`top-pools`), by token name/symbol/address (`search`).
- Threshold questions (liquidity above $X, FDV below $Y): pull the pool lists and apply the
  thresholds yourself on the JSON fields — there are no filter flags.
- Listing DEXes on a network (`dexes`) or supported networks (`networks`).
- NOT for one token's price, security, or holders — use `token-analyst`.
- NOT for trending tokens or smart-money discovery — use `alpha-scout`.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. Network ids are GeckoTerminal ids (`eth`, `solana`, `base`) and DEX ids use underscores
   (`uniswap_v3`) — resolve with `networks` / `dexes` when unsure.
3. IF multiple pools match, THEN pick highest TVL with 24h volume above $100k, else ask to re-rank.
4. Render pool and token addresses shown to the user as tribes.xyz Markdown links (see AGENTS.md).
5. Before presenting pool findings as trade ideas, apply the Hyperliquid tradability guardrail
   (see AGENTS.md).
6. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.

## Command reference

All under `tribes-cli onchain`; every subcommand accepts `--out <file>`. All read-only.

| Subcommand       | Purpose                                                   | Required flags                                            | Useful flags                                  |
| ---------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| `networks`       | Supported onchain networks                                | none                                                      | `--limit` 1-100 (default 50)                  |
| `dexes`          | DEXes on a network                                        | `--network`                                               | `--limit` 1-100 (default 50)                  |
| `trending-pools` | Trending pools, all networks or one                       | none                                                      | `--network`, `--limit` 1-20 (default 20)      |
| `top-pools`      | Top pools on a network, optionally one DEX                | `--network`                                               | `--dex`, `--limit` 1-20 (default 20)          |
| `new-pools`      | Newest pools, all networks or one                         | none                                                      | `--network`, `--limit` 1-20 (default 20)      |
| `pool`           | One pool: price, FDV, reserve, volume, changes, tx counts | `--network`, `--address`                                  |                                               |
| `pool-ohlcv`     | Pool OHLCV candles (t in epoch ms)                        | `--network`, `--address`, `--timeframe minute\|hour\|day` | `--aggregate`, `--limit` 1-1000 (default 100) |
| `pool-trades`    | Recent trades in a pool                                   | `--network`, `--address`                                  | `--limit` 1-300 (default 50)                  |
| `search`         | Search pools by token name, symbol, or address            | `--query`                                                 | `--network`                                   |

## Examples

### Pool details by address

```bash
tribes-cli onchain pool --network eth --address 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640
```

### Top pools for a token

```bash
tribes-cli onchain search --query "SOL" --network solana
tribes-cli onchain pool --network solana --address <top-match-address>
```

Pick per hard rule 3, then compare liquidity, 24h volume, and fee/volume ratio yourself.

### Trending or new pools with thresholds

```bash
tribes-cli onchain trending-pools --network base --limit 20
tribes-cli onchain new-pools --network base --limit 20
```

Apply liquidity/FDV thresholds on the returned JSON — there are no filter flags.

### DEX rankings by network

```bash
tribes-cli onchain dexes --network arbitrum-one
tribes-cli onchain top-pools --network arbitrum-one --dex uniswap_v3 --limit 10
```

Rank DEXes by summing their top pools' volumes; drill into the leader with `--dex`.

### Pair OHLCV and recent trades

```bash
tribes-cli onchain pool-ohlcv --network eth --address 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --timeframe hour --limit 72
tribes-cli onchain pool-trades --network eth --address 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 --limit 50
```

For indicator work on a pool, chain `pool-ohlcv --out candles.json` into `tribes-cli ta` —
see the `technical-analyst` skill.

## Error recovery

| Symptom               | Action                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Key-not-set error     | Provider unconfigured on this box — report it; do not retry or work around.                           |
| Unknown option error  | Drop the extra flag — see the command reference for each subcommand's flags.                          |
| Empty results         | Retry once with a broader scope (drop `--network` or `--dex`, widen `--query`); then stop and report. |
| Any other API failure | Retry the same command once; if it fails again, stop and report the error.                            |

## Related skills

- `token-analyst` — one token's price, security, trades, holders.
- `alpha-scout` — trending tokens, new listings, smart-money discovery.
- `market-strategist` — market-wide caps, dominance, rankings, movers.
- `technical-analyst` — indicator computation and backtests on OHLCV candles (feed it `pool-ohlcv --out`).
- `hyperliquid` — all-dex tradability and venue-quality check before trade ideas.
