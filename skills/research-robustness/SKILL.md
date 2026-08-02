---
name: research-robustness
description: >-
  Strategy Research skill that stress-tests a backtested proposal by re-running the engine
  across the declared matrix — alternative time windows, timeframes, comparable assets, and
  ±20% parameter perturbations — splitting results by trend-vs-chop regime via ta trend
  fields, and applying the overfitting checklist with explicit degradation thresholds.
  Handles: matrix execution, regime splits, leakage/survivorship/sample-size checks, and the
  robust/fragile/insufficient-sample verdict with every cell recorded. Call it after metrics
  exist for the primary run and before evaluation. NOT for: declaring the matrix (use
  research-backtest-spec); single runs (use research-backtest-run); metric definitions (use
  research-metrics); the promote decision (use research-evaluate).
allowed-tools: bash read
---

# Research: Robustness

## Identity

- Stable id: `research-robustness` — owner: Strategy Research. Invoked by: Strategy Evaluator.

## Purpose

Distinguish an edge from an artifact of one lucky window. The primary backtest is one point;
this skill runs the declared matrix around it, splits results by regime, and applies the
overfitting checklist with thresholds recorded in the artifact — so `research-evaluate` gets
a verdict it can audit cell by cell. Every cell is recorded, including the failures; a
strategy that only survives its favorite window does not get a quiet pass. Never touches
live orders.

## Inputs

Required: the proposal with `backtest_spec.robustness_matrix`, the primary `backtests[]`
entry, and its `metrics[]` sheet. Optional: existing snapshots covering matrix cells,
reusable within their freshness window.

## Outputs

`payload.robustness` embedded in the proposal:

- `matrix_results[]`: one entry per cell (window / timeframe / asset / params) with the
  run's stats, its metric sheet, and stamped `sources[]` (provider, command, source
  timestamp, retrieval timestamp) — facts.
- `regime_split`: cells classified trend vs chop with per-regime cost-adjusted excess return
  — facts.
- `checklist`: findings for sample size, parameter cliff, data snooping, leakage,
  survivorship — findings with evidence.
- `thresholds`: the exact degradation thresholds applied — recorded, auditable.
- `verdict`: `robust` | `fragile` | `insufficient-sample`, with the failing cells named — a
  recommendation, clearly separated from the facts above.
- `all_runs_count`: every engine run performed for this proposal, winners and losers alike.

Explicit failure states per cell: `fetch-failed`, `insufficient-candles`,
`window-unachievable` — a matrix with holes is reported with holes; a hole is never a pass.

## Integration

- Each cell executes through the `research-backtest-run` procedure: the fetch command with
  `--out` into `.tribes/org/snapshots/`, true-window verification, one
  `tribes-cli ta backtest` invocation, verbatim engine-limits block.
- Regime classification: `tribes-cli ta indicators --candles-file <cell-snapshot>
--set ema,atr --out <snapshot>` — `trend` up | down → trending, `flat` → chop (EMA20/50
  spread, 0.1% flat band).
- Window mechanics differ by source: `tribes-cli asset candles --ticker --from/--to` gives true
  historical sub-windows; CoinGecko `--days` windows are anchored to now, so alternative
  windows overlap and the artifact must say so; GeckoTerminal's 200-candle cap bounds how far
  token-route windows reach.

## Preconditions

- The matrix was declared in the spec BEFORE any matrix run (data-snooping control).
- Primary run and its metric sheet exist; the proposal is unexpired.
- Comparable-asset cells are pre-declared peers, not winners picked after seeing results.

## Procedure

1. Execute every declared cell via the run procedure, reusing fresh snapshots where the
   series already exists. A new idea mid-pass = extend the matrix in the spec first, then
   run — and count every run in `all_runs_count`.
2. Build each cell's metric sheet via `research-metrics` so comparisons are key-identical.
3. Classify each cell's window trend/chop with the ta `trend` field; compare cost-adjusted
   excess per regime. A mechanism mismatch is a red flag: mean-revert should earn in chop,
   cross-following in trend — earnings concentrated in the regime the mechanism does not
   claim suggests a coincidence, not an edge.
