---
name: execution-quality
description: >-
  Pre-order microstructure and cost check for ONE Hyperliquid market at an intended size:
  spread, expected impact, size vs volume and open interest, funding drag at leverage, venue
  constraints, and an external price cross-check, ending in a go / reduce-size / avoid read.
  Call it after the trade decision and before sizing an order. NOT for: whether to take the
  trade at all (use thesis); the end-to-end order flow (use trade-execution); on-chain token
  safety (use token-diligence); resizing decisions on open positions (use position-management).
allowed-tools: bash read
---

# Execution Quality

A playbook, not a command group: turns the AGENTS.md tradability guardrail into computed
numbers for one market at one size. Research only — it never places orders. Follows the
market-data reliability invariants in AGENTS.md. Commands are owned by the `hyperliquid`,
`market-strategist`, `token-analyst`, and `stock-analyst` skills.

## What it accomplishes

Before capital is committed: what entering and exiting <size> actually costs (spread + impact +
funding), whether the market can absorb it, whether the venue's mark agrees with the outside
world, and what the largest sensible size is — so orders are not placed into thin books or
against punitive carry.

## When to use

- `thesis` approved a trade (or the user named side + size) and the order is about to be sized.
- Choosing between market, ladder (`scale-perp`), or time-sliced (`twap-perp`) entry.
- A funding/carry question on a specific perp ("is holding this short expensive?").
- NOT for the trade decision itself (`thesis`) or placing the order (`trade-execution`).
- NOT for on-chain token contract safety — `token-diligence`.

## Inputs required

- The exact market: coin + hosting dex (resolve via all-dex discovery in `hyperliquid` if not
  already known from this session — reuse the sweep file, do not refetch).
- Intended notional (USD), side, leverage, and rough holding period (ask; without a horizon
  assume 24h and say so).

## Procedure

1. Venue data (`hyperliquid` skill) — reuse this session's sweep if fresh (<15 min):

   ```bash
   tribes-cli hyperliquid list-assets --dex <resolved-dex> --out /tmp/eq-venue.json
   ```

   Pull the asset's `markPx`, `midPx`, `oraclePx`, `referencePx`, `prevDayPx`, `impactPxs`
   (array: [bid-side, ask-side]), `dayNtlVlm`, `openInterest`, `funding` (an HOURLY rate as a
   DECIMAL FRACTION: raw 0.0000125 = 0.00125%/hr — the drag formula below uses the raw value
   directly), `premium`, `maxLeverage`, `szDecimals`, `isDelisted`, and the isolated-margin
   flags.
   `isDelisted` true, or missing/zero quality fields → verdict is **avoid** immediately
   (`Listed but not currently actionable`).

2. External price cross-check (pick ONE matching source; skip only if none exists):

   - Major crypto: `tribes-cli market-data prices --ids <coingecko-id> --out /tmp/eq-x.json`
   - Long-tail on-chain token: `tribes-cli token price --address <addr> --chain <chain>`
   - Security (stock perp): `tribes-cli stocks eod --symbols <TICKER> --latest` — an EOD close,
     so intraday divergence is expected; flag only direction-changing gaps (> 5%) and say the
     comparison is against yesterday's close. Off-hours, the perp also trades when the stock
     market is closed — mark the cross-check "stale by design".
   - Commodity perp: Brent/oil → `tribes-cli macros series --id DCOILBRENTEU --limit 2`
     (daily FRED data — same "stale by design" treatment as the stock row). Other commodities
     (metals, ags, natgas) have NO integrated spot source: proceed on venue data alone,
     confidence capped at medium, gap named.

   Live-vs-live divergence > 1% → flag; > 3% → treat the mark as suspect and re-fetch both once.

