---
name: research-backtest-run
description: >-
  Strategy Research skill that executes one backtest spec against the local ta engine — fetch
  the specified candles to a file with --out, verify the true window from candle timestamps,
  run ta backtest, and embed the aggregate result with the engine's limits quoted verbatim.
  Handles: candle fetching per spec, ma-cross and rsi-revert runs, zero-trade honesty, and
  snapshotting inputs and outputs under .tribes/org/snapshots/. Call it on a proposal whose
  backtest_spec is written. NOT for: choosing sources or parameters (use
  research-backtest-spec); interpreting the numbers (use research-metrics); the re-run matrix
  (use research-robustness); ad-hoc indicator or backtest questions outside the org (use
  technical-analyst).
allowed-tools: bash read
---

# Research: Backtest Run

## Identity

- Stable id: `research-backtest-run` — owner: Strategy Research. Invoked by: Backtesting Agent.

## Purpose

Execute one declared backtest cell mechanically and reproducibly: run the spec's fetch command
exactly, prove what data actually arrived, run one engine command, and record the aggregate
result with the engine's limits attached verbatim. The engine is `tribes-cli ta backtest` and
it is deliberately small — EXACTLY two strategies (`ma-cross`, `rsi-revert`), long-only. This
skill never chooses parameters, never interprets results, and never touches live orders.

ENGINE LIMITS — copy this block verbatim into every result:

> ta backtest: exactly two strategies (ma-cross, rsi-revert); long-only; bar-close fills; one
> position at a time; no fees, no slippage, no shorting, no position sizing, no stops; RSI
> length fixed at 14; open position force-closed at the final close; aggregate stats only —
> no per-trade log, no equity curve, no parameter sweep.

## Inputs

Required: a proposal with `payload.backtest_spec` (strategy, params, verbatim fetch command,
minimum candle count). Optional: an existing candle snapshot for the same series, reusable
within its `org-protocol` freshness window instead of refetching.

## Outputs

One entry appended to `payload.backtests[]` (facts only, no judgment):

- `run_id` (`<UTC compact>`), `strategy` + params actually passed.
- `candle_snapshot` path + `source` provider from the candle file.
- `true_window`: first/last candle `t` as ISO dates + candle count — never the requested
  `--days`.
- `stats` verbatim from the engine: `trades`, `win_rate_pct` (null when 0 trades),
  `total_return_pct`, `buy_hold_return_pct`, `max_drawdown_pct`.
- `engine_limits`: the verbatim block above.
- `sources[]`: provider, exact fetch command, source timestamp (last candle `t`), retrieval
  timestamp (`date -u` at fetch) per `org-protocol`.

Explicit failure states: `fetch-failed` (with the router's `attempted[]` trail),
`insufficient-candles`, `engine-rejected-file`. A zero-trade run is a recorded RESULT, not a
failure — no trigger in the window is evidence.

## Integration

- Fetch: the spec's command verbatim — `tribes-cli asset candles ...` (incl. `--perp` for
  venue-native Hyperliquid series in the shared contract), `tribes-cli coin ohlc ...`,
  `tribes-cli stocks candles ...`, or raw `tribes-cli hyperliquid candles` (longer windows;
  NOT the ta contract, so the spec's declared transform step is mandatory before the engine
  sees it) — always with `--out .tribes/org/snapshots/<UTC>-candles-<slug>.json`.
- Engine: `tribes-cli ta backtest --candles-file <snapshot> --strategy ma-cross|rsi-revert
[--fast <n> --slow <n> | --rsi-low <n> --rsi-high <n>]
--out .tribes/org/snapshots/<UTC>-backtest-<slug>.json` — pure local compute, no network.
- Candle contract `{source, candles: [{t,o,h,l,c,v}]}`, ≥ 2 candles, produced ONLY by a source
  command's `--out` — never hand-built, never hand-edited.

## Preconditions

- `backtest_spec` exists and its parameters sit inside engine bounds (fast < slow, both 2-500;
  rsi thresholds 1-99, low < high; RSI length is fixed at 14 regardless).
- `.tribes/org/snapshots/` exists (`mkdir -p`); the proposal is unexpired.
- The cell being run is declared in the spec or its robustness matrix (no undeclared runs).

## Procedure

1. Reuse a fresh-enough existing snapshot if one covers the same series; otherwise run the
   spec's fetch command exactly, with `--out` into `snapshots/`, and stamp `retrieved_at`
   with `date -u +%Y-%m-%dT%H:%M:%SZ`.
