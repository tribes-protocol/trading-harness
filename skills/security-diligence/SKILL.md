---
name: security-diligence
description: >-
  Pre-trade research gate for ONE stock/security perp on Hyperliquid: live venue read, daily
  trend from official market data, catalyst and earnings-proximity check from news, optional
  regulatory odds, composed into a PASS / CAUTION / FAIL verdict with evidence. Call it BEFORE
  longing or shorting a stock perp the account has not recently vetted. NOT for: raw stock
  quotes or candles (use stock-analyst); the microstructure/cost half at size (use
  execution-quality); on-chain token safety (use token-diligence); commodity research (use
  commodity-analyst); the trade decision itself (use thesis).
allowed-tools: bash read
---

# Security Diligence

A playbook, not a command group: the stock-perp counterpart of `token-diligence`. Composes the
venue read, `stocks` data, and `news` into one "should I touch this name right now?" verdict.
Research only — it never places orders. Follows the market-data reliability invariants in
AGENTS.md. Sizing/cost math is NOT duplicated here — that is `execution-quality`.

## What it accomplishes

Catches the stock-specific risks a perp trader walks into blind: an earnings print or binary
catalyst inside the holding window, a halt/fraud/delisting story, a gap between the perp mark
and the last official close, squeeze-priced funding, and off-hours gap risk — with evidence,
before capital is committed.

## When to use

- Before opening a position in a stock/security perp (`xyz:`-style names) the account has not
  vetted in the last 24h, or when `thesis` debates a stock-perp candidate.
- A user asks "is it safe to short <TICKER> here?" — this gate plus `execution-quality`.
- NOT for quotes/candles (`stock-analyst`), on-chain tokens (`token-diligence`), commodities
  (`commodity-analyst`), or deciding the trade (`thesis`).

## Inputs required

- Ticker. Resolve the hosting dex and EXACT coin (e.g. `xyz:TSLA`) from the all-dex sweep
  (`hyperliquid` skill) — reuse this session's sweep file when fresh; never assume a dex.
- Side, intended USD size (assume $500 and say so if the user gave none), and holding horizon
  (assume 24h and say so).

## Procedure

Steps 1–3 are independent — run as ONE parallel batch. Steps 4–5 are optional add-ons.

1. Venue live read (`hyperliquid` skill; from the sweep or one dex read):

   ```bash
   tribes-cli hyperliquid list-assets --dex <resolved-dex> --out /tmp/sd-venue.json
   ```

   Keep the asset's `markPx`, `prevDayPx` (24h move = `markPx / prevDayPx − 1`), `funding` (a
   DECIMAL FRACTION per hour: raw 0.0000125 = 0.00125%/hr — ×100 for %/hr), `openInterest`,
   `dayNtlVlm`, `isDelisted`, and margin flags. Perps trade when the underlying market is
   closed — off-hours the mark embeds after-hours information and gap risk at the next cash
   open.

2. Official daily trend (`stock-analyst` fast path):

   ```bash
   tribes-cli stocks eod --symbols <TICKER> --limit 30 --out /tmp/sd-eod.json
   ```

   30 daily bars, newest first: trend direction, distance from the 30-day high/low, yesterday's
   close vs the venue mark (divergence = mark vs `close` of the newest bar). Escalate to
   `tribes-cli technicals indicators --symbol <TICKER> --limit 120` when indicator math
   (RSI, ATR, levels) is actually needed.

3. Catalysts and earnings proximity (`news` skill):

   ```bash
   tribes-cli news headlines --query "<TICKER> OR <company name>" --size 10 --out /tmp/sd-news.json
   ```

   Look for: earnings date mentions, guidance, halts, investigations/fraud, M&A, analyst
   actions. Earnings proximity is BEST-EFFORT from headlines — no earnings-calendar API is
   integrated; if the next print's timing cannot be established, record it as UNKNOWN (a
   caution flag, never a pass). When the fast pass is ambiguous or stakes are high, run the
   analyzed path: `timeout 300 tribes-cli news fetch --kind stock --ticker <TICKER>`.

4. Optional — regulatory/macro binary odds (`prediction` skill; no `--out` in that group):

   ```bash
   tribes-cli prediction search --query "<sector or regulatory topic>" --limit-per-type 5
   ```

   Only when the name has a live binary (e.g. crypto-exposed names vs regulation, chip names vs
   export rules). Odds are supporting evidence, never a signal by themselves.

