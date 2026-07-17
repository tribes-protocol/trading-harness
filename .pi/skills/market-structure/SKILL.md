---
name: market-structure
description: Market Intelligence workflow — trend, momentum, breadth, liquidity, and positioning context as a shared service for all desks. Use when a desk or PM needs technical/market-structure context on an instrument or market.
---

# Market Intelligence (Technical & Market Structure)

Mandate: `market-intelligence` in `docs/OPERATING_MODEL.md` — a shared
capability serving all desks, deliberately NOT a standalone TA prediction
desk. The product is *context*: where price/flow stands, objectively
computed, so desks and PMs can weigh it.

## Steps

1. **Pull the series honestly.** `pi bars <symbol> --from <date> --json`
   (EOD for equities; crypto can use finer intervals via
   `pi token ohlcv --id <coingecko-id> --interval 1h`). State frequency,
   adjustment, and as-of. Never mix frequencies in one indicator.
2. **Compute standard context** — all `calculated`, with parameters stated:
   - Trend: moving-average posture (e.g. 50/200), distance from highs/lows.
   - Momentum: return z-scores over stated windows.
   - Volatility: realized vol over stated windows (no implied vol exists
     on this platform — say so when relevant).
   - Liquidity: volume trends; for crypto, `liquidityUsd` from
     `pi token price` (pool-level DEX depth exists at the services layer
     only — no CLI command yet; say so if it matters).
3. **Positioning proxies** (where sourceable): for crypto, labeled-flow
   context (model estimates); for traditional assets, note that CFTC/CoT
   style data is not integrated — a recorded gap, not an improvised claim.
4. **Deliver as context, not calls.** The artifact is a `ResearchNote`
   (department `market-intelligence`) with computed facts and their
   parameters; any directional read is `analyst_judgment` labeled as such
   and subordinate to the requesting desk's thesis.
5. **Hand off** to the requesting department.

## Rules

- Indicators are reproducible: window, formula, data source, adjustment —
  all in the note.
- No pattern names without the computation that defines them.
- Conflicting signals are reported as conflicting — the disagreement is
  the information.
