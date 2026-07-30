---
name: portfolio-exposure
description: >-
  Portfolio Management skill that computes the book's risk picture from venue and wallet reads:
  per-position and aggregate notional, margin usage, leverage, liquidation distances, account
  equity and drawdown from the venue portfolio series, concentration by asset/class/dex, and
  the realized vs unrealized P&L split. Handles: exposure and concentration reports, margin
  headroom for sizing, and labeled correlated-exposure notes (same-sector HIP-3, BTC-beta).
  Call it on every monitoring pass and before any instruction is minted. NOT for:
  expected-vs-venue diffs or adopting externals (use portfolio-reconcile); threshold evaluation
  and trigger events (use portfolio-triggers); sizing and minting instructions (use
  portfolio-rebalance); third-party wallet analytics (use wallet-analyst).
allowed-tools: bash read
---

# Portfolio: Exposure

## Identity

- Stable id: `portfolio-exposure` — owner: Portfolio Management. Invoked by: Exposure & Risk
  Monitor.

## Purpose

Turn the reconciled book into numbers the Portfolio Manager and Trigger Manager can act on:
how much is at risk, where it concentrates, how levered it is, how far liquidations sit, and
how equity has moved. Facts are computed; correlation notes are labeled hypotheses. This skill
never evaluates thresholds, never decides, and never mutates anything.

## Inputs

Required: the account EVM address (`tribes-cli wallet list`); a reconcile report fresh within
its `live` window (run `portfolio-reconcile` first if missing); the pass's all-dex asset
snapshot for marks. Optional: strategy ids on `positions/` entries (for per-strategy exposure
rollups consumed by `portfolio-triggers`).

## Outputs

An exposure report at `.tribes/org/snapshots/<UTC>-exposure.json`, separating:

- Facts: per-position notional, margin used, leverage, liquidation distance; aggregate gross/
  net notional, margin utilization, withdrawable; equity now, peak, and drawdown from the
  venue portfolio series; concentration shares by asset, class (crypto / HIP-3 stock / HIP-3
  commodity dex), and dex; realized vs unrealized split; per-strategy exposure rollups. Every
  market-data fact carries provider + command + `source_ts` + `retrieved_at` (`org-protocol`).
- Hypotheses: correlated-exposure notes — same-sector HIP-3 groupings, BTC-beta of alt
  positions — labeled as hypotheses, never as facts.
- Stated limits: funding-vs-price P&L attribution is NOT separable with current commands; the
  report says so rather than estimating silently.

No artifact state is produced; the report feeds `portfolio-triggers` and `portfolio-rebalance`.

## Integration

- `tribes-cli hyperliquid list-positions --address <addr> --all-dexes --out <file>` — size,
  entry, unrealized PnL, liquidation price, leverage, margin used per position.
- `tribes-cli hyperliquid list-balances --address <addr>` (`--dex <dex>` per builder dex) —
  accountValue, withdrawable, totalMarginUsed.
- `tribes-cli hyperliquid portfolio --address <addr> --out <file>` — account-value and P&L
  history series for equity, drawdown, and the realized component.
- `tribes-cli hyperliquid list-assets --all-dexes --out <file>` — marks (markPx), maxLeverage,
  funding context; reuse the pass's snapshot within its `live` window.
- `tribes-cli wallet assets --wallet-addresses <addr...> --out <file>` — off-venue balances
  plus realized/unrealized USD fields for the cross-venue split.
- Definitions of freshness, envelope source stamps, snapshot reuse: `org-protocol`.

## Preconditions

- Reconcile report fresh (its classifications are what make "expected book" trustworthy); a
  report with `unverified` sections limits this skill to the verified assets and says so.
- Marks are `live`; stale marks are never used for exposure math (`org-protocol` rule: stale
  data never sizes or triggers).

## Procedure

1. Load the reconcile report; refuse to compute over `discrepancy` assets (list them as
   excluded). Pull or reuse positions, balances, marks, portfolio series, wallet assets.
2. Per position: notional = |size| x markPx; liquidation distance % = |markPx - liqPx| /
   markPx; record leverage (value + mode), marginUsed, unrealized PnL, dex, class.
3. Aggregates: gross = sum |notional|; net = sum signed notional; margin utilization =
   totalMarginUsed / accountValue; headroom = withdrawable and remaining leverage capacity
   against each asset's maxLeverage.
