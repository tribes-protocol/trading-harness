---
name: market-strategist
description: >-
  Expert on market-WIDE crypto aggregates, never single-token deep dives. Handles: global market
  cap and BTC dominance, DeFi TVL, market-cap trends over time, coin ranking tables, daily top
  gainers and losers, category performance, recently added coins, quick multi-coin price lookups,
  and market-wide search. Call for "how's the market?", crypto rankings, crypto top movers,
  category rotation, or broad trend questions. NOT for: one token's price, chart, or safety (use
  token-analyst); deep single-coin research (use fundamentals-analyst); pool or DEX-level TVL
  (use research-analyst); stock movers (use stock-analyst); numeric macro indicators (use macros).
allowed-tools: bash read
---

# Market Strategist

Backing command group: `tribes-cli market-strategist`. Sends one natural-language question to the
market_strategist specialist and prints its market-wide crypto analysis.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

Deterministic fast path: `tribes-cli market-data` (CoinGecko-backed, structured JSON, seconds
instead of minutes) covers quick multi-coin prices, global caps/dominance, rankings, trending,
one-coin profiles, OHLC candles, and coin search — prefer it for raw numbers; use `ask` when the
question needs interpretation (category rotation, "how's the market" narrative, TVL trends).

## When to use

- "How is the crypto market?" — global market cap, BTC dominance, DeFi TVL.
- Crypto ranking tables, daily top gainers/losers, market-cap trends over time.
- Category rotation, recently added coins, quick multi-coin price checks, market-wide search.
- NOT for a single token or coin — use `token-analyst` (on-chain) or `fundamentals-analyst` (profile).
- NOT for trending-token discovery (`alpha-scout`); pool/DEX-level or CEX/derivatives data has no structured source — use `research-analyst`.
- NOT for stock movers (`stock-analyst`) or numeric macro indicators like CPI/VIX/DXY (`macros`).

## Hard rules

1. `ask` is the ONLY subcommand and `--query` is its ONLY flag — no `--out`, no filter flags.
   NEVER invent subcommands such as `gainers` or `chart`.
2. Encode time window, scope, and metric focus inside the query text.
   Wrong: `--query "gainers"`. Right: `--query "top 10 gainers over the last 24h with market caps"`.
3. MUST set a bash timeout of at least 120 seconds for this command — it polls a backend agent.
4. Output is one free-text analysis string on stdout, not JSON — NEVER JSON-parse it. The CLI
   calls the API itself — NEVER call the endpoint or curl directly.
5. Before presenting movers or rankings as actionable trade ideas, verify Hyperliquid
   tradability with `hyperliquid list-assets --all-dexes` and split actionable, watchlist-only,
   and not-tradable markets (see AGENTS.md).
6. For unscoped "top movers" or opportunity requests, also run the securities side via
   `stock-analyst` and the commodities side via `commodity-analyst` (cross-asset guardrail, see
   AGENTS.md).
7. Treat the specialist's trailing "want me to…" suggestions as your own refinement TODOs, max
   1–2 passes (see AGENTS.md).

## Command reference

| Subcommand | Purpose                                          | Required flags | Read-only or signed |
| ---------- | ------------------------------------------------ | -------------- | ------------------- |
| `ask`      | Free-text market-wide question to the specialist | `--query`      | read-only           |

Fast-path group `tribes-cli market-data` (structured JSON; all subcommands accept `--out`):

| Subcommand | Purpose                                                 | Required flags   |
| ---------- | ------------------------------------------------------- | ---------------- |
| `prices`   | Quick multi-coin prices + mcap + 24h change             | `--ids`          |
| `top`      | Ranked coin table (`--limit`, `--change 1h,7d`)         | none             |
| `global`   | Global market cap, volumes, BTC/ETH dominance           | none             |
| `trending` | Trending coins by search popularity                     | none             |
| `coin`     | Compact one-coin research profile                       | `--id`           |
| `ohlc`     | OHLC candles (`--days 1\|7\|14\|30\|90\|180\|365\|max`) | `--id`, `--days` |
| `search`   | Resolve names/symbols to CoinGecko ids                  | `--query`        |

Coin ids are CoinGecko ids (`bitcoin`, not `BTC`) — resolve with `market-data search` first.
If a `market-data` command reports its key is not set, fall back to `ask`.

## Examples

### Market overview ("how's the market?")

```bash
tribes-cli market-strategist ask \
  --query "global crypto market overview for the last 24h: total market cap, BTC dominance, DeFi TVL, top gainers and losers"
```

### Top movers with rankings context

```bash
tribes-cli market-strategist ask \
  --query "top 10 crypto gainers and losers over the last 24h with market caps, plus top 20 coins by market cap with 7d performance"
```

### Category rotation, trend, and new listings

```bash
tribes-cli market-strategist ask \
  --query "category performance for AI, DeFi, and meme sectors over 7d, total market cap trend over 30 days, and notable coins added this week"
```

### Fast structured numbers (no specialist round-trip)

```bash
tribes-cli market-data prices --ids bitcoin,ethereum,solana
tribes-cli market-data top --limit 50 --change 1h,24h,7d
tribes-cli market-data global
```

## Error recovery

| Symptom                                  | Action                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report. |
| Command killed before output             | You set too short a bash timeout — rerun with a 300-second timeout.            |
| Unknown option error                     | Drop the extra flag — `--query` is the only flag.                              |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.     |

## Related skills

- `token-analyst` — deep dive on one identified token; `fundamentals-analyst` — one coin's profile.
- `alpha-scout` — trending/new-token and smart-money discovery before a token is chosen.
- `stock-analyst` — the securities pass for unscoped movers/opportunity questions.
- `commodity-analyst` — the commodities pass for unscoped movers/opportunity questions.
- `hyperliquid` — all-dex tradability and venue-quality check before trade ideas.
- `strategize` — full market briefing combining macro, news, odds, and ideas.