2. Verify the file: candle count and first/last `t`. State the TRUE date range — never equate
   `--days N` with N candles or N days of history. Count below the spec minimum →
   `insufficient-candles`, back to `research-backtest-spec`.
3. Note the forming final bar: the last candle may be incomplete. For stocks, prefer `--to`
   yesterday; otherwise record the caveat in the result.
4. Run ONE engine command per the spec cell; parse the JSON output.
5. Append the result entry — stats verbatim, ENGINE LIMITS block verbatim, `sources[]`
   stamped — to `payload.backtests[]` via atomic rewrite; add `backtest-run:<run_id>` to
   `checks[]`. Keep both snapshots (input candles, output stats).
6. Zero trades: record it honestly with `win_rate_pct: null`; flag `insufficient-trades` for
   the metrics step rather than widening parameters to force activity.

## Validation

- `stats` carries exactly the five engine fields, unmodified.
- The ENGINE LIMITS block is present verbatim; the true window comes from candle timestamps.
- The input snapshot is named in the result so any auditor can re-run bit-for-bit.
- Exactly one engine invocation per result entry.

## Risk & safety

- Read-only data + local compute — never an order path, never account-mutating.
- Never hand-edit a candle file; on engine rejection, refetch with `--out`.
- Never run cells outside the declared spec/matrix — an undeclared run is data snooping;
  extend the matrix first (`research-backtest-spec`), then run, and count every run.
- Ugly results are embedded exactly like good ones.

## Failure & retry

- Fetch failure: the router's `attempted[]` names each provider and reason — retry the
  command once, then record `fetch-failed` with that trail and escalate.
- Auth failure: `tribes-cli login`, retry once, then stop and report.
- `engine-rejected-file`: refetch (the file was malformed or truncated); never edit it.
- Engine runs are deterministic — a "retry" of local compute changes nothing; do not loop.

## Timeouts & rate limits

- Candle fetches ride multi-provider fallback chains — allow a 120 s bash timeout on
  `asset candles` fetches. `ta backtest` is local and returns in seconds.
- One fetch per declared cell; reuse snapshots within their freshness window. Historical
  candles are `daily`-class data — refetching them every run wastes provider budget.

## Observability

- `snapshots/` holds the exact inputs and outputs; `payload.backtests[]` joins `run_id` to
  snapshot paths; `checks[]` records each run. Everything needed to reproduce is on disk.

## Escalation

- Results → `research-metrics` (Backtesting Agent continues).
- `insufficient-candles` / window problems → `research-backtest-spec`.
- Persistent provider failures → Engineering work order via `eng-triage`; nothing from this
  skill goes to Portfolio Management directly.

## Example

```bash
mkdir -p .tribes/org/snapshots
tribes-cli asset candles --id ethereum --days 180 \
  --out .tribes/org/snapshots/20260730T113000Z-candles-eth.json     # allow 120 s
tribes-cli ta backtest \
  --candles-file .tribes/org/snapshots/20260730T113000Z-candles-eth.json \
  --strategy rsi-revert --rsi-low 30 --rsi-high 70 \
  --out .tribes/org/snapshots/20260730T113000Z-backtest-eth-rsi.json
```

Success: `payload.backtests[]` gains
`{run_id: "20260730T113000Z", stats: {trades: 7, win_rate_pct: 57.1, total_return_pct: 12.4,
buy_hold_return_pct: 9.8, max_drawdown_pct: 8.2}, true_window: "2026-02-01 → 2026-07-29,
180 candles", engine_limits: "<verbatim block>"}` with stamped `sources[]`.

## Acceptance

- [ ] Fetch command run verbatim from the spec; snapshot written with `--out`.
- [ ] True window verified from candle `t` values and stated; minimum sample enforced.
- [ ] Stats verbatim; ENGINE LIMITS block copied verbatim into the result.
- [ ] Every run declared, counted, and embedded — including zero-trade and ugly results.

## Related skills

- `research-backtest-spec` — declares the cell this skill executes.
- `research-metrics` — turns these stats into the honest metric sheet.
- `research-robustness` — repeats this procedure across the declared matrix.
- `technical-analyst` — the two-step candle-then-compute recipe behind the engine.
- `asset-data` — router semantics and the attempted-trail on fetch failures.
- `hyperliquid` — venue-native candles flag reference.
- `eng-triage` — escalation path for persistent provider failures.
- `org-protocol` — envelope, freshness classes, snapshot layout.
