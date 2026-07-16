---
name: market-strategist
description: >-
  Expert on market-WIDE crypto aggregates, never single-token deep dives. Handles: global market
  cap and BTC/ETH dominance, DeFi aggregates, coin ranking tables, daily top gainers and losers,
  category filters, trending coins, venue movers and funding extremes, quick multi-coin price
  lookups, and market-wide search. Call for "how's the market?", crypto rankings, crypto top
  movers, category rotation, or breadth questions. NOT for: one token's price, chart, or safety (use
  token-analyst); deep single-coin research (use fundamentals-analyst); pool or DEX-level TVL
  (use research-analyst); stock movers (use stock-analyst); numeric macro indicators (use macros).
allowed-tools: bash read
---

# Market Strategist

A playbook over the structured `tribes-cli market-data` group (CoinGecko Pro, JSON in seconds)
plus one Hyperliquid venue read — the remote market_strategist analyst is gone, so Pi composes
and interprets these numbers itself. Follows the market-data reliability invariants in AGENTS.md
(sources + timestamps, facts vs interpretation, partial results). Research-only: this skill never
places orders. Every command here is fast — no long bash timeouts needed.

## When to use

- "How is the crypto market?" — global market cap, BTC/ETH dominance, DeFi aggregates, breadth.
- Crypto ranking tables, daily top gainers/losers, category performance, market breadth.
- Quick multi-coin price checks and market-wide coin search (name/symbol → CoinGecko id).
- Venue-side crypto movers and funding extremes via `hyperliquid movers`.
- NOT for a single token or coin — `token-analyst` (on-chain) or `fundamentals-analyst`
  (research profile; it also owns the `market-data coin` and `market-data ohlc` subcommands).
- NOT for trending/new-token discovery (`alpha-scout`); pool/DEX-level TVL or CEX/derivatives
  research (`research-analyst`); stock movers (`stock-analyst`); macro numbers (`macros`).
- Unscoped "top movers"/opportunity requests: also run the securities pass (`stock-analyst`)
  and the commodities pass (`commodity-analyst`) — cross-asset guardrail, see AGENTS.md.

## Command reference

All `market-data` subcommands accept `--out <file>`. Coin ids are CoinGecko ids (`bitcoin`, not
`BTC`) — resolve with `search` first.

| Command                | Purpose                                                                                                                                                              | Required flags |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `market-data global`   | Total mcap, volumes, BTC/ETH dominance                                                                                                                               | none           |
| `market-data defi`     | DeFi mcap, 24h volume, DeFi dominance                                                                                                                                | none           |
| `market-data top`      | Ranked coin table; `--limit 1-250`, `--page N`, `--category <slug>`, `--change 1h,24h,7d`, `--order` (market_cap_desc/asc, volume_desc/asc, id_asc/desc), `--vs usd` | none           |
| `market-data trending` | Trending coins by search popularity                                                                                                                                  | none           |
| `market-data prices`   | Price, mcap, 24h vol/change per coin (`--vs usd`)                                                                                                                    | `--ids`        |
| `market-data search`   | Resolve names/symbols to coin ids                                                                                                                                    | `--query`      |
| `hyperliquid movers`   | Live-filtered venue 24h movers + funding extremes (raw and %/hr); `--min-volume <usd>`, `--limit 1-50`                                                               | `--dex`        |

There is no order-by-change flag: "top gainers/losers" means sorting the `--change` fields of a
`top` page yourself, so the result is always "movers within the top N by market cap", never a
whole-market scan.

## Examples

### Quick multi-coin prices

```bash
tribes-cli market-data prices --ids bitcoin,ethereum,solana
```

Unknown id? Resolve first: `tribes-cli market-data search --query "render"`.

### Rankings and breadth (advancers vs decliners)

```bash
tribes-cli market-data top --limit 100 --change 24h --out /tmp/ms-top.json
```

Breadth recipe: count entries with 24h change > 0 (advancers) vs < 0 (decliners); nulls count as
neither, so state the counted total. The top 5 by that field each way are the daily
gainers/losers — label them "of the top 100 by market cap".

