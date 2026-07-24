---
name: strategize
description: >-
  Full market-briefing playbook that composes macro numbers, news narrative, prediction-market
  odds, crypto, securities, and commodity ideas, plus a Hyperliquid venue-quality filter, into
  one cycle. Handles: "how are markets", market briefings, strategy-cycle runs, trading-plan
  refreshes, and the journal and evidence-gate conventions other skills reference. Call for any
  multi-source market overview or plan refresh. NOT for: placing or managing trades (use
  trade-execution or position-management); a single macro number (use macros); one asset's news
  (use news); event odds alone (use prediction).
allowed-tools: bash read
---

# Strategize

A playbook, not a command group: it composes existing `tribes-cli` commands into one market-
briefing cycle and defines the journal and evidence-gate conventions. Every leg's command is
documented in full by its owning skill. Requires an auth token (run `tribes-cli login` once if
commands fail with auth errors).

## When to use

- The user asks for a market briefing, "how are markets", a strategy cycle, or a trading-plan
  refresh — run the full procedure below.
- Another skill (`macros`, `news`, `prediction`) hands off for "the full picture".
- NOT for one macro number (VIX, CPI, 10y yield) — use `macros`.
- NOT for one asset's headlines or sentiment — use `news`.
- NOT for event odds on their own — use `prediction`.
- NOT for placing the resulting trade — use `trade-execution`.

## Hard rules

1. An unscoped briefing MUST include crypto, securities, and commodities. Skip a class only when
   the user explicitly scoped the request.
2. MUST set a bash timeout of at least 120 seconds (prefer 300) for the `news fetch` leg — it
   polls a backend pipeline.
3. Data legs print structured JSON — parse it and do the interpretation yourself, per each
   owning skill; never screen-scrape prose.
4. Evidence gate: NEVER open or increase a position from a single signal — odds alone, one
   indicator, or one headline is never enough. Require at least two independent supporting
   signals and the user's explicit go-ahead. A coherent conditional idea can be shown with a
   specific trigger; reject only when the edge is missing or a hard safety check fails. This skill
   produces briefings; `trade-execution` places trades.
5. MUST run the all-dex tradability and quality filter (step 7) on every candidate before
   presenting it as actionable — the Hyperliquid guardrail in AGENTS.md.
6. MUST append every briefing to the journal (convention below).

## Briefing procedure

Legs 1–6 are independent. IF the harness can spawn subagents, run them as one parallel batch,
with each subagent assigned exactly one leg and returning its findings. Without subagent support,
run the legs sequentially. If a leg fails, follow Error recovery and continue; step 7 runs after
the legs return because it needs the complete candidate list.

1. Macro numbers (`macros` skill):

   ```bash
   tribes-cli macros market
   ```

   Record the current dollar, yield, volatility, policy-rate, inflation, gold, and Brent readings
   that are available. State null or unavailable readings plainly rather than inventing a value.

2. Market narrative (`news` skill; timeout rule 2 applies):

   ```bash
   timeout 300 tribes-cli news fetch --kind perp --coin BTC
   ```

   BTC perp news supplies the crypto-market narrative. Commodity and broad macro topics have no
   dedicated news CLI kind; the mandatory `commodity-analyst` leg follows the `news` fallback
   chain with source-backed research. Retain dated, attributable headlines and their URLs only.

3. Event odds (`prediction` skill):

   ```bash
   tribes-cli prediction search --query "Fed rate cut" --limit-per-type 10
   ```

   Query events relevant to the current setup (rate decisions, elections, regulation, wars,
   supply disruptions). Cite the leading outcome and probability only when the market is active
   and relevant; odds are supporting evidence, never a stand-alone trade signal.

4. Crypto ideas (structured JSON — interpret the numbers yourself, per the market-strategist
   and alpha-scout skills):

   ```bash
   tribes-cli market movers --duration 24h
   tribes-cli market global
   tribes-cli market categories --limit 30
   tribes-cli smart-money netflow --limit 20
   tribes-cli token-data trending
   ```

5. Securities ideas (per the stock-analyst skill — movers and quotes have no native command,
   so derive them from the market narrative in leg 2 plus daily candles on candidate tickers):

   ```bash
   tribes-cli stocks search --query "{CANDIDATE_NAME}"
   tribes-cli stocks candles --symbol {TICKER} --limit 30
   ```

6. Commodity ideas (`commodity-analyst` skill):

   Run its full playbook: discover commodity markets across every Hyperliquid dex, combine macro
   data with supply/demand research and the news fallback, then return only candidates whose
   research is current enough to pass to step 7. This leg is mandatory even when the user only
   said "how are markets."