5. Optional — profile context: `tribes-cli stocks ticker --symbol <TICKER>` (sector, industry)
   when unfamiliar with the name.

## Verdict rules

Hard gates — ANY one → **FAIL** (do not trade; report which gate and the raw field):

- Not listed on any dex after a FULL sweep read, or `isDelisted` true.
- Venue quality data missing/zero (`markPx`, `dayNtlVlm`, `openInterest`) — not actionable.
- Credible ≤48h halt, delisting, or fraud/investigation headline on the name.

Caution flags — TWO or more → **CAUTION** (reduced size / tighter stop, flags stated):

- Earnings or a named binary catalyst inside the holding horizon — or timing UNKNOWN after
  step 3 (unknowns count as flags, never as passes).
- |raw funding| ≥ 0.00005 (= 0.005%/hr) against the intended side (squeeze/crowded pricing).
- Venue mark vs last official close divergence > 5% with no headline explaining it.
- `dayNtlVlm` < 100× intended size, or `openInterest × markPx` < 200× intended size — the same
  size-pressure limits as `execution-quality` (> 1% of day volume, > 0.5% of OI).
- Underlying cash market currently closed (gap risk at the open) when the horizon crosses an
  open; 24h |move| ≥ 10% (chasing an extended move).

Otherwise → **PASS** at the stated size — meaning "no red flags found", never "safe". The
verdict authorizes nothing; sizing and entry method go through `execution-quality` and
`trade-execution`.

## Output template

```markdown
# Security diligence — <TICKER> (<dex:coin>) <side> ~$<size> — <UTC timestamp>

**Verdict: <PASS | CAUTION | FAIL>** — confidence <high | medium | low>

| Check         | Value                                      | Source + as-of    |
| ------------- | ------------------------------------------ | ----------------- |
| Venue         | mark $<v>, 24h <Δ%>, OI $<v>, vol $<v>     | hyperliquid, <t>  |
| Trend (30d)   | <direction, dist from 30d hi/lo>           | marketstack, <t>  |
| Mark vs close | <Δ%> vs official close $<v>                | computed, EOD lag |
| Funding       | <v>%/hr (<sign> for <side>)                | hyperliquid, <t>  |
| Catalysts     | <earnings date or UNKNOWN; headline leads> | newsdataio, <t>   |
| Odds          | <event — outcome at prob> or "none"        | polymarket, <t>   |

- Facts above; calculations: <24h move, divergence, size multiples>; interpretation: <read>.
- Unknowns: <missing fields, unresolved earnings timing>. Confidence reflects these.
```

## Error recovery

| Symptom                                  | Action                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.       |
| Marketstack key missing / quota exceeded | Trend from venue `prevDayPx` only; mark-vs-close check skipped; confidence ≤ medium. |
| `news fetch` slow path times out         | Proceed on the fast headlines; name the gap; earnings timing stays UNKNOWN.          |
| Ticker matches nothing on any dex        | Report `Not currently tradable on Hyperliquid` (AGENTS.md wording); watchlist only.  |
| Headlines return nothing for the name    | Not a clean bill — record "no coverage found" as an unknown, not a pass.             |

## Limitations

- Earnings timing is inferred from headlines, not a calendar API — an unflagged imminent print
  is possible; that is why unknown timing is itself a caution flag.
- Venue marks embed after-hours trading; the official-close comparison lags by design (EOD).
- Headlines are leads with provider sentiment, not analyzed bullish/bearish sentiment (`news
fetch` provides that). A PASS is never a guarantee — it means no red flags were found.

## Related skills

- `execution-quality` — the microstructure/cost half; run both before sizing.
- `stock-analyst` — the stock-data playbook that owns the `stocks` commands.
- `technical-analyst` — indicator math on the candles when the trend read needs it.
- `news` — owns `headlines` and the analyzed `fetch --kind stock` path.
- `prediction` — regulatory/macro binary odds.
- `thesis` — consumes this verdict in its research pack for stock-perp candidates.
- `token-diligence` — the on-chain counterpart; `commodity-analyst` — the commodity counterpart.
- `hyperliquid` — the all-dex sweep this gate resolves the market from.
