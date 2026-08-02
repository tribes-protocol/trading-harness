---
name: research-evaluate
description: >-
  Strategy Research skill that makes the promote-or-reject call on a fully evidenced
  strategy-proposal — consistent metric comparison, the alternative-evidence clause for
  engine-unrepresentable strategies, the MANDATORY Review Board debate through thesis, and the
  two-independent-signals evidence gate — then writes the approved-strategy artifact with
  expires_at and the judge's kill switch, or a recorded rejection. Handles: evaluation
  verdicts, debate invocation and verdict mapping (yes promotes; conditional with a checkable
  trigger promotes as executable:false), and the promotion write. Call it when metrics and
  robustness, or the alternative evidence path, are embedded in the proposal. NOT for:
  building the evidence (use research-backtest-run, research-metrics, research-robustness);
  portfolio fit and sizing (use portfolio-rebalance); placing anything (use exec-place-order).
allowed-tools: bash read
---

# Research: Evaluate

## Identity

- Stable id: `research-evaluate` — owner: Strategy Research. Invoked by: Strategy Evaluator
  (evaluation verdict) and Strategy Promoter (promotion write); Research Lead signs off.

## Purpose

The only gate from `strategy-proposal` to `approved-strategy`. It compares evidence
consistently, forces every promotion through the Decision Review Board, and writes either an
approved-strategy artifact — with expiry, kill switch, and an honest `executable` flag — or a
rejection with reasons. It decides what is worth trading; whether it fits the book is
Portfolio Management's call, and nothing here touches live orders.

## Inputs

Required: the proposal with embedded `backtest_spec`, `backtests[]`, `metrics[]`, and
`robustness` (engine path) — or the completed alternative-evidence results
(engine-unrepresentable path); the upstream `validated-signal` artifacts, unexpired NOW; the
Review Board (`.agents/desk-*.md` via the `thesis` skill). Optional: Portfolio Management
feedback on prior rejections.

## Outputs

- `payload.evaluation` in the proposal: the metric comparison, the evidence path name
  (`engine` | `alternative`), the debate record (judge verdict + key uncertainty, verbatim),
  and the decision with reasons — a recommendation, kept distinct from the facts it cites.
- On promote: `.tribes/org/strategies/<UTC>-<slug>.json`, state `approved-strategy`, envelope
  per `org-protocol`, `upstream` = the proposal id, containing: the proposal's
  entry/exit/sizing/invalidation rules, the evidence path + metrics summary (self-contained),
  the judge verdict, `kill_switch` = the judge's key uncertainty, `expires_at` =
  min(upstream signal expiries, strategy horizon), and `executable`: true (judge yes) |
  false (judge conditional — with the checkable trigger spelled out for the Trigger
  Manager), plus the thesis record path cross-link.
- On reject: the proposal stamped `rejected` with reasons and the debate record — recorded,
  never deleted. Explicit failure states: `evidence-incomplete`, `debate-unavailable`,
  `vague-condition`.

## Integration

- Evidence gate and metric comparison: local reads of the proposal and signal artifacts.
- Review Board: invoke the `thesis` skill in evaluate mode with the exact framing
  (`ASSET=<coin> DEX=<dex> SIDE=<side> HORIZON=<horizon> MARK=<mark>`, mark from the pass's
  all-dex snapshot). The desks debate from a research pack; the judge returns
  `RECOMMEND TRADE: yes | no | conditional` plus the key uncertainty; desk-risk's live notes
  ride along for Portfolio Management. The Board invocation is RESEARCH-ONLY: the thesis
  skill's own approved-and-authorized handoff to `trade-execution` is suppressed here —
  verdicts are recorded in the strategy artifact, and execution happens only via the
  Portfolio Management → Execution Desk chain.
- Any scenario-analysis candle pull (alternative path) uses the run skill's fetch commands
  with `--out` and stamps provider, command, source timestamp, retrieval timestamp per
  `org-protocol`.
- Promotion mechanics — envelope, atomic write, ack sidecar: `org-protocol`.

## Preconditions

- Engine path: metrics sheets present for primary + matrix, `robustness.verdict = robust`.
  `fragile` or `insufficient-sample` blocks promotion outright.
- Alternative path (shorts, funding carry, event-driven — anything the long-only engine
  cannot represent): analytic scenario analysis over venue-native candles, an
  inverted-signal proxy backtest where meaningful (a long-only engine run on the inverted
  signal, labeled proxy with its interpretation limits), and the Review Board debate. The
  path is named in the artifact.
- The debate is MANDATORY on every promotion, both paths — no debate, no promotion, ever.
- Evidence gate: ≥ 2 independent validated signals upstream, all unexpired NOW
  (single-source-flagged signals do not count as independent).
- Duplicate-promotion guard: no existing non-terminal `strategies/` artifact already cites
  this proposal id.

## Procedure

1. Verify evidence completeness for the declared path. Missing pieces →
   `evidence-incomplete`, back to the Backtesting Agent; never judge partial evidence.
2. Compare metrics consistently: key-identical sheets, same cost assumptions;
   cost-adjusted excess return vs buy-hold is the headline; the robustness verdict gates.
3. Check the evidence gate against the upstream signals, re-verifying expiry NOW.
4. Run the Review Board debate via `thesis` (evaluate mode, exact framing). Record the judge
   verdict and key uncertainty verbatim in `payload.evaluation`.