7. All-dex tradability and quality filter (`hyperliquid` skill) — for EVERY candidate from
   steps 4–6:

   ```bash
   tribes-cli hyperliquid list-assets --all-dexes --out /tmp/all-dexes.json
   tribes-cli hyperliquid list-assets --market spot
   ```

   Write the all-dex sweep to a file (`--out`) and read every dex section in full — it spans
   thousands of lines and truncates when read inline. Read the `xyz` dex FIRST (it hosts most
   stock and commodity perps), and never call a candidate not-tradable from a section you did not
   finish reading. Use `list-exchanges` only when the all-dex output needs a venue label resolved;
   never inspect only one named dex. Record the hosting dex and exact coin/pair. For every HIP-3 candidate, inspect the
   live quality data before calling it tradable: `referencePx`; coherent `midPx`/`oraclePx` when
   exposed; current `dayNtlVlm`, `dayBaseVlm`, and `openInterest`; and acceptable `impactPxs` for
   the intended size. Treat `isDelisted` as watchlist-only and preserve any isolated-margin
   constraint. Missing, zero, stale, or inconsistent data means `Listed but not currently
actionable`, not an executable idea. If nothing passes, make one refinement pass for liquid
   Hyperliquid substitutes before answering.

8. Compose the briefing with the template below, then append the journal entry.

## Briefing output template

Fill in this literal template — keep the class sections and the tradable/watchlist split.
The `YYYY-MM-DD` in the header is TODAY's real date — do not guess it or copy the example.
Get it from `date -u +%Y-%m-%d` (or the `as_of` field of the macro/price data you just pulled);
a briefing stamped with the wrong date reads as stale and destroys trust in an otherwise-live report.

```markdown
# Market briefing — YYYY-MM-DD

**Macro:** DXY <value>, US 10y <value>, curve <value>, VIX <value>, policy rate <value>,
inflation <value>, gold <value>, Brent <value>.
**Narrative:** <two or three sentences with dated catalyst context and net sentiment>.
**Odds watch:** <event> — <leading outcome> at <probability>, or "none material".

## Crypto

### Tradable on Hyperliquid now

- **<TICKER>** (<perp | spot>, dex <name>) — <one-line thesis> — signals: <signal 1>; <signal 2>.

### Not tradable on Hyperliquid (watchlist)

- **<TICKER>** — <one-line thesis> — <why it still matters>.

## Securities

### Tradable on Hyperliquid now

- **<TICKER>** (perp, dex <name>) — <one-line thesis> — quality: <live quality evidence>.

### Not tradable on Hyperliquid (watchlist)

- **<TICKER>** — <one-line thesis>.

## Commodities

### Tradable on Hyperliquid now

- **<COIN>** (perp, dex <name>) — <one-line supply/demand thesis> — quality: <live quality evidence>.

### Not tradable on Hyperliquid (watchlist)

- **<COIN>** — <one-line thesis> — <missing listing or quality evidence>.

## Gaps

- <each leg that failed and what is missing, or "none">.
```

## Journal convention

This skill defines the journal; `prediction` references it. After composing each briefing,
append a concise summary to `.tribes/journal/YYYY-MM-DD.md` (one file per day). Each entry MUST
contain the date and time, key macro readings, the top ideas with ticker/coin and one-line
rationale, every odds figure cited, and any material quality gap. `.tribes/` is local persistence
only; NEVER commit journal files.

## Error recovery

| Symptom                                  | Action                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.                             |
| One leg fails after a single retry       | Continue with the remaining legs; list the failed leg under `## Gaps` — NEVER abort the cycle for one leg. |
| Analyst leg hits the bash timeout        | Treat it as a failed leg; do not rerun it more than once.                                                  |
| No candidate clears the quality pass     | Run one refinement pass for liquid tradable substitutes, then present the watchlist with the gap stated.   |
| `command not found: tribes-cli`          | Run `sh bootstrap.sh` from the harness root, then retry.                                                   |

## Related skills

- `macros` — numeric macro state, including gold and Brent.
- `news` — asset narrative and the fallback chain for commodity news.
- `prediction` — event-odds context.
- `thesis` — sends the strongest candidate to the bull-vs-bear desk before any entry.
- `market-strategist` and `alpha-scout` — crypto ideas legs.
- `stock-analyst` — securities ideas leg.
- `commodity-analyst` — commodity ideas leg and commodity-specific research path.
- `hyperliquid` — all-dex discovery and the final venue-quality filter.
- `trade-execution` — places a trade only after the evidence gate and user go-ahead are met.
