---
name: commodity-analyst
description: >-
  Commodity research playbook for Hyperliquid perps. Composes macro data, commodity-news fallback,
  source-backed supply/demand research, technical analysis, and an all-dex venue-quality scan.
  Call for commodity discovery, a commodity trade thesis, or commodity-market context. NOT for a
  single macro number (use macros), an equity quote (use stock-analyst), an on-chain token, or
  placing the order (use trade-execution).
allowed-tools: bash read
---

# Commodity Analyst

A playbook, not a remote CLI endpoint. It composes existing skills to research commodity perps
that are actually usable on Hyperliquid. There is no commodity-specific analyst command and no
commodity `news fetch` kind; do not invent either one.

## When to use

- An unscoped opportunity scan needs its mandatory commodity pass.
- The user asks about a metal, energy, agricultural, or other commodity market.
- A thesis desk needs commodity fundamentals, catalyst context, technicals, and venue quality.
- NOT for a single macro reading such as gold or Brent — use `macros`.
- NOT for a stock, index, or company fundamental question — use `stock-analyst`.
- NOT for an order — pass an approved, quality-cleared market to `trade-execution`.

## Hard rules

1. Start with Hyperliquid discovery. Run `list-assets --all-dexes` and use `list-exchanges` only
   when a venue label needs resolving. Never assume a particular HIP-3 dex hosts a commodity.
2. The commodity-news path is the `news` web fallback: `news fetch` has no commodity kind. Use
   the targeted `web-search` sequence below and retain dated sources; use `browser` only for a
   blocked or JS-gated source.
3. Research a market only after preserving its exact Hyperliquid dex and coin symbol. External
   benchmarks or futures names are context, not proof that the Hyperliquid market is tradable.
4. A listed HIP-3 commodity is actionable only when live market data supports the intended order:
   `referencePx`; coherent `midPx` and `oraclePx` when exposed; current `dayNtlVlm`,
   `dayBaseVlm`, and `openInterest`; plus acceptable `impactPxs`. Missing, zero, stale, or
   inconsistent quality data, or `isDelisted`, is a watchlist result. Preserve any
   isolated-margin constraint returned by the venue.
5. Do not impose a desk size or leverage ceiling. The venue's `maxLeverage`, minimum notional,
   free margin, market quality, and the risk review remain binding constraints.

## Procedure

### 1. Discover commodity markets across the venue

```bash
tribes-cli hyperliquid list-assets --all-dexes
```

From the complete asset inventory, identify commodity markets (metals, energy, agricultural, or
other real-asset references), record `dex` and `coin`, and keep a short candidate set. Run
`list-exchanges` only if the all-dex output needs a venue label resolved. A name that resembles a
commodity but is absent from the inventory is watchlist context only.

### 2. Establish the macro backdrop

```bash
tribes-cli macros market
```

Use the available dollar, rates, inflation, gold, and Brent readings as context. Treat a missing
macro series as a stated gap; do not replace it with a stale value.

### 3. Research supply, demand, and the catalyst calendar

```bash
tribes-cli web-search search \
  --query "{COMMODITY} supply demand inventories policy weather geopolitical drivers scheduled catalysts {HORIZON}"
tribes-cli web-search extract --url "{PRIMARY_OR_INDUSTRY_SOURCE_URL}"
```

Extract the 1–3 most primary or industry sources from the results, keep the URL for each claim,
and state yourself what would support or invalidate a {SIDE} thesis (the `research-analyst`
composition pattern).

This is the source-backed structural leg. It is not a price or venue-data substitute.

### 4. Collect commodity headlines through the news fallback

```bash
tribes-cli web-search search \
  --query "{COMMODITY} supply demand inventories policy weather geopolitics market news {HORIZON}"
```

Retain recent, attributable headlines and cross-check the strongest claim against a primary or
industry source. If a selected source is blocked or JS-rendered, use `browser`; do not bypass a
paywall, CAPTCHA, or access control.

### 5. Check structure and levels

Pull candles for a liquid proxy of the commodity (an ETF proxy via `stocks candles` — e.g.
GLD for gold, USO for oil; see the technical-analyst skill) and compute the structure
yourself:

```bash
tribes-cli stocks candles --symbol {PROXY_TICKER} --limit 200 --out /tmp/{COIN}-candles.json
tribes-cli ta indicators --candles-file /tmp/{COIN}-candles.json --set ema,rsi,macd,atr
tribes-cli ta levels --candles-file /tmp/{COIN}-candles.json
```

Derive trend, support/resistance, a proposed entry, target, and invalidation from the
indicator and level JSON. The target and invalidation must come from structure and
volatility (ATR), not a fixed percentage bracket.

### 6. Run the final venue-quality review

```bash
tribes-cli hyperliquid list-assets --all-dexes
```

Confirm the exact coin remains listed and inspect its live quality data. Compare `referencePx`,
`midPx`, and `oraclePx`; inspect `dayNtlVlm`, `dayBaseVlm`, `openInterest`, and `impactPxs` for
current activity and expected price impact at the intended size. Check the venue's `maxLeverage`
and exchange-enforced minimum notional, and reject `isDelisted` markets. Honor any
isolated-margin constraint. If the output cannot support a quality judgment, do not infer liquidity
from an external benchmark; call it `Listed but not currently actionable`.

## Return format

Return only this decision pack:

```text
MARKET: <DEX>:<COIN> | listed | watchlist-only
MACRO DRIVERS: <dollar/rates/inflation/related-commodity context>
SUPPLY / DEMAND: <what is tightening or loosening, with source-backed mechanism>
CATALYSTS: <dated upcoming items or none>
TECHNICAL POSTURE: <trend, entry area, target, invalidation, horizon fit>
VENUE QUALITY: <live price and activity/OI/impact evidence, or exact missing/inconsistent data>
SUPPORTS SIDE?: supports | mixed | opposes
GAPS: <unavailable source, missing market data, or none>
```

## Error recovery

| Symptom                                  | Action                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report. |
| Research analyst fails                   | Retry once; then use the news fallback and state the research gap.             |
| Search or source is blocked              | Use `browser` for that URL only; never bypass access controls.                 |
| Market data is absent or inconsistent    | Keep it watchlist-only and refine once for a liquid listed substitute.         |

## Related skills

- `macros` — numeric gold, Brent, rates, dollar, inflation, and volatility context.
- `news` — owns the commodity-news fallback sequence.
- `research-analyst` — cited supply/demand and policy research.
- `web-search` — first fallback hop for commodity headlines.
- `browser` — only for JS-gated or blocked sources.
- `technical-analyst` — trend, volatility, entry, target, and invalidation analysis.
- `hyperliquid` — all-dex discovery, venue quality, and execution mechanics.
- `thesis` — judge-led debate for a selected commodity candidate.
- `trade-execution` — places a quality-cleared trade after authorization.
