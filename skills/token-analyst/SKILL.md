---
name: token-analyst
description: >-
  Deep-dives into ONE identified token using real-time on-chain data. Handles: live and
  historical on-chain prices and OHLCV candles, security and rug-risk audits (owner/creator,
  mint/freeze authority, top-holder concentration), on-chain trades and volume, holder tables,
  smart-money and whale flow on the token, wallet portfolios, contract-to-CoinGecko mapping,
  and name-to-address resolution. Call for any question about a specific token's price, safety,
  trades, holders, or flows. NOT for: coin profiles, supply trends, or exchange listings (use
  fundamentals-analyst); trending or new-token discovery (use alpha-scout); market-wide
  rankings or multi-coin CoinGecko prices (use market-strategist); pool or DEX analysis (use
  defi-analyst).
allowed-tools: bash read
---

# Token Analyst

Backing command groups: `tribes-cli token-data` (BirdEye per-token and wallet data), plus
`tribes-cli coin contract` (map a contract address to its CoinGecko profile) and
`tribes-cli smart-money flow-intelligence` (Nansen per-cohort flows on one token) — all
structured JSON, answering in seconds. YOU are the analyst: pull the numbers with the
subcommands below and do the interpretation — safety verdict, flow read, price narrative —
yourself. There is no backend specialist behind this skill.

## When to use

- Current price, liquidity, and volume snapshot for one identified token (`overview`, `price`).
- Security and rug-risk audit before touching a token (`security` + `holders` + `coin contract`).
- On-chain trade flow and whale/smart-money buys and sells (`trades` +
  `smart-money flow-intelligence`); a specific wallet's holdings (`wallet-portfolio`).
- Historical candles for one token (`ohlcv`), chained into `ta` for indicator math.
- NOT for coin profiles, supply trends, or exchange listings — use `fundamentals-analyst`.
- NOT for trending tokens, new listings, or smart-money discovery — use `alpha-scout`
  (`token-data trending` and `new-listings` exist here, but discovery workflows live there).
- NOT for market-wide rankings, top movers, or multi-coin CoinGecko price tables — use
  `market-strategist`.
- NOT for pool, pair, or DEX questions — use `defi-analyst`.

## Hard rules

1. Every subcommand prints structured JSON on stdout — parse it, never screen-scrape prose.
   All subcommands accept `--out <file>` to also write the JSON to a file.
2. `token-data` takes contract ADDRESSES, not symbols, and defaults to `--chain solana` — pass
   `--chain` explicitly for anything not on Solana. IF the symbol is ambiguous or the chain is
   unknown, THEN resolve first with `tribes-cli token search --query "<name or symbol>"` and
   check the result matches the intended token.
3. Chain flags differ per group: `token-data` uses BirdEye chain names (`--chain`, e.g.
   `solana|ethereum|base`); `coin contract` uses a CoinGecko asset platform id (`--platform`);
   `smart-money flow-intelligence` requires `--chain` (no `all`).
4. Render token addresses as tribes.xyz Markdown links, never bare addresses (see AGENTS.md).
5. Verify Hyperliquid tradability with `hyperliquid list-assets --all-dexes` before presenting
   a trade idea as actionable (see AGENTS.md).
6. If a command reports the provider key is not set, the capability is unavailable on this box —
   report that plainly instead of retrying or working around it.

## Command reference

Under `tribes-cli token-data`; every subcommand accepts `--out <file>` and (unless noted)
`--chain <chain>` (default `solana`). All read-only.

