---
name: research-hypothesis
description: >-
  Strategy Research skill that turns unexpired validated-signal artifacts into one falsifiable
  strategy-proposal — precise entry, exit, sizing, and invalidation rules with a stated horizon,
  citing signal ids only, never raw unvalidated data. Handles: hypothesis formation, rule
  precision, falsifiability, and engine-representability tagging. Call it when Data Validation
  has delivered validated signals worth converting into a testable strategy. NOT for: producing
  or scoring signals (use validate-signal-score); choosing candle sources and windows (use
  research-backtest-spec); running the engine (use research-backtest-run); the promote/reject
  decision (use research-evaluate); sizing a live trade (use portfolio-rebalance).
allowed-tools: bash read
---

# Research: Hypothesis

## Identity

- Stable id: `research-hypothesis` — owner: Strategy Research. Invoked by: Strategy Generator.

## Purpose

Convert a coherent set of validated signals into exactly one strategy-proposal artifact whose
rules are precise enough to be tested and precise enough to be proven wrong. The proposal is a
hypothesis, labeled as such — never a fact, never a trade recommendation, never an order. This
skill cites validated-signal ids only; raw observations and fresh unvalidated pulls are
forbidden inputs.

## Inputs

Required: one or more `validated-signal` artifacts (`.tribes/org/signals/<id>.json`), each in
state `validated-signal` (not rejected, not expired) and unexpired NOW, carrying confidence,
evidence list, and `expires_at`. Optional: the Research Lead's agenda item; the day's
`strategize` journal entry (cited by path, context only).

## Outputs

One artifact `.tribes/org/proposals/<UTC>-<slug>.json`, state `strategy-proposal`, envelope per
`org-protocol`, `upstream` = the cited signal ids, `expires_at` = min of the signal expiries.
`payload` labels every field as hypothesis, never fact:

- `thesis`: 1–3 numbered mechanism claims, each tied to a supporting signal id.
- `market`: venue (hyperliquid), dex, coin, direction (long | short), asset class.
- `rules`: entry, exit, sizing basis, invalidation — each numeric or indicator-checkable (e.g.
  "enter on 4h close with RSI14 < 30", never "when momentum looks weak"). Final sizing against
  live balances belongs to Portfolio Management, not here.
- `horizon` (with units) and `falsification`: the observable outcome that kills the thesis.
- `engine_representable`: true only if the rules map to the engine's long-only `ma-cross` or
  `rsi-revert`; else false plus the named alternative-evidence path (per `research-evaluate`).

No market data is fetched here, so `sources[]` is inherited by reference: the `upstream` signal
ids carry provider, command, source timestamp, and retrieval timestamp per `org-protocol`.
Explicit failure states: `no-viable-strategy`, `signals-expired`, `signals-contradictory` —
always recorded, never silent.

## Integration

- Pure artifact transformation — no provider calls, no network. `date -u +%Y-%m-%dT%H:%M:%SZ`
  stamps `created_at`.
- Envelope, `<UTC compact>-<slug>` id format, atomic temp-then-rename writes: `org-protocol`.
- Engine capability bounds consulted for the `engine_representable` tag: `research-backtest-run`
  (exactly two long-only strategies: ma-cross, rsi-revert; RSI length fixed at 14).

## Preconditions

- Every cited signal is unexpired at write time and carries no rejection stamp.
- Cited signals are mutually consistent — a contradiction between them is a stop, not
  something to average away.
- A single-source-flagged signal may inform a proposal but caps its confidence and does not
  count toward `research-evaluate`'s two-independent-signals evidence gate.
- `.tribes/org/proposals/` exists (`mkdir -p`).

## Procedure

1. Re-verify every input signal: state, `expires_at` vs now, confidence, single-source flags.
   Any expired → stop with `signals-expired`. Mutually contradictory → stop with
   `signals-contradictory` and return the ids to Data Validation.
2. Write the mechanism as 1–3 falsifiable claims, each citing the signal id supporting it.
3. Fix the rules: entry condition, exit condition, sizing basis, invalidation level or
   condition, horizon. Every rule must be checkable by a third party from data alone.