### Category rotation

```bash
tribes-cli market-data top --category artificial-intelligence --limit 25 --change 24h,7d
```

Slugs are CoinGecko category ids (e.g. `artificial-intelligence`, `meme-token`,
`decentralized-finance-defi`); there is no slug-listing command, and an empty result usually
means a wrong slug. Compare 2–3 categories' 24h/7d changes and label the rotation read as your
own calculation.

### Venue movers (Hyperliquid main dex)

```bash
tribes-cli hyperliquid movers --dex main --limit 10
```

The CLI applies the live filter (not delisted, priced, dayNtlVlm ≥ $1M default) and returns
funding extremes in BOTH raw hourly decimal and %/hr — no manual math. These are perp marks, not
spot prices. Before presenting any mover as a trade idea, verify tradability with
`tribes-cli hyperliquid list-assets --all-dexes` and split actionable / watchlist-only /
not-tradable (see AGENTS.md).

### Market overview ("how's the market?")

Run the four legs as ONE parallel batch, then compose:

```bash
tribes-cli market-data global --out /tmp/ms-global.json
tribes-cli market-data defi --out /tmp/ms-defi.json
tribes-cli market-data top --limit 100 --change 1h,24h,7d --out /tmp/ms-top.json
tribes-cli market-data trending --out /tmp/ms-trending.json
```

Report format — facts carry source + as-of; the last line is labeled interpretation:

```markdown
# Crypto market — <UTC timestamp>

- Global: mcap $<v> (<Δ24h%>), BTC dom <v>%, ETH dom <v>% [source: coingecko]
- DeFi: mcap $<v>, 24h vol $<v>, dominance <v>% [source: coingecko]
- Breadth: <adv>/<dec> of <counted> (24h, top 100); leaders <top 3> / laggards <top 3>
- Trending: <top 3 by search popularity>
- Read (interpretation, not a guarantee): <one line, e.g. "broad bid, BTC-led, DeFi lagging">
```

If a leg fails after one retry, compose from the remaining legs and name the gap.

## Error recovery

| Symptom                                  | Action                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report. |
| Any other API failure                    | Retry the same command once; if it fails again, stop and report the error.     |
| `prices` returns fewer coins than asked  | Unrecognized id — re-resolve with `market-data search` and rerun once.         |
| `top --category` comes back empty        | Likely a wrong slug (CoinGecko category id); correct it once, else report it.  |
| A command reports a missing provider key | Skip that leg and name it as a gap; do NOT silently substitute web search.     |

## Limitations

The first two gaps were previously covered by the deleted analyst agent — disclose them instead
of improvising:

- No market-cap-trend-over-time series: `global` is a single snapshot (24h change only). For
  multi-day direction, compare against prior entries in the strategize journal
  (`.tribes/journal/YYYY-MM-DD.md`); if none exist, say so rather than inventing a trend.
- No recently-added-coins feed: `trending` reflects search popularity, not listing recency; for
  new on-chain tokens use `alpha-scout`.
- "DeFi TVL" is answered with CoinGecko's DeFi market cap + dominance — a market-cap measure,
  not locked value; protocol- or pool-level TVL needs `research-analyst`.
- Gainers/losers come from one `top` page (max 250 coins) or one Hyperliquid dex — never a
  whole-market scan; venue movers are perp marks that can diverge from spot markets.
- All figures are provider snapshots, never guaranteed — carry source + as-of time.

## Related skills

- `token-analyst` — one identified token; `fundamentals-analyst` — one coin's research profile
  (owns `market-data coin`/`ohlc`).
- `alpha-scout` — trending/new-token and smart-money discovery before a token is chosen.
- `stock-analyst` / `commodity-analyst` — the securities and commodities passes for unscoped
  mover/opportunity questions.
- `hyperliquid` — all-dex tradability and the venue detail behind `movers`/`list-assets`.
- `market-pulse` — fast cross-asset regime snapshot composed from these same commands.
- `strategize` — full market briefing; its journal provides the trend-over-time comparison.
