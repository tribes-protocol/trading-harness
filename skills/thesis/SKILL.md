---
name: thesis
description: >-
  Adversarial trade-decision engine. Handles: scouting the best Hyperliquid candidate,
  stress-testing one candidate through a bull-vs-bear desk debate with a judge and a risk manager,
  judge-led safety review for auto-entry, and the living thesis record (open, hold, add, exit).
  Call when the user asks what to trade, whether a specific trade is worth taking, or to
  re-evaluate the current thesis. NOT for: broad market briefings (use strategize); placing the
  order after a decision (use trade-execution); routine stops, margin, or closes (use
  position-management).
allowed-tools: bash read
---

# Thesis

Decide whether ONE specific trade is worth taking by making independent agents argue about it. A
debate desk (bulls versus bears, judged) replaces single-pass judgment: every claim traces to a
shared research pack, the judge makes the categorical decision, and the risk desk checks live
safety and execution feasibility. Requires the `.agents/desk-*.md` definitions in
this repo; it works best when the harness can spawn subagents in parallel.

## When to use

- "What should I trade?" — scout mode: build candidates, then debate the best one.
- "Should I long/short X?" — evaluate mode: debate that exact framing.
- "How is the trade doing?" or an existing thesis position — re-evaluate mode: HOLD, ADD, or EXIT.
- NOT for a general market overview — use `strategize`.
- NOT for placing the order — hand an approved thesis to `trade-execution`.
- NOT for moving stops or closing without a thesis re-evaluation — use `position-management`.

## Hard rules

1. NEVER place, modify, or cancel an order from this skill. Execution goes through
   `trade-execution`; existing-position care goes through `position-management`.
2. Research-only by default. Auto-entry is allowed only when the user explicitly granted standing
   authorization and the judge says yes after every safety requirement below passes.
3. The desk argues from the research pack. NEVER let a debater's invented data into the thesis.
4. Re-evaluate mode MUST pass the ownership check before touching the thesis record: match
   `.tribes/thesis/current.md` against live positions by dex, coin, side, and any recorded
   entry/size/order IDs. If the match is ambiguous, stop and ask. If the position is gone, record
   it as closed externally and do not touch another same-coin position.
5. One active thesis at a time in `current.md`. If it is still active, write new proposals to
   `.tribes/thesis/proposed-<UTC-timestamp>.md` instead of overwriting it.
6. Hard safety failures block. Softer concerns should become an explicit condition, a revised
   entry/invalidation, or a proportionate risk recommendation rather than an automatic no-trade.
7. If the harness supports subagents, desk stages MUST run as parallel batches below; sequential
   role-play is the fallback only for harnesses without subagent support.

## The desk

Agent definitions live in `.agents/desk-*.md`. If the harness can spawn subagents, run each stage
as the specified parallel batch. Each subagent gets its desk definition plus the same framing line:
`ASSET=<asset> DEX=<dex> SIDE=<side> HORIZON=<horizon> MARK=<mark>`.

Stage 1 — research pack: spawn all four in parallel. Pick exactly one asset-class research desk.

| Agent                                                                       | Produces                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `desk-macro`                                                                | regime read, tailwinds, headwinds, scheduled macro risk     |
| `desk-news`                                                                 | sentiment, catalysts, priced-in check, relevant event odds  |
| `desk-technicals`                                                           | structure, entry, target, invalidation, horizon feasibility |
| `desk-crypto-research`, `desk-stock-research`, or `desk-commodity-research` | asset-specific fundamentals and flows                       |

Stage 2 — debate: spawn all six in parallel. Every debater gets the same framing and full pack,
plus one distinct focus so the copies do not repeat each other (scale to one-versus-one for a
quick check; never more than three-versus-three):

- `desk-bull` — flow/positioning
- `desk-bull` — catalyst/news
- `desk-bull` — structure/levels
- `desk-bear` — flow/positioning
- `desk-bear` — catalyst/news
- `desk-bear` — structure/levels

Stage 3 — verdict: run these two roles in sequence because risk needs the judge's result.

1. `desk-judge` receives the framing, pack, and all cases. It returns winner, key uncertainty,
   and `RECOMMEND TRADE` yes/no/conditional. The categorical recommendation is the decision
   input; it is not converted into a numerical metric.
2. `desk-risk` receives the framing and judge verdict. It rechecks live market/account state,
   proposes execution parameters, and reports whether nonnumeric safety requirements are clear.

Fallback without subagent support: run the same roles sequentially, one role per pass, following
its `.agents/` definition. Do not blend roles or imply independent debate when it did not occur.

## Procedure

1. Frame the trade: exact Hyperliquid `DEX:COIN`, asset class, side, horizon, and any user-stated
   entry intent. Let technicals define target and invalidation from structure and volatility; do
   not start from a fixed percentage bracket.
2. Scout mode only: use fresh `strategize` output, or discover across all Hyperliquid dexes and
   run the crypto, securities, and commodity research paths. Filter every candidate through the
   all-dex quality review before deep research. Pick the strongest one or two candidates; do not
   debate more.
