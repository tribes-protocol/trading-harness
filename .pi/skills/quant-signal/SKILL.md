---
name: quant-signal
description: Quantitative Research workflow — specify, test, and document a signal with out-of-sample discipline and mandatory caveats, then submit to model validation. Use for signal ideas, factor work, or backtest reviews.
---

# Quant Signal Workflow

Mandate: `quant-research` in `docs/OPERATING_MODEL.md`. Development is
first line; validation is a separate second-line function
(`model-validation`) — you do not validate your own model.

## Steps

1. **Pre-register the hypothesis.** Before touching data: economic
   rationale, universe, horizon, expected sign, and the falsification
   criterion. Record it — this is your defense against overfitting
   accusations later.
2. **Data discipline.** Pull via the platform (CLI/services) so lineage and
   quality flags come along. Point-in-time correctness: macro inputs use
   FRED vintages (`--vintage point_in_time`); price adjustments are
   explicit and consistent; survivorship of the universe is stated.
3. **Test honestly.** In-sample/out-of-sample split declared up front;
   transaction-cost and capacity assumptions stated; parameter count vs
   sample size sanity-checked. Every backtest result is `model_estimate`.
4. **Document as a Signal artifact** (`SignalSchema`,
   `src/schemas/signals.ts`): hypothesis, methodology, direction, horizon,
   confidence, and a `BacktestSummary` whose `caveats[]` is non-empty by
   schema design — overfitting risk, cost realism, and data caveats are
   mandatory, not optional.
5. **Submit to validation.** Handoff to `model-validation` with: the signal
   artifact, data lineage, code/method description sufficient to
   reproduce, and known weaknesses. Validation's findings come back as
   their artifact; disagreements persist in both.
6. **Only after validation** does the signal go to `portfolio-management`
   with the validation reference attached.

## Rules

- No out-of-sample, no signal — an in-sample-only result is a research
  note about an idea, not a signal.
- Changing the hypothesis after seeing results restarts the process (and
  is recorded as such).
- Sharpe ratios without cost assumptions are marketing, not research.