5. Map the verdict (per thesis's own clause that a conditional with an explicit, checkable
   condition is actionable — the timestamped trigger-fired check later completes the judge's
   condition; a vague condition never promotes): `yes` → promotable, `executable: true`.
   `conditional` → promotable ONLY
   if the trigger is explicit and checkable → `executable: false` with the trigger recorded
   for `portfolio-triggers`; a vague condition → reject with `vague-condition`. `no` →
   reject.
6. Strategy Evaluator records the evaluation; Research Lead signs off; Strategy Promoter
   writes the approved-strategy artifact atomically — expiry, kill switch, executable flag,
   metrics summary embedded — and requests Portfolio Management's ack sidecar.
7. Rejections: stamp the proposal `rejected` with reasons and the debate record; the
   state-4 audit trail stays self-contained either way.

## Validation

- Every state-4 contract item appears in `checks[]`: evidence path recorded, robustness
  pass, overfitting checklist, debate verdict, evidence gate, expiry + kill switch.
- `executable: false` strategies name a checkable trigger; no strategy promotes without a
  kill switch and `expires_at`.
- The strategy artifact is self-contained: an auditor needs no file outside `upstream` links.

## Risk & safety

- Never mints trade-instructions, never sizes against balances, never runs order commands.
- Never bypasses the debate — "obvious" is not an evidence path.
- Effective challenge: evaluation is organizationally separate from generation — you evaluate
  the proposal AS SUBMITTED. Reproduce the headline backtest number from the embedded spec
  and snapshots before judging it; if it cannot be reproduced from the artifact alone, that
  IS the finding (reject `evidence-incomplete`). If the Generator revises the proposal
  mid-review, the review restarts on the new version; pre-registration moved after results is
  an automatic robustness failure.
- Evaluator/Promoter disagreement with the Generator or a desk view is recorded verbatim in
  the artifact's `dissents[]` (`org-protocol`) — promotion over a dissent is legitimate,
  deleting one is not.
- Compliance gate: when the evidence set leans on single-source social claims or
  internal-only provider data as decisive evidence, an `org-compliance` view is required
  before promotion; a blocked compliance verdict blocks the promotion.
- Reject toward more evidence on ties or unresolved uncertainty: a false promote costs real
  money; a false reject costs a cycle.
- A tripped kill switch or expiry after promotion is Portfolio Management's bounce-back:
  re-evaluation restarts from fresh signals, never by editing the expired artifact.

## Failure & retry

- Debate desk failure: the `thesis` skill retries its own desks once; if the debate cannot
  complete, record `debate-unavailable` and STOP — no promotion without a completed debate.
- `evidence-incomplete` / `vague-condition`: no retry with the same inputs; regeneration
  needs new evidence or a sharper trigger definition.
- Interrupted promotion write: temp-then-rename is idempotent; re-check the
  duplicate-promotion guard, then re-run the write.

## Timeouts & rate limits

- The debate spawns research desks and debaters — expect minutes, not seconds; it is a skill
  invocation, not a bash poll loop.
- Any scenario-analysis candle fetch: allow a 120 s bash timeout. Everything else is local.

## Observability

- `payload.evaluation` holds the comparison, debate record, and decision; the `strategies/`
  file is the promotion record; the thesis record and strategy artifact cross-link by path
  and id in both directions; `checks[]` carries the full state-4 contract.

## Escalation

- Promoted → Portfolio Manager (`portfolio-rebalance` consumes; ack sidecar required).
- Rejected → Research Lead and Strategy Generator with reasons (feeds the next hypothesis).
- Recurring engine-unrepresentable demand → Engineering backlog: richer backtest engine.
- Anything requiring human money judgment → Head of Desk → the user.

## Example

```bash
# after metrics + robustness are embedded: run the Review Board on the exact framing
# thesis skill, evaluate mode: ASSET=ETH DEX=main SIDE=long HORIZON=10d
date -u +%Y-%m-%dT%H:%M:%SZ
mkdir -p .tribes/org/strategies
# judge: RECOMMEND TRADE: conditional — "only if funding stays negative at next 4h mark"
# checkable trigger → promote executable:false; write + rename atomically:
mv .tribes/org/strategies/20260730T140000Z-eth-oversold-revert.json.tmp \
   .tribes/org/strategies/20260730T140000Z-eth-oversold-revert.json
```

Success: an `approved-strategy` with `executable: false`, the trigger recorded for
`portfolio-triggers`, `kill_switch` = the judge's key uncertainty, `expires_at` =
min(signal expiries, 10d horizon), and Portfolio Management's ack requested.

## Acceptance

- [ ] Debate ran and the judge verdict + key uncertainty are recorded verbatim.
- [ ] Evidence path named; sheets compared key-identically; robustness gate honored.
- [ ] ≥ 2 independent unexpired signals upstream; expiry + kill switch on every promotion.
- [ ] `conditional` → `executable: false` with a checkable trigger; rejections recorded.

## Related skills

- `thesis` — the Decision Review Board contract this skill invokes.
- `research-robustness` — the verdict that gates the engine evidence path.
- `research-metrics` — the comparable sheets and the not-computable boundary.
- `research-backtest-run` — proxy backtests for the alternative-evidence path.
- `research-hypothesis` — where rejected ideas restart with fresh signals.
- `portfolio-rebalance` — consumes promotions and sizes them against the book.
- `portfolio-triggers` — watches the entry triggers of executable:false strategies.
- `org-protocol` — envelope, promotion mechanics, acks, expiry rules.