3. Compute (CALCULATIONS — label them as such, with the formulas):

   - Spread: `impactPxs[1] − impactPxs[0]`, in bps of mid. This IS the estimated round-trip
     cost — buy at the ask-side impact, sell at the bid-side impact (fees excluded). Do NOT add
     impact on top of it.
   - One-way entry cost for the side: `|impactPx(side) − midPx| / midPx` in bps (≈ half the
     spread; useful when only entering).
   - Size pressure: `notional / dayNtlVlm` and `notional / (openInterest × markPx)` — flag > 1%
     of daily volume or > 0.5% of OI.
   - Funding drag over the horizon, in USD: `funding × hours × notional` (raw decimal funding
     — e.g. raw 0.0000125 × 24h × $10,000 = $3.00/day). Funding accrues on NOTIONAL — leverage
     changes the margin at risk, not the USD funding amount (as a return on margin it is
     leverage× larger, which is why high-leverage carry hurts). Sign: positive funding costs
     longs and pays shorts.
   - Max sensible size: the largest notional keeping size pressure under the flags above.
   - Min notional: every order/leg/TWAP sub-order ≥ $10 (venue rule; see `hyperliquid`).

4. Read the verdict:
   - **go** — round-trip (spread) < 25 bps, size pressure under the flags, funding not punitive.
   - **reduce to $X / slice** — size pressure or impact too high at full size; recommend the
     max sensible size and `scale-perp`/`twap-perp` instead of a market order.
   - **avoid** — delisted/zero-quality market, suspect mark, or costs that consume the edge
     (e.g. round-trip cost ≥ the distance to the technical target).

## Output template

```markdown
# Execution quality — <COIN> (dex <name>) <side> $<notional> @ <lev>x — <UTC timestamp>

**Read: <go | reduce to $X (+ slice method) | avoid>** — confidence <high | medium | low>

- Mark <v> vs <external source> <v> → divergence <v>% [venue as-of <t>; <src> as-of <t>]
- Spread <v> bps ≈ round-trip cost (excl. fees); one-way entry impact (<side>) <v> bps
- Size pressure: <v>% of day volume ($<dayNtlVlm>), <v>% of OI
- Funding: <v>%/hr (<sign> for <side>) → est. $<v> over <horizon>h on $<notional> notional
- Constraints: maxLeverage <v>, margin mode <cross | isolated-required>, min $10/leg
- Facts above from venue/provider fields; bps and USD figures are computed; the read is
  interpretation. Gaps: <missing fields or failed cross-check, or "none">
```

Costs are estimates from current top-of-book impact data — they do not include taker fees and
can change by the time an order lands. Hand the read to `trade-execution`; it authorizes nothing
by itself.

## Validation

- Sanity: `midPx` between `impactPxs`; mark/oracle/mid within ~1% of each other for liquid
  markets (coherence check from the AGENTS.md guardrail). Funding: the venue caps rates at
  raw 0.04 (4%/hr) — |raw rate| beyond that is bad data; |raw rate| ≥ 0.001 (0.1%/hr) is
  extreme but VALID and is a punitive-carry verdict input, never a data inconsistency.
- If any field is internally inconsistent, re-fetch once; still inconsistent → **avoid** with
  the inconsistency reported, never a silently patched number.

## Error recovery

| Symptom                                  | Action                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report. |
| Asset missing from the dex section       | Re-run all-dex discovery per `hyperliquid` before concluding anything.         |
| External cross-check source unavailable  | Proceed on venue data alone; confidence at most medium; name the gap.          |
| `impactPxs` missing or zero              | Market is not actionable at size — **avoid**, cite the missing field.          |

## Limitations

- `impactPxs` reflects the venue's standard impact notionals, not necessarily YOUR size — for
  large orders the true impact is worse than computed; the size-pressure flags are heuristics.
- Funding changes hourly; the drag estimate assumes the current rate persists. Fees are not
  included. Stock cross-checks use EOD data (Marketstack) and commodity cross-checks daily FRED
  data — both lag by design; most commodity perps have no external cross-check at all.

## Related skills

- `hyperliquid` — owns `list-assets` and all venue fields this skill reads.
- `trade-execution` — runs this check between its tradability and sizing steps.
- `thesis` — desk-risk consumes this read for execution feasibility.
- `position-management` — resize/exit mechanics on existing positions.
- `token-diligence` — contract-level safety for on-chain tokens (different risk class).
- `market-strategist`, `token-analyst`, `stock-analyst`, `macros` — own the cross-check price
  commands.
- `security-diligence` — the research half (trend, catalysts) of a stock-perp pre-trade check.