4. Equity and drawdown: from the portfolio series — current equity, window peak, drawdown % =
   (peak - current) / peak; note the window used.
5. Concentration: share of gross by asset, by class (main-dex crypto vs HIP-3 stock vs HIP-3
   commodity dexes), by dex; per-strategy rollups where positions carry strategy ids.
6. Realized vs unrealized: unrealized from list-positions (venue) plus wallet-assets
   unrealized field off-venue; realized from the portfolio P&L series and wallet-assets
   realized field; state the windows — do not net across unstated windows.
7. Correlated-exposure notes (hypotheses): group same-sector HIP-3 perps; flag aggregate
   BTC-beta of alt longs; cite which positions drive each note.
8. Write the report atomically to `snapshots/` with all source stamps embedded.

## Validation

- Every number is re-derivable from inputs embedded (or path-referenced) in the report.
- Marks used were `live` at computation time; excluded assets are listed with reasons.
- Facts and hypotheses are separated structurally, not by prose.
- Percentages sum sanely (concentration shares of gross sum to ~100%).

## Risk & safety

- Reads only; no mutation, no instruction, no threshold verdicts (that is
  `portfolio-triggers`' job — this skill supplies its inputs).
- Never compute exposure over stale marks or unreconciled state; refuse and say why.
- Measurement is independent of the decision path: performance numbers never leave without
  their data-quality footnotes, and unresolved reconciliation breaks from
  `portfolio-reconcile` CAP the stated confidence of any P&L attribution they touch — the
  book's grader never smooths over the book's breaks.
- No credentials or wallet ids in the report.

## Failure & retry

- Auth failure: `tribes-cli login`, retry once, else stop and report.
- A pull failing twice → the affected metric is omitted and named in `stated limits`; if the
  venue portfolio series is unavailable, equity/drawdown fall back to the current
  accountValue with an explicit `no-history` mark (usable for reporting, never for triggers).
- Persistent provider failure → Engineering work order (`eng-triage`).

## Timeouts & rate limits

- 60 s bash timeout per read; `--out` on positions, assets, portfolio, and wallet-assets
  pulls (large outputs).
- Reuse pass snapshots within freshness windows; this skill triggers no extra all-dex sweep.

## Observability

- The exposure snapshot is the record: inputs, math, exclusions, hypotheses, source stamps.
  Reports are keyed by UTC and retained per the snapshot policy (last 5), giving the Trigger
  Manager a short usable history.

## Escalation

- Threshold proximity or breach is NOT decided here — the report goes to the Trigger Manager
  (`portfolio-triggers`), which owns evaluation and escalation.
- Excluded/discrepancy assets → already halted by `portfolio-reconcile`; this report keeps
  them visible until cleared.
- Data failures → Engineering work order via the Portfolio Manager.

## Example

```bash
tribes-cli hyperliquid portfolio --address 0xWALLET \
  --out .tribes/org/snapshots/20260730T091000Z-portfolio.json
tribes-cli hyperliquid list-positions --address 0xWALLET --all-dexes \
  --out .tribes/org/snapshots/20260730T091000Z-positions.json
```

Success: report shows gross $18.4k / net +$6.2k across 4 positions, margin utilization 31%,
worst liquidation distance 24% (ETH long), drawdown 4.1% from the window peak, concentration
BTC 38% / HIP-3 stocks 22%, realized +$310 vs unrealized -$85 (windows stated), one hypothesis
note: two same-sector HIP-3 stock perps move together.

## Acceptance

- [ ] Every fact carries sources and was computed from `live` marks on reconciled state.
- [ ] Notional, margin, leverage, liquidation distance, drawdown, concentration, and the
      realized/unrealized split are all present or explicitly named as unavailable.
- [ ] Hypotheses labeled; stated limits section present; excluded assets listed.
- [ ] Reads only; report written atomically to `snapshots/`.

## Related skills

- `portfolio-reconcile` — produces the reconciled book this skill computes over.
- `portfolio-triggers` — consumes this report to evaluate thresholds.
- `portfolio-rebalance` — consumes headroom and concentration for portfolio fit.
- `org-protocol` — envelope, freshness classes, snapshot rules.
- `hyperliquid` — read-command reference.
- `wallet-analyst` — deeper third-party wallet analytics outside the org loop.
