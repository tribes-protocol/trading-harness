---
name: fundamentals-analyst
description: >-
  Research-grade profile of ONE listed coin via CoinGecko. Handles: descriptions, links,
  community/developer metrics, historical charts over custom date ranges, raw OHLCV candles (no
  indicator math), circulating/total supply trends, which exchanges list a coin, contract
  addresses per chain, and fiat rates. Call for deep coin research, historical performance,
  supply analytics, or listing coverage. NOT for: on-chain safety/trade forensics (use
  token-analyst); indicator math or backtests (use technical-analyst); coin discovery (use
  alpha-scout); quick prices or market-wide rankings (use market-strategist).
allowed-tools: bash read
---

# Fundamentals Analyst

Backing command group: `tribes-cli fundamentals-analyst`. Queries CoinGecko for coin research
data and returns JSON.
Requires `COIN_GECKO_PRO_API_KEY` in the environment (already set in `.env`).

## When to use

- Full research profile of one listed coin (description, links, community/dev metrics).
- Historical charts (price, volume, market cap) or raw OHLC candles over explicit date ranges.
- Supply trends, exchange listings for a coin, contract-address lookup, fiat rates.
- NOT for on-chain safety, holders, or live trade flow — use `token-analyst`.
- NOT for indicator math or backtests on the candles — use `technical-analyst`.
- NOT for discovering trending or new coins — use `alpha-scout`.
- NOT for market-wide rankings or quick price tables — use `market-strategist`.

## Hard rules

1. Every coin command is keyed by the **CoinGecko coin ID**, which is not the symbol: `render-token`,
   not `RNDR`. When unsure, run `search` first and use the `id` it returns. A wrong ID fails with
   `coin not found`, never a silent wrong coin.
2. Output is JSON on stdout. Every subcommand also accepts `--out <file>`.
3. These commands answer in seconds; a default bash timeout is enough.
4. `--days` and `--from`/`--to` are alternatives: when both `--from` and `--to` are set, `--days`
   is ignored. State an explicit window in your reasoning; never say "recently".
5. `ohlc --days` accepts only `1`, `7`, `14`, `30`, `90`, `180`, `365`, `max` — any other number is
   rejected by CoinGecko. Use `--from`/`--to` for an arbitrary window.
6. Timestamps in output (`t`) are UNIX **seconds**; `--from`/`--to` take UNIX seconds too.
7. Relay exact figures. A `null` field means CoinGecko had no value — say so, never guess.

## Command reference

| Subcommand              | Purpose                                            | Required flags           | Read-only or signed |
| ----------------------- | -------------------------------------------------- | ------------------------ | ------------------- |
| `search`                | Resolve a name/symbol to a CoinGecko coin ID       | `--query`                | read-only           |
| `coin`                  | Profile: price, cap, supply, categories, links     | `--id`                   | read-only           |
| `history`               | Price/cap/volume snapshot on one date              | `--id --date`            | read-only           |
| `market-chart`          | Price, market cap, volume time-series              | `--id`                   | read-only           |
| `ohlc`                  | OHLC candles                                       | `--id`                   | read-only           |
| `supply-chart`          | Circulating or total supply history                | `--id --kind`            | read-only           |
| `tickers`               | Where a coin trades: exchange, pair, volume, trust | `--id`                   | read-only           |
| `contract`              | Profile by contract address instead of coin ID     | `--network --address`    | read-only           |
| `contract-market-chart` | Time-series by contract address                    | `--network --address`    | read-only           |
| `token-price`           | Spot price by contract address                     | `--platform --addresses` | read-only           |
| `exchange-rates`        | BTC-denominated fiat/crypto/commodity rates        | —                        | read-only           |
| `supported-currencies`  | Quote currencies the pricing endpoints accept      | —                        | read-only           |

Common options: `--vs <currency>` (default `usd`), `--days <n|max>`, `--from`/`--to` (UNIX
seconds), `--limit <n>` (most recent N points), `--out <file>`. `coin` takes `--community` and
`--developer` to include those metric blocks.

## Examples

### Resolve the ID, then pull the profile

```bash
tribes-cli fundamentals-analyst search --query "render"
tribes-cli fundamentals-analyst coin --id render-token --community --developer
```

### Historical chart and candles over an explicit window

```bash
tribes-cli fundamentals-analyst market-chart --id ethereum --days 90 --interval daily
tribes-cli fundamentals-analyst ohlc --id ethereum --days 30
```

### Where a coin trades

```bash
tribes-cli fundamentals-analyst tickers --id chainlink --order volume_desc --limit 10
```

### Start from a contract address

```bash
tribes-cli fundamentals-analyst contract --network ethereum --address 0x6982508145454ce325ddbe47a25d4ec3d2311933
```

## Error recovery

| Symptom                             | Action                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `COIN_GECKO_PRO_API_KEY is not set` | The key is missing from the environment. Stop and report; login cannot fix it. |
| `coin not found`                    | The ID is wrong. Run `search` to get the real `id`, then retry once.           |
| Any other API failure               | Retry the same command once; if it fails again, stop and report the error.     |
| Empty points/candles array          | Widen the window (`--days`, or `--from`/`--to`); then report the gap plainly.  |

## Related skills

- `token-analyst` — on-chain deep dive: security, holders, live trades.
- `technical-analyst` — indicator computation and backtests on candles.
- `alpha-scout` — discovery before a specific coin is chosen.
- `market-strategist` — market-wide caps, rankings, movers.
