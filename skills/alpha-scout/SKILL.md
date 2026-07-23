---
name: alpha-scout
description: >-
  Discovers opportunities BEFORE a specific token is chosen. Handles: trending tokens, new token
  listings, and smart-money flows and accumulation. Call to find what is hot or where smart money
  is rotating. NOT for: one identified token's price, safety, or trades (use token-analyst);
  market-wide rankings or top movers (use market-strategist); trending pools (use defi-analyst).
allowed-tools: bash read
---

# Alpha Scout

Backing command groups: `tribes-cli smart-money` (Nansen smart-money netflows, holdings, and
trades), plus `tribes-cli token-data trending` / `token-data new-listings` (BirdEye) and
`tribes-cli market trending` (CoinGecko search popularity) — all structured JSON, answering in
seconds. YOU are the scout: pull the numbers with the subcommands below and do the
interpretation — intersecting lists, spotting rotation, ranking candidates — yourself. There
is no backend specialist behind this skill and no free-text query subcommand.

## When to use

- "What's trending?" / "What's hot right now?" — `token-data trending` + `market trending`,
  cross-checked against smart-money flows.
- "What are whales / smart money buying?" — `smart-money netflow`, `holdings`, `dex-trades`,
  `perp-trades`, `dcas`.
- "Any new tokens worth watching?" — `token-data new-listings`, then a smart-money validation pass.
- Per-token cohort flows or top-trader PnL BEFORE committing to a deep dive —
  `smart-money flow-intelligence`, `pnl-leaderboard`.
- NOT for one identified token's price, security, or trades — use `token-analyst`.
- NOT for market-wide rankings, global caps, or top gainers/losers — use `market-strategist`.
- NOT for trending or new pools and DEX pairs — use `defi-analyst`.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. There are no free-text filters — encode filters with the exact flags in the reference below
   and apply any remaining filtering (e.g. excluding stablecoins) yourself on the JSON.
3. Mind the chain defaults: `smart-money` defaults to `--chain all` (except `token-list`,
   `screener`, and `historical-holdings`, which default to `ethereum` and do not accept `all`);
   `token-data` defaults to `--chain solana`. Pass `--chain` explicitly when the user scopes a
   chain.
4. `--token` is a SYMBOL for `perp-trades`, `dcas`, and `perp-leaderboard`; it is a token
   ADDRESS for every other subcommand that takes it.
5. Before presenting discoveries as actionable trade ideas, verify Hyperliquid tradability with
   `hyperliquid list-assets --all-dexes` and split actionable, watchlist-only, and not-tradable
   markets (see AGENTS.md).
6. For unscoped opportunity requests, also run the securities side via `stock-analyst` and the
   commodities side via `commodity-analyst` (cross-asset guardrail, see AGENTS.md).
7. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.

## Command reference

Every subcommand accepts `--out <file>`. All read-only.

### `tribes-cli smart-money` (Nansen)

| Subcommand            | Purpose                                                                     | Required flags                 | Useful flags                                                                                               |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `netflow`             | Token netflows by smart money, largest 24h inflow first                     | none                           | `--chain` (default all), `--limit` (1-100, default 20), `--token <address>`                                |
| `holdings`            | Tokens smart money currently holds, largest USD value first                 | none                           | `--chain` (default all), `--limit`, `--token <address>`                                                    |
| `dex-trades`          | Latest smart-money DEX trades                                               | none                           | `--chain` (default all), `--limit`, `--token <address>` (bought token)                                     |
| `perp-trades`         | Latest smart-money Hyperliquid perp trades                                  | none                           | `--limit`, `--token <symbol>` (e.g. BTC)                                                                   |
| `dcas`                | Latest smart-money DCA orders (Solana), newest first                        | none                           | `--limit`, `--token <symbol>` (accumulated token)                                                          |
| `token-list`          | Token screener restricted to smart-money activity, highest volume first     | none                           | `--chain` (default ethereum, no all), `--limit`, `--timeframe 5m\|10m\|1h\|6h\|24h\|7d\|30d` (default 24h) |
| `flow-intelligence`   | Per-cohort netflows (smart traders, whales, exchanges) for one token        | `--token <address>`, `--chain` | `--timeframe 5m\|1h\|6h\|12h\|1d\|7d` (default 1d)                                                         |
| `pnl-leaderboard`     | Top trader PnL leaderboard for one token over the last 30 days              | `--token <address>`, `--chain` | `--limit` (1-100, default 20)                                                                              |
| `screener`            | General token screener across all traders (not smart-money-only)            | none                           | `--chain` (default ethereum, no all), `--limit`, `--timeframe 5m\|10m\|1h\|6h\|24h\|7d\|30d` (default 24h) |
| `flows`               | Daily token flow time series (inflows/outflows, DEX vs CEX), newest first   | `--token <address>`, `--chain` | `--timeframe 1d\|7d\|30d` (default 30d)                                                                    |
| `who-bought-sold`     | Top buyers and sellers of a token over the last 30 days by trade volume     | `--token <address>`, `--chain` | `--limit` (1-100, default 20)                                                                              |
| `signals`             | Nansen risk and reward indicator scores for one token                       | `--token <address>`, `--chain` |                                                                                                            |
| `transfers`           | Recent transfers of a token (last 30 days), newest first                    | `--token <address>`, `--chain` | `--limit` (1-100, default 20)                                                                              |
| `historical-holdings` | Daily smart-money holdings snapshots over the last 30 days, newest first    | none                           | `--chain ethereum\|base\|bnb\|monad\|solana` (default ethereum, no all), `--limit`, `--token <address>`    |
| `perp-leaderboard`    | Hyperliquid perp trader PnL leaderboard for one token over the last 30 days | `--token <symbol>` (e.g. BTC)  | `--limit` (1-100, default 20)                                                                              |
| `address-leaderboard` | Hyperliquid address leaderboard by total PnL over the last 30 days          | none                           | `--limit` (1-100, default 20)                                                                              |