3. Assemble the research pack (the stage-1 parallel batch above). For an on-chain token
   candidate, include a `token-diligence` verdict in the pack; for a stock-perp candidate, a
   `security-diligence` verdict — a FAIL from either is a hard safety failure. A fresh
   `market-pulse` read may serve as desk-macro's regime baseline.
4. Run the stage-2 debate and the judge.
5. Run `desk-risk` for live safety and execution feasibility; it uses the `execution-quality`
   read (spread, impact, size pressure, funding drag at the proposed size) as its
   execution-feasibility evidence.
6. Record the outcome: an authorized auto-entry approved by the judge and safety review becomes a
   thesis entry; proposed, conditional, or rejected outcomes become a proposal file with the
   judge's key uncertainty.
7. If approved and authorized, hand exact dex, coin, side, size, leverage, entry type, target,
   and stop/invalidation parameters to `trade-execution`. Otherwise present the decision and ask.
8. Re-evaluate mode: after ownership verification, rebuild a light macro/news/technicals pack,
   rerun the debate on keeping the position, then record HOLD, ADD, or EXIT. ADD or EXIT requires
   prior authorization for this thesis; closes route through `position-management`.

## Proposal and auto-entry requirements

Hard safety requirements block both a proposal and auto-entry:

- The asset is found on its exact Hyperliquid dex after an all-dex discovery pass.
- Its live quality data supports the planned order: current price; coherent mark/midpoint/oracle
  values when available; current activity and open interest; and acceptable expected impact.
- It is not delisted, and the planned margin mode honors any venue-enforced isolated-margin
  constraint.
- Fresh mark, balances, positions, and open orders are checked by `desk-risk` before sizing.
- Technical data is usable, and the target/invalidation is credible for the horizon rather than
  sitting inside ordinary noise.
- The venue's exchange-enforced minimum notional and `maxLeverage` are satisfied, with adequate
  free margin.
- The entry does not modify, duplicate, or unintentionally net an existing position or order.

The judge leads the decision; sizing follows evidence rather than numeric desk policy:

- `RECOMMEND TRADE: yes` is the judge's affirmative decision. `conditional` is actionable only
  when its trigger is explicit and checkable; otherwise it is too vague to propose.
- Do not quantify the decision. The judge's yes/no/conditional recommendation, strongest argument,
  and key uncertainty are the decision record.
- There is no fixed percentage position cap or soft leverage ceiling. The judge and risk desk
  must explain size and leverage in light of market quality, intended impact, free margin,
  liquidation exposure, correlated positions, and the exchange's hard `maxLeverage`.
- Target and invalidation come from the technicals and judge, with a stop that remains meaningful
  outside ordinary volatility. Choose an appropriate margin mode and attach exits unless the user
  explicitly waives them.

## Thesis record

State lives in `.tribes/thesis/` (gitignored, local): `current.md` (living thesis, newest entry
on top), `proposed-*.md` (rejected/unexecuted research), `active/*.md` (extra theses opened while
`current.md` is active), and `status.json` (monitor state). Fill this template exactly:

```markdown
# Thesis: <ASSET> <LONG|SHORT>

## <YYYY-MM-DD HH:MM UTC> — THESIS OPENED

- Asset: <ASSET> <SIDE> on Hyperliquid | Dex: <dex> | OID: <order-id>
- Entry: $<px> | Size: <size> | Leverage: <n>x <margin-mode> | Margin: $<amount>
- Target: $<px> | Invalidation / stop: $<px> | Horizon: <n>h
- Judge: <yes | no | conditional> — <one-line verdict>
- Thesis: 1. <mechanism> 2. <mechanism> 3. <mechanism>
- Kill switch: <the judge's key uncertainty — what would flip this>
```

HOLD/ADD/EXIT entries reuse the shape: timestamp heading, mark and PnL, one-line re-evaluation,
and decision. Also append the verdict one-liner to the `strategize` journal for the day.

## Error recovery

| Symptom                                  | Action                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Auth error (unauthorized, expired token) | Run `tribes-cli login`, retry the original command once, then stop and report.         |
| A desk agent fails or returns empty      | Retry it once; if it fails again, continue the debate and state the gap in the record. |
| Harness has no subagent support          | Use the sequential fallback and state that the debate was sequential.                  |
| Ownership check ambiguous                | Stop and ask the user which position the thesis owns.                                  |

## Related skills

- `strategize` — cross-asset briefing and daily journal.
- `market-pulse` — fast regime read for the macro desk.
- `token-diligence` — safety gate included in the pack for on-chain token candidates.
- `security-diligence` — the equivalent gate for stock-perp candidates.
- `execution-quality` — the desk-risk execution-feasibility check.
- `commodity-analyst` — commodity discovery, research, and venue-quality path.
- `trade-execution` — places an approved trade and verifies the fill.
- `position-management` — stops, margin, and closes on the resulting position.
- `hyperliquid` — all-dex discovery and live account checks.

## Before you finish

- [ ] No orders were placed from this skill; execution went through `trade-execution` or not at all.
- [ ] The decision traces to the pack; the record includes judge reasoning, thesis, and kill switch.
- [ ] Auto-entry had explicit prior authorization, a judge yes decision, and every safety requirement clear.
- [ ] `current.md` was not overwritten while still active.
