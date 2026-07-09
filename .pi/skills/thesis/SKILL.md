---
name: thesis
description: >-
  Adversarial trade-conviction engine. Handles: scouting the single best Hyperliquid trade
  candidate, stress-testing one candidate through a bull-vs-bear desk debate with a judge and a
  risk manager, conviction gates for auto-entry, and the living thesis record (open, hold, add,
  exit). Call when the user asks what to trade, whether a specific trade is worth taking, or to
  re-evaluate the current thesis. NOT for: broad market briefings (use strategize); placing the
  order after conviction (use trade-execution); routine stops, margin, or closes (use
  position-management).
allowed-tools: bash read
---

# Thesis

Decide whether ONE specific trade is worth taking by making independent agents argue about it.
A debate desk (bulls vs bears, judged) replaces single-pass judgment: the desk argues from one
shared research pack, the judge scores mechanisms, and hard gates decide auto-entry.
Requires: the `.agents/desk-*.md` agent definitions in this repo; works best when the harness
can spawn subagents in parallel (in Pi: the pi-subagents extension) — sequential fallback below.

## When to use

- "What should I trade?" — scout mode: build candidates, debate the best one.
- "Should I long/short X?" — evaluate mode: debate that exact framing.
- "How is the trade doing?" / a thesis position exists — re-evaluate mode: HOLD, ADD, or EXIT.
- NOT for a general market overview — use `strategize` (its briefing feeds scout mode).
- NOT for placing the order — hand the approved thesis to `trade-execution`.
- NOT for moving stops or closing without a thesis re-evaluation — use `position-management`.

## Hard rules

1. NEVER place, modify, or cancel any order from this skill. Execution goes through
   `trade-execution`; existing-position care goes through `position-management`.
2. Research-only by default. Auto-entry is allowed ONLY when the user explicitly authorized it
   (for example "if high conviction, do it without asking") AND every gate below passes.
3. The debate desk argues from the research pack you assemble. NEVER let a debater's invented
   data into the thesis — every claim must trace to a pack item.
4. Re-evaluate mode MUST pass the ownership check before touching the thesis record: match
   `.tribes/thesis/current.md` against live positions by dex + coin + side and, when recorded,
   entry/size/order ids. IF the match is ambiguous → stop and ask. IF the position is gone →
   record CLOSED (closed externally) and do not touch any other same-coin position.
5. One active thesis at a time in `current.md`. IF it is still active, write new proposals to
   `.tribes/thesis/proposed-<UTC-timestamp>.md` instead of overwriting it.
6. IF your harness supports spawning subagents, desk stages MUST run as parallel subagent
   batches as shown below — sequential role-play is ONLY the fallback for harnesses without
   subagent support.

## The desk

Agent definitions live in `.agents/desk-*.md`. IF your harness can spawn subagents (Pi provides
this via the pi-subagents extension; other harnesses have their own task/agent tools), you MUST
run each stage below as ONE parallel batch of subagents — NEVER one role at a time. Each
subagent's prompt is its `.agents/` definition plus the task line described below.

Stage 1 — research pack: spawn all four in parallel, each given the same framing line
`ASSET=<asset> SIDE=<side> HORIZON=<horizon> MARK=<mark>` (swap in `desk-stock-research` for
stocks):

| Agent                                           | Produces                                                     |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `desk-macro`                                    | regime read: risk-on/off, tailwinds, scheduled prints        |
| `desk-news`                                     | sentiment, catalysts in horizon, priced-in check, event odds |
| `desk-technicals`                               | multi-timeframe read, levels, ATR feasibility of the bracket |
| `desk-crypto-research` OR `desk-stock-research` | fundamentals + flows (pick by asset class)                   |

Stage 2 — debate: spawn all six in parallel. Every debater gets the SAME framing + the full
research pack, plus one distinct focus so the copies do not repeat each other (scale to 1v1 for
a quick check; never more than 3v3):

- `desk-bull` — FOCUS: flow/positioning
- `desk-bull` — FOCUS: catalyst/news
- `desk-bull` — FOCUS: structure/levels
- `desk-bear` — FOCUS: flow/positioning
- `desk-bear` — FOCUS: catalyst/news
- `desk-bear` — FOCUS: structure/levels

Stage 3 — verdict: two single runs, in sequence:

1. `desk-judge` — gets the framing, the pack, and all six cases → WINNER, CONFIDENCE 0.00–1.00,
   RECOMMEND TRADE yes/no/conditional.
2. `desk-risk` — gets the framing and the judge's verdict → live re-check, exact sizing,
   bracket math, gate pass/fail.

