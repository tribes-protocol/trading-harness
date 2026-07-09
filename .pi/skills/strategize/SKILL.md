---
name: strategize
description: >-
  Full market-briefing playbook that composes macro numbers, news narrative, prediction-market
  odds, crypto and stock ideas, and a Hyperliquid tradability filter into one cycle. Handles:
  "how are markets", market briefings, strategy-cycle runs, trading-plan refreshes, and the
  journal and evidence-gate conventions other skills reference. Call for any multi-source market
  overview or plan refresh. NOT for: placing or managing trades (use trade-execution or
  position-management); a single macro number (use macros); one asset's news (use news); event
  odds alone (use prediction).
allowed-tools: bash read
---

# Strategize

A playbook, not a command group: it composes existing `tribes-cli` commands into one
market-briefing cycle and defines the journal and evidence-gate conventions. Every leg's command
is documented in full by its owning skill.
Requires: an auth token (run `tribes-cli login` once if commands fail with auth errors).

## When to use

- The user asks for a market briefing, "how are markets", a strategy cycle, or a trading-plan
  refresh — run the full procedure below.
- Another skill (`macros`, `news`, `prediction`) hands off for "the full picture".
- NOT for one macro number (VIX, CPI, 10y yield) — use `macros`.
- NOT for one asset's headlines or sentiment — use `news`.
- NOT for event odds on their own — use `prediction`.
- NOT for placing the resulting trade — use `trade-execution`.

## Hard rules

1. An unscoped briefing MUST include both the crypto legs AND the stock leg — the cross-asset
   guardrail in AGENTS.md. Skip a side only when the user explicitly scoped the request.
2. MUST set a bash timeout of at least 120 seconds (prefer 300) for every analyst `ask` and
   `news fetch` leg.
3. Analyst legs take ONLY `--query` — no `--out`, no filter flags; encode chain, time window,
   and filters inside the query text. Output is one free-text analysis string on stdout.
4. Evidence gate: NEVER open or increase a position from a single signal — odds alone, one
   indicator, or one headline is never enough. Require at least two independent supporting
   signals AND the user's explicit go-ahead. This skill produces briefings; `trade-execution`
   places trades.
5. MUST run the tradability filter (step 6) on every candidate before presenting it as
   actionable — the Hyperliquid tradability guardrail in AGENTS.md.
6. MUST append every briefing to the journal (convention below).

## Briefing procedure

Legs 1–5 are independent of each other. IF the `subagent` tool (pi-subagents extension) is in
your tool list, you MUST run them as ONE parallel call — one `delegate` agent per leg, each task
being exactly that leg's command with its output returned verbatim — instead of running them
one at a time:

```js
subagent({
  tasks: [
    { agent: 'delegate', task: 'Run `tribes-cli macros market` and return the raw JSON output.' },
    { agent: 'delegate', task: 'Run the news leg command below and return its full output.' }
    // ...one task per remaining leg
  ]
})
```

Without the `subagent` tool, run the legs sequentially in this order. Either way: if a leg
fails, follow Error recovery — never abort the cycle. Step 6 (tradability filter) runs after
the legs return, since it needs the candidate list.

1. Macro numbers (`macros` skill):

   ```bash
   tribes-cli macros market
   ```

   Record `dxy.value`, `yields.us10y`, `yields.curve_2s10s`, `vix.value`, `fed_funds.value`,
   and `cpi.yoy_pct` for the briefing header.

2. Macro narrative (`news` skill; timeout rule 2 applies):

   ```bash
   tribes-cli news fetch \
     --kind perp \
     --coin BTC
   ```

   BTC perp news doubles as the crypto-market narrative. For pure macro topics (Fed, oil, CPI
   print) there is no CLI kind — use the web fallback chain documented in `news`.

3. Event odds (`prediction` skill):

   ```bash
   tribes-cli prediction search \
     --query "Fed rate cut" \
     --limit-per-type 10
   ```

   Query the events relevant to the current thesis (rate cuts, ETF decisions, elections,
   regulation). To scan the biggest open events instead, run
   `tribes-cli prediction list-events --active true --closed false --order volume --ascending false --limit 25`.
   Cite `leadingOutcome` and `leadingProbability` per event.