4. State the falsification criteria — what outcome, observed by when, disproves the thesis.
5. Tag `engine_representable` honestly: long-only trend-cross or oversold mean-revert entries
   map to the engine; shorts, funding carry, and event-driven logic do not — name the
   alternative-evidence path instead of stretching the mapping.
6. Mint the id, write the artifact atomically, and hand it to the Backtesting Agent. Delivery
   is complete only when the `<id>.ack.json` sidecar appears.

## Validation

- Every `upstream` id resolves to a file in state `validated-signal`, unexpired.
- No observation ids, raw provider payloads, or fresh pulls appear anywhere in the proposal.
- Each rule is numeric or indicator-checkable; `expires_at` = min(signal expiries).
- The proposal reads as a hypothesis — no fact-toned claims about the future.

## Risk & safety

- Never places, sizes, or requests orders; never writes to `instructions/` or `strategies/`.
- Never cites unvalidated data. A needed datum without a validated signal is a request to Data
  Validation, not a pull from here.
- One proposal per hypothesis. Variants are separate proposals and ALL are recorded — the full
  set, including failures, is `research-robustness`'s defense against cherry-picking.
- Pre-registration: rationale, universe, horizon, expected sign, and the falsification
  criterion are written in the proposal BEFORE any backtest data is pulled. Changing the
  hypothesis after seeing results is a NEW proposal citing the old one — never an edit. A
  hypothesis with no falsification criterion cannot proceed to a spec at all.

## Failure & retry

- `signals-expired` / `signals-contradictory`: no retry with the same inputs — regeneration
  requires fresh signals from Data Validation.
- `no-viable-strategy` (signals real, no testable edge): write a minimal proposal artifact
  stamped `rejected` with that reason so the conclusion is auditable — silence is forbidden.
- Interrupted write: re-run the atomic write; temp-then-rename makes it idempotent.

## Timeouts & rate limits

- No network commands; default bash timeouts suffice. Zero provider budget consumed.

## Observability

- The proposal file is the record: id, upstream signal ids, `checks[]` for each contract item
  verified, hypothesis labels. Rejected attempts stay in `proposals/`, stamped, not deleted.

## Escalation

- Success → Backtesting Agent (`research-backtest-spec`), ack sidecar required.
- Contradictory signals → Data Validation via the Intelligence Lead, with the ids.
- Repeated `no-viable-strategy` on one agenda item → Research Lead re-scopes or drops it.

## Example

```bash
date -u +%Y-%m-%dT%H:%M:%SZ    # created_at stamp
mkdir -p .tribes/org/proposals
# write the envelope to .tribes/org/proposals/20260730T101500Z-eth-oversold-revert.json.tmp, then:
mv .tribes/org/proposals/20260730T101500Z-eth-oversold-revert.json.tmp \
   .tribes/org/proposals/20260730T101500Z-eth-oversold-revert.json
```

Success: state `strategy-proposal`, `upstream` citing two signal ids, rules
`{entry: "1d close with RSI14 < 30", exit: "1d close with RSI14 > 70", invalidation:
"close below 90d swing low", horizon: "5-15 days"}`, `engine_representable: true`
(rsi-revert), `expires_at` = the earlier signal expiry; ack requested from Backtesting.

## Acceptance

- [ ] Only unexpired validated-signal ids cited; every rule numeric or indicator-checkable.
- [ ] Falsification criteria stated; `expires_at` = min upstream expiry; atomic write.
- [ ] `engine_representable` tagged honestly, alternative path named when false.
- [ ] Outcome recorded even when no proposal was viable; ack requested from Backtesting.

## Related skills

- `validate-signal-score` — the gate that mints the signals this skill consumes.
- `research-backtest-spec` — next step: compiles the proposal into an engine spec.
- `research-backtest-run` — the two-strategy engine that bounds representability.
- `research-evaluate` — promotion gate and the alternative-evidence clause.
- `org-protocol` — envelope, ids, acks, atomic writes.
- `strategize` — journal context a proposal may cite by path.
