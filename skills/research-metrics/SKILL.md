---
name: research-metrics
description: >-
  Strategy Research skill that turns the engine's aggregate backtest output into one honest,
  comparable metric sheet per run — excess return vs buy-hold, analytic cost adjustment from
  the spec, window-bound return-over-drawdown, and candle-derived volatility context — while
  naming exactly what the engine's output cannot support. Handles: the five aggregate stats,
  cost-adjusted returns, ATR/trend context via ta indicators, and the mandatory not-computable
  list (Sharpe, Sortino, equity-curve stats). Call it on every backtests[] entry before
  robustness or evaluation. NOT for: producing the stats (use research-backtest-run); the
  re-run matrix (use research-robustness); the promote decision (use research-evaluate); ad-hoc
  indicator questions (use technical-analyst).
allowed-tools: bash read
---

# Research: Metrics

## Identity

- Stable id: `research-metrics` — owner: Strategy Research. Invoked by: Backtesting Agent.

## Purpose

Produce one metric sheet per backtest run, with identical keys across runs so evaluation can
compare candidates consistently. Honesty is the product: the engine emits five aggregate
fields and nothing else, so every derived number is labeled for what it is, and every metric
the output cannot support is NAMED as not computable — never approximated into existence.
This skill computes and labels; it never judges, promotes, or trades.

## Inputs

Required: a `payload.backtests[]` entry (stats + `candle_snapshot` path + engine-limits
block), the spec's `costs` block, and the candle snapshot file still on disk. Optional:
sibling runs' sheets, for cross-run key-consistency checks.

## Outputs

One `payload.metrics[]` entry keyed by `run_id`, sections labeled:

- `computable` (exact, from `{trades, win_rate_pct, total_return_pct, buy_hold_return_pct,
max_drawdown_pct}`): the five stats passed through; `excess_return_pct` = total − buy-hold;
  `return_over_drawdown` = total_return_pct / max_drawdown_pct, labeled window-bound — it is
  NOT Calmar and is never annualized.
- `approximation`: `cost_adjusted_return_pct` = total_return_pct − trades × 2 × (fee_pct +
  slippage_pct), and `cost_adjusted_excess_pct` vs buy-hold. Labeled approximation because
  the engine has no per-trade returns — costs subtract linearly, uncompounded.
- `context` (candle-derived, describes the market, not the strategy): ATR14 and ATR as % of
  last close, the ema20/50 `trend` field (up | down | flat), and the 52-period range from
  `ta levels`.
- `not_computable` — present on EVERY sheet, verbatim: Sharpe, Sortino, return volatility,
  profit factor, expectancy, average win/loss, holding periods, exposure time, drawdown
  duration / time under water, any annualized figure. Reason: the engine emits no per-trade
  log and no equity curve. Closing this requires an engine change — Engineering backlog
  (`.tribes/org/workorders/backlog.md`) — not an approximation.
- `flags`: `insufficient-trades` when trades < 5; `null-win-rate` when trades = 0.

All numbers derive from already-stamped snapshots — this skill fetches no market data. The ta
context outputs are snapshotted with `--out` and referenced by path. Explicit failure states:
`snapshot-missing`, `stats-malformed`.

## Integration

- `tribes-cli ta indicators --candles-file <snapshot> --set atr,ema
--out .tribes/org/snapshots/<UTC>-indicators-<slug>.json` — local compute, no network.
- `tribes-cli ta levels --candles-file <snapshot>
--out .tribes/org/snapshots/<UTC>-levels-<slug>.json` — local compute.
- Arithmetic over the engine stats and the spec's `costs`; envelope mechanics: `org-protocol`.

## Preconditions

- The run entry exists with its verbatim engine-limits block; the candle snapshot named in it
  is still on disk (if swept, re-run `research-backtest-run`, do not fetch here).
- The spec's `costs` block carries fee, slippage, and a source label.

## Procedure