4. Crypto ideas (timeout rule 2 applies to each):

   ```bash
   tribes-cli market-strategist ask \
     --query "Top crypto gainers and losers today, BTC dominance trend, and which sectors are rotating"
   tribes-cli alpha-scout ask \
     --query "Trending tokens and smart-money accumulation over the last 24 hours"
   ```

5. Stock ideas (timeout rule 2 applies):

   ```bash
   tribes-cli stock-analyst ask \
     --query "Biggest US stock movers today with their catalysts"
   ```

   Rule 1 applies: run this leg even when the user only said "how are markets".

6. Tradability filter (`hyperliquid` skill) — for EVERY candidate ticker from steps 4–5:

   ```bash
   tribes-cli hyperliquid list-exchanges
   tribes-cli hyperliquid list-assets --dex xyz
   tribes-cli hyperliquid list-assets --market spot
   ```

   Run `list-exchanges` once, then `list-assets --dex <name>` for main and each named dex, plus
   `list-assets --market spot`. A candidate found in none of them goes to the watchlist section.
   If nothing is tradable, run one refinement pass for tradable substitutes before answering.

7. Compose the briefing with the template below, then append the journal entry.

## Briefing output template

Fill in this literal template — keep the section names and the tradable/watchlist split:

```markdown
# Market briefing — YYYY-MM-DD

**Macro:** DXY <value> (<change_pct>%), US 10y <value>%, 2s10s <value>, VIX <value>,
Fed funds <value>%, CPI YoY <value>%.
**Narrative:** <2–3 sentences of market narrative with net sentiment>.
**Odds watch:** <event> — <leadingOutcome> at <leadingProbability> (Polymarket).

## Crypto

### Tradable on Hyperliquid now

- **<TICKER>** (<perp | spot>, dex <name>) — <one-line thesis> — signals: <signal 1>; <signal 2>.

### Not tradable on Hyperliquid (watchlist)

- **<TICKER>** — <one-line thesis> — <why it still matters>.

## Stocks

### Tradable on Hyperliquid now

- **<TICKER>** (perp, dex <name>) — <one-line thesis> — signals: <signal 1>; <signal 2>.

### Not tradable on Hyperliquid (watchlist)

- **<TICKER>** — <one-line thesis>.

## Gaps

- <each leg that failed and what is missing, or "none">.
```

## Journal convention

This skill defines the journal; `prediction` references it. After composing each briefing,
append its summary to `.tribes/journal/YYYY-MM-DD.md` (today's date, one file per day):

```bash
mkdir -p .tribes/journal
cat >> .tribes/journal/2026-07-09.md <<'EOF'
## Briefing HH:MM UTC

- Macro: DXY 105.2, 10y 4.21%, 2s10s -0.67, VIX 18.9, CPI YoY 3.2%
- Top ideas: BTC long (rotation + smart-money inflows); NVDA long (earnings beat + momentum)
- Odds cited: Fed cut by September — Yes at 0.62 (Polymarket)
EOF
```

Each entry MUST contain: date and time, the key macro numbers, the top ideas with tickers and a
one-line rationale, and every odds figure cited. `.tribes/` is gitignored — this is local
persistence only; NEVER commit journal files.

## Error recovery

| Symptom                                    | Action                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token)   | Run `tribes-cli login`, retry the original command once, then stop and report.                             |
| One leg fails after a single retry         | Continue with the remaining legs; list the failed leg under `## Gaps` — NEVER abort the cycle for one leg. |
| Analyst leg hits the bash timeout          | Treat it as a failed leg (row above); do not rerun it more than once.                                      |
| No candidate survives the tradability pass | Run one refinement pass for tradable substitutes, then present the watchlist with the gap stated.          |
| `command not found: tribes-cli`            | Run `sh bootstrap.sh` from the harness root, then retry.                                                   |

## Related skills

- `macros` — numeric half of the macro leg.
- `news` — narrative half of the macro leg, plus the web fallback chain for macro topics.
- `prediction` — event-odds leg; references this skill's evidence gate and journal.
- `thesis` — hand the strongest candidate to the bull-vs-bear desk before any entry.
- `market-strategist` — crypto market-wide ideas leg.
- `alpha-scout` — crypto discovery and smart-money leg.
- `stock-analyst` — stock ideas leg.
- `hyperliquid` — owns the tradability-filter commands (`list-exchanges`, `list-assets`).
- `trade-execution` — places the trade once the evidence gate and user go-ahead are met.
