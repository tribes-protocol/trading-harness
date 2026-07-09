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

Backing command group: `tribes-cli fundamentals-analyst`. Sends a natural-language research
question to a CoinGecko-backed specialist and prints one plain-text analysis to stdout.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- Full research profile of one listed coin (description, links, community/dev metrics).
- Historical charts (price, volume, market cap) or raw OHLCV candles over explicit date ranges.
- Supply trends, exchange listings for a coin, contract-address lookup, fiat rates.
- NOT for on-chain safety, holders, or live trade flow — use `token-analyst`.
- NOT for indicator math or backtests on the candles — use `technical-analyst`.
- NOT for discovering trending or new coins — use `alpha-scout`.
- NOT for market-wide rankings or quick price tables — use `market-strategist`.

## Hard rules

1. The ENTIRE surface is `tribes-cli fundamentals-analyst ask --query "<question>"`. `ask` is
   the only subcommand and `--query` its only flag — no `--out`, no filter flags. Encode coin,
   timeframe, and output type inside the query text.
2. MUST set a bash timeout of at least 120 seconds for this command — it polls a backend agent
   and can run for minutes.
3. Output is one free-text analysis string on stdout, not JSON — read it, never parse fields.
4. Always state an explicit timeframe in historical queries ("last 90 days", "2026-04-01 to
   2026-07-01"). NEVER say "recently".
5. Bundle related asks into ONE query per research goal instead of many small calls.
6. Treat trailing follow-up suggestions as your own TODOs — at most 1–2 refinement `ask` calls.

## Command reference

| Subcommand | Purpose                                                | Required flags | Read-only or signed |
| ---------- | ------------------------------------------------------ | -------------- | ------------------- |
| `ask`      | Send one research question to the CoinGecko specialist | `--query`      | read-only           |

## Examples

Use the CoinGecko coin ID when known (lowercase, hyphenated: `bitcoin`, `ethereum`,
`render-token`). If unknown, put the name/symbol — or the contract address plus its chain
(`0x6982508145454ce325ddbe47a25d4ec3d2311933 on ethereum`) — in the query and let the
specialist resolve it.

### Full coin profile with supply trend

```bash
tribes-cli fundamentals-analyst ask \
  --query "Full profile for solana: description, links, community and developer activity, plus circulating vs total supply trend over the last 180 days"
```

### Historical chart with raw candles

```bash
tribes-cli fundamentals-analyst ask \
  --query "Price, volume, and market cap chart for ethereum from 2026-04-01 to 2026-07-01, plus daily OHLC candles for the last 30 days"
```

### Exchange listings and fiat rates for one coin

```bash
tribes-cli fundamentals-analyst ask \
  --query "Which exchanges list chainlink, what volume does each ticker do, and what is its current price in USD, EUR, and JPY?"
```

## Error recovery

| Symptom                                         | Action                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token)        | Run `tribes-cli login`, retry the original command once, then stop and report. |
| `Fundamentals analyst request failed: <status>` | Retry the same command once; if it fails again, stop and report the error.     |
| Answer says the coin is unknown                 | Re-ask with the coin's name, symbol, or contract address stated in the query.  |

## Related skills

- `token-analyst` — on-chain deep dive: security, holders, live trades.
- `technical-analyst` — indicator computation and backtests on candles.
- `alpha-scout` — discovery before a specific coin is chosen.
- `market-strategist` — market-wide caps, rankings, movers.