1. Read the run entry; verify `stats` has exactly the five engine keys → else
   `stats-malformed`, escalate to Engineering via `eng-triage` (schema drift).
2. Compute the `computable` section; guard division: `max_drawdown_pct` = 0 → record
   `return_over_drawdown: null` with reason.
3. Compute the `approximation` section from the spec's costs, converting slippage bps to pct.
4. Run `ta indicators` (atr, ema) and `ta levels` over the SAME candle snapshot; fill
   `context`. VWAP is skipped — `--id`-sourced candle files carry no volume.
5. Assemble the sheet with the `not_computable` list verbatim and any `flags`.
6. Append to `payload.metrics[]` via atomic rewrite; add `metrics:<run_id>` to `checks[]`.
7. If a downstream consumer asks for a not-computable metric, record the request as a backlog
   line instead of faking the number.

## Validation

- Sheet keys are identical across all runs of this proposal (comparability is the point).
- Every derived number sits in the correct label section; the `not_computable` list is
  present and verbatim; cost figures trace to the spec's `costs` with its source label.
- `context` values come from the same snapshot the engine consumed — never a fresh fetch.

## Risk & safety

- Never invent a metric name implying annualization or risk-adjustment the data cannot
  support; never drop the buy-hold benchmark from a sheet.
- Read-only local compute; no orders, no instructions, no provider spend.

## Failure & retry

- `snapshot-missing`: back to `research-backtest-run` to regenerate; this skill never
  fetches candles.
- `stats-malformed`: no retry — that is engine or embed drift; work order via `eng-triage`.
- ta commands are deterministic local compute — a failure is a malformed file, not a
  transient; refetch upstream rather than looping.

## Timeouts & rate limits

- Everything is local and returns in seconds; default bash timeouts suffice. Zero provider
  budget consumed.

## Observability

- `payload.metrics[]` joins `run_id` to the run entry and to the ta output snapshots by path;
  `checks[]` records each sheet. The backlog file records every engine-gap request.

## Escalation

- Sheets → `research-robustness` (matrix comparison) and `research-evaluate` (verdict).
- Engine-gap requests (per-trade log, equity curve) → Engineering backlog.
- Malformed stats → Engineering work order via `eng-triage`.

## Example

```json
{
  "run_id": "20260730T113000Z",
  "computable": {
    "trades": 7,
    "win_rate_pct": 57.1,
    "total_return_pct": 12.4,
    "buy_hold_return_pct": 9.8,
    "excess_return_pct": 2.6,
    "max_drawdown_pct": 8.2,
    "return_over_drawdown": 1.51
  },
  "approximation": { "cost_adjusted_return_pct": 11.7, "cost_adjusted_excess_pct": 1.9 },
  "context": { "atr14_pct_of_close": 2.8, "trend": "flat", "range_52": [2100, 2950] },
  "not_computable": "Sharpe, Sortino, return volatility, profit factor, expectancy, average win/loss, holding periods, exposure time, drawdown duration, annualized figures — engine emits no per-trade log or equity curve; Engineering backlog",
  "flags": []
}
```

Success: the sheet appends atomically with `checks[]` updated, and every downstream consumer
can compare it key-for-key against any other run's sheet.

## Acceptance

- [ ] Five engine stats passed through unmodified; derived numbers in labeled sections.
- [ ] Cost adjustment uses the spec's costs and is labeled approximation.
- [ ] `not_computable` list present verbatim on the sheet; no faked metrics anywhere.
- [ ] Context computed from the same snapshot the engine consumed; sheets key-identical.

## Related skills

- `research-backtest-run` — produces the stats and snapshots this skill consumes.
- `research-robustness` — compares these sheets across the matrix.
- `research-evaluate` — consumes the sheets for the promote/reject call.
- `research-backtest-spec` — source of the cost assumptions.
- `technical-analyst` — background on the ta indicator surface.
- `eng-triage` — escalation for schema drift and engine gaps.
- `org-protocol` — envelope, checks, snapshot layout.