4. Apply the checklist:
   - Sample size: primary run `trades ≥ 5`, else verdict `insufficient-sample` — stop.
   - Parameter cliff: ±20% perturbation cells flip the sign of cost-adjusted excess →
     fragile.
   - Data snooping: `all_runs_count` covers every engine run ever made for this proposal;
     best-cell-only reporting is forbidden.
   - Leakage: the engine is bar-close (no intra-bar look-ahead), but selection leakage —
     asset or window chosen because the outcome was already known — must be declared.
   - Survivorship: peer cells were pre-declared; note it explicitly.
5. Apply the degradation thresholds (defaults below; a spec may tighten, never silently
   loosen): cost-adjusted excess keeps its sign in ≥ 2/3 of window+timeframe cells; no
   cell's `max_drawdown_pct` exceeds 1.5× the primary run's; ≥ 1 comparable-asset cell shows
   non-negative cost-adjusted excess.
6. Set the verdict, name the failing cells, embed `payload.robustness` atomically, add
   `robustness:<verdict>` to `checks[]`.

## Validation

- Cell count equals matrix size — nothing skipped or added silently; holes carry their
  failure state.
- Thresholds are recorded with the values actually applied; the verdict traces to named
  cells; regime labels trace to ta snapshots on disk.

## Risk & safety

- Never tune parameters on the matrix and report the tuned variant as the primary result —
  that is in-sample fitting; a tuned variant restarts as a NEW proposal through
  `research-hypothesis`.
- Never drop a losing cell; never touch orders or instructions.

## Failure & retry

- Cell fetch failure: retry once, then mark the cell `fetch-failed` with the `attempted[]`
  trail and continue the rest of the matrix.
- A cell unachievable within provider caps: mark `window-unachievable` with the cap named —
  the verdict weighs the hole; it is never counted as a pass.
- Auth failure: `tribes-cli login`, retry once, then stop and report.

## Timeouts & rate limits

- N cells = N candle fetches: allow a 120 s bash timeout per `asset candles` fetch, and
  reuse snapshots aggressively — historical candles are `daily`-class data.
- Engine and ta runs are local seconds. Spread fetches across the pass rather than bursting
  one provider.

## Observability

- Every cell has a `run_id` and snapshot paths; `payload.robustness` joins them;
  `all_runs_count` plus the spec's matrix is the complete audit trail of what was tried.

## Escalation

- Verdict → `research-evaluate` (Strategy Evaluator continues).
- `fragile` / `insufficient-sample` → Research Lead: rework the hypothesis or reject.
- A data gap blocking a needed cell class (e.g. no venue-native history) → Engineering
  backlog (`.tribes/org/workorders/backlog.md`).

## Example

```bash
# one matrix cell: same strategy, alternative window, comparable asset
tribes-cli asset candles --id bitcoin --days 365 \
  --out .tribes/org/snapshots/20260730T120000Z-candles-btc.json    # allow 120 s
tribes-cli ta backtest \
  --candles-file .tribes/org/snapshots/20260730T120000Z-candles-btc.json \
  --strategy rsi-revert --rsi-low 30 --rsi-high 70 \
  --out .tribes/org/snapshots/20260730T120000Z-backtest-btc-rsi.json
tribes-cli ta indicators \
  --candles-file .tribes/org/snapshots/20260730T120000Z-candles-btc.json \
  --set ema,atr --out .tribes/org/snapshots/20260730T120000Z-indicators-btc.json
```

Success: `payload.robustness` with 8/9 cells run (one `window-unachievable`: GeckoTerminal
200-candle cap), excess sign held in 5/6 window+timeframe cells, regime split consistent
with the mean-revert mechanism, verdict `robust`, thresholds recorded.

## Acceptance

- [ ] Every declared cell run or marked with an explicit failure state; nothing undeclared.
- [ ] Regime split computed from ta trend fields on the cells' own snapshots.
- [ ] Checklist findings recorded with evidence; thresholds recorded as applied.
- [ ] Verdict names its failing cells; all runs counted; losing cells retained.

## Related skills

- `research-backtest-spec` — declares the matrix and thresholds this skill applies.
- `research-backtest-run` — the per-cell execution procedure.
- `research-metrics` — key-identical sheets for cell comparison.
- `research-evaluate` — consumes the verdict for the promote/reject call.
- `research-hypothesis` — where tuned variants restart as new proposals.
- `technical-analyst` — the ta trend/ATR surface behind regime classification.
- `org-protocol` — envelope, freshness windows, snapshot reuse.