Fallback IF your harness cannot spawn subagents: run the same roles yourself, sequentially, one
role per pass, following each `.agents/desk-*.md` file verbatim — never blend roles in one
pass — and tell the user (in plain language) that the desk debate runs faster, with truly
independent debaters, when subagent support is enabled (in Pi: the pi-subagents extension).

## Procedure

1. Frame the trade: ASSET (perp coin, or `xyz:TICKER` stocks — see AGENTS.md), SIDE, HORIZON
   (default 12h), bracket (default +10% take-profit / −5% stop-loss on committed equity).
2. Scout mode only: get candidates — run `strategize` output if fresh, else
   `tribes-cli hyperliquid list-assets` (+ `--dex xyz`) filtered by `alpha-scout` /
   `market-strategist` / `stock-analyst` reads. Verify every candidate is listed on Hyperliquid
   before deep research. Pick the strongest 1–2 for debate; do not debate more.
3. Assemble the research pack (parallel desk agents above).
4. Run the debate and judge.
5. Run `desk-risk` for sizing and gates.
6. Record the outcome (templates below): approved → thesis entry; rejected/conditional →
   proposal file with the judge's key uncertainty.
7. IF approved AND the user authorized execution → hand exact parameters (dex, coin, side,
   size, leverage, entry type, TP/SL prices) to `trade-execution`. Otherwise present the
   verdict and ask.
8. Re-evaluate mode: after the ownership check (hard rule 4), rebuild a light pack (macro +
   news + technicals), rerun the debate on "keep this position", then record HOLD, ADD, or
   EXIT. EXIT/ADD execute only with prior explicit authorization for this thesis — otherwise
   present and ask; closes route through `position-management`.

## Auto-entry gates (ALL must pass)

- Asset verified tradable on Hyperliquid now.
- Judge CONFIDENCE ≥ 0.65 AND RECOMMEND TRADE = yes (conditional is not yes).
- Fresh mark, balances, positions, and open orders checked by `desk-risk` immediately before
  sizing.
- Technical feed usable — no auto-entry on broken candles/indicators.
- Bracket math is on committed equity, not raw price: long TP = entry × (1 + 0.10/leverage),
  long SL = entry × (1 − 0.05/leverage); shorts inverted.
- Stop sits outside normal ATR noise for the horizon (desk-technicals feasibility = yes).
- Dex free margin and $10 minimum notional pass; ≤ 5% of that dex's equity per trade, ≤ 15%
  across desk-owned positions; isolated margin.
- No existing position or order is modified, duplicated, or netted by the entry.

## Thesis record

State lives in `.tribes/thesis/` (gitignored, local): `current.md` (living thesis, newest entry
on top), `proposed-*.md` (rejected/unexecuted research), `active/*.md` (extra theses opened
while `current.md` is active), `status.json` (monitor state). Fill this template exactly:

```markdown
# Thesis: <ASSET> <LONG|SHORT>

## <YYYY-MM-DD HH:MM UTC> — THESIS OPENED

- Asset: <ASSET> <SIDE> on Hyperliquid | Dex: <dex> | OID: <order-id>
- Entry: $<px> | Size: <size> | Leverage: <n>x isolated | Margin: $<amount>
- TP: $<px> (+10% on equity) | SL: $<px> (−5% on equity) | Horizon: <n>h
- Judge: CONFIDENCE <0.00–1.00>, <one-line verdict>
- Thesis: 1. <mechanism> 2. <mechanism> 3. <mechanism>
- Kill switch: <the judge's KEY UNCERTAINTY — what would flip this>
```

HOLD/ADD/EXIT entries reuse the shape: timestamp heading, mark + PnL, one-line re-evaluation,
decision. Also append the verdict one-liner to the `strategize` journal for the day.

## Error recovery

| Symptom                                  | Action                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.         |
| A desk agent fails or returns empty      | Retry it once; if it fails again, continue the debate and state the gap in the record. |
| Harness has no subagent support          | Use the sequential fallback and suggest enabling it (in Pi: pi-subagents).             |
| Ownership check ambiguous                | Stop and ask the user which position the thesis owns.                                  |

## Related skills

- `strategize` — market briefing that feeds scout mode and owns the daily journal.
- `trade-execution` — places the approved trade and verifies the fill.
- `position-management` — stops, margin, and closes on the resulting position.
- `hyperliquid` — the command surface the desk's read-only checks use.

## Before you finish

- [ ] No orders were placed from this skill; execution went through `trade-execution` or not at all.
- [ ] The verdict traces to the pack; the record includes confidence, thesis, and kill switch.
- [ ] Auto-entry happened only with explicit prior authorization and every gate passing.
- [ ] `current.md` was not overwritten while still active.