### Discovery subcommands from other groups

| Command                   | Purpose                                    | Required flags | Useful flags                                             |
| ------------------------- | ------------------------------------------ | -------------- | -------------------------------------------------------- |
| `token-data trending`     | Trending tokens ranked by BirdEye          | none           | `--limit` (1-20, default 20), `--chain` (default solana) |
| `token-data new-listings` | Newly listed tokens with initial liquidity | none           | `--limit` (1-20, default 10), `--chain` (default solana) |
| `market trending`         | Trending coins by search popularity        | none           |                                                          |

## Examples

### What's hot right now (trending × smart-money intersect)

```bash
tribes-cli token-data trending --chain solana --limit 20
tribes-cli market trending
tribes-cli smart-money netflow --chain all --limit 20
tribes-cli smart-money token-list --chain ethereum --timeframe 24h
```

Intersect the lists yourself; report tokens appearing in BOTH trending and smart-money flows
first as strongest candidates, the rest secondary.

### Smart-money accumulation

```bash
tribes-cli smart-money netflow --chain solana --limit 30
tribes-cli smart-money holdings --chain solana --limit 30
tribes-cli smart-money dcas --limit 20
```

Filter out stablecoins and wrapped assets from the JSON yourself; rank by net inflow, then
confirm against holdings and DCA accumulation.

### New listings (then validate with a smart-money overlap pass)

```bash
tribes-cli token-data new-listings --chain solana --limit 10
tribes-cli smart-money dex-trades --chain solana --limit 50
```

Flag a new listing only when it also shows early smart-money buys or unusual volume.

### Pre-handoff check on one candidate

```bash
tribes-cli smart-money flow-intelligence --token <address> --chain solana --timeframe 1d
tribes-cli smart-money pnl-leaderboard --token <address> --chain solana --limit 20
```

## Post-discovery checklist

1. Verify Hyperliquid tradability before presenting ideas as executable (AGENTS.md guardrail).
2. IF the request was unscoped, THEN add securities (`stock-analyst`) and commodities
   (`commodity-analyst`) passes; see AGENTS.md.
3. Hand off a chosen token: on-chain deep-dive → `token-analyst`; profile → `fundamentals-analyst`.

## Error recovery

| Symptom               | Action                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Key-not-set error     | Provider unconfigured on this box — report it; do not retry or work around.                 |
| Unknown option error  | Drop the extra flag — see the command reference for each subcommand's flags.                |
| Empty result          | Widen `--timeframe`/`--limit` or drop the `--token` filter once; if still empty, report it. |
| Any other API failure | Retry the same command once; if it fails again, stop and report the error.                  |

## Related skills

- `token-analyst` — deep-dive on one identified token (price, security, trades, holders).
- `fundamentals-analyst` — research profile of one listed coin.
- `market-strategist` — market-wide rankings, movers, and category rotation.
- `defi-analyst` — trending pools and DEX pairs.
- `hyperliquid` — tradability verification and execution for discovered ideas.