| Subcommand         | Purpose                                                                | Required flags                                         | Useful flags                                                                                                |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `price`            | Multi-token prices with 24h change and liquidity                       | `--addresses` (comma-separated)                        |                                                                                                             |
| `overview`         | Price, mcap, liquidity, volume, holders, trades                        | `--address`                                            |                                                                                                             |
| `security`         | Top-holder %, owner/creator, mint/freeze flags                         | `--address`                                            |                                                                                                             |
| `holders`          | Top token holders                                                      | `--address`                                            | `--limit` 1-100 (default 20)                                                                                |
| `trades`           | Recent swaps for a token, newest first                                 | `--address`                                            | `--limit` 1-50 (default 20)                                                                                 |
| `trending`         | Trending tokens ranked by BirdEye                                      | none                                                   | `--limit` 1-20 (default 20)                                                                                 |
| `new-listings`     | Newly listed tokens with initial liquidity                             | none                                                   | `--limit` 1-20 (default 10)                                                                                 |
| `ohlcv`            | OHLCV candles (t in epoch ms)                                          | `--address`, `--timeframe 1m\|5m\|15m\|1H\|4H\|1D\|1W` | `--from`/`--to` (epoch seconds)                                                                             |
| `wallet-portfolio` | Wallet token balances with USD values                                  | `--wallet`                                             |                                                                                                             |
| `mint-burn`        | Mint/burn transactions for supply-change analysis, newest first        | `--address`                                            | `--limit` 1-100 (default 20)                                                                                |
| `creation-info`    | Creation info: creator, deploy tx, creation time                       | `--address`                                            |                                                                                                             |
| `exit-liquidity`   | Estimated exit liquidity for multiple tokens                           | `--addresses` (comma-separated)                        | `--chain` (default `base`; endpoint is Base-only)                                                           |
| `trade-history`    | Windowed trade-activity totals: buys/sells and USD volumes             | `--address`                                            | `--time-frame` `1m\|5m\|30m\|1h\|2h\|4h\|8h\|24h\|3d\|7d\|14d\|30d\|90d\|180d\|1y\|alltime` (default `24h`) |
| `trade-data`       | Aggregated 24h trade metrics for multiple tokens                       | `--addresses` (comma-separated)                        |                                                                                                             |
| `transfer-total`   | Aggregate transfer totals over all history (Solana only; no `--chain`) | `--address`                                            |                                                                                                             |

Companion commands (same JSON + `--out` contract):

| Command                                    | Purpose                                                    | Required flags            | Useful flags                                       |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------- | -------------------------------------------------- |
| `tribes-cli coin contract`                 | Resolve a contract address to a coin id + core market data | `--platform`, `--address` |                                                    |
| `tribes-cli smart-money flow-intelligence` | Per-cohort netflows (smart traders, whales, exchanges)     | `--token`, `--chain`      | `--timeframe 5m\|1h\|6h\|12h\|1d\|7d` (default 1d) |
| `tribes-cli token search`                  | Resolve a name/symbol to chain + address                   | `--query`                 | full docs in the `spot-trading` skill              |

## Examples

### Price snapshot and whale flow (address known, Solana)

```bash
tribes-cli token-data overview --address EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm
tribes-cli token-data trades --address EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --limit 50
tribes-cli smart-money flow-intelligence \
  --token EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm --chain solana --timeframe 1d
```

Synthesize: level and liquidity from `overview`, tape from `trades`, and who is buying or
selling (smart traders vs whales vs exchanges) from `flow-intelligence`.

### Security / rug-risk audit (contract address known, Ethereum)

```bash
tribes-cli token-data security --address 0x6982508145454ce325ddbe47a25d4ec3d2311933 --chain ethereum
tribes-cli token-data holders --address 0x6982508145454ce325ddbe47a25d4ec3d2311933 --chain ethereum --limit 50
tribes-cli coin contract --platform ethereum --address 0x6982508145454ce325ddbe47a25d4ec3d2311933
```

Combine mint/freeze flags and owner/creator from `security`, concentration from `holders`, and
the CoinGecko identity check from `coin contract` into one verdict.

### Ambiguous symbol — resolve first, then pull data

```bash
tribes-cli token search --query "MOG"
tribes-cli token-data overview --address <resolved-address> --chain ethereum
```

### Candles into technical analysis

```bash
tribes-cli token-data ohlcv --address <address> --timeframe 4H --chain solana --out /tmp/candles.json
tribes-cli ta indicators --candles-file /tmp/candles.json
```

`ohlcv --out` writes the candle contract that `ta` consumes — indicator math, levels, and
backtests live in the `technical-analyst` skill.

## Error recovery

| Symptom                  | Action                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Key-not-set error        | Provider unconfigured on this box — report it; do not retry or work around.            |
| Unknown option error     | Drop the extra flag — see the command reference for each subcommand's flags.           |
| Empty/wrong-token result | Re-run with the exact chain + address from `tribes-cli token search`; check `--chain`. |
| Any other API failure    | Retry the same command once; if it fails again, stop and report the error.             |

## Related skills

- `fundamentals-analyst` — CoinGecko research profile of one listed coin.
- `alpha-scout` — discovery before a specific token is chosen.
- `market-strategist` — market-wide aggregates, rankings, and movers.
- `defi-analyst` — pools, pairs, and DEX activity.
- `technical-analyst` — indicator math, levels, and backtests on `ohlcv --out` candle files.
- `hyperliquid` — all-dex tradability check before trade ideas.
