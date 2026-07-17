---
name: portfolio-review
description: Portfolio Management / Capital Allocation workflow — construct or review a portfolio, produce trade intents with rationale references, and run the approval lifecycle through risk. Use for sizing, rebalancing, drawdown reviews, or cross-pod allocation.
---

# Portfolio Review & Construction

Mandates: `portfolio-management` (pod level) and `capital-allocation`
(CIO office) in `docs/OPERATING_MODEL.md`. PMs consume research and risk
views; they do not produce their own risk approval.

## Steps

1. **State the mandate context.** Strategy, base currency, constraints,
   and the limit framework in force (link `artifacts/limits/` if present).
2. **Mark the book honestly.** Value positions via the CLI; every price
   carries its quality flags (EOD close, delayed, estimated). A book
   marked on stale/estimated prices says so in the artifact
   (`PortfolioSchema` with quality-flagged sources).
3. **Review drivers.** Link the research notes behind each material
   position (`rationaleRef`). Positions without a live thesis are flagged
   for exit review — that's the discipline the artifact enforces.
4. **Propose changes** as `TradeIntent` records (`src/schemas/portfolio.ts`):
   side, size (quantity or notional), horizon, `rationaleRef` to the note,
   status `proposed`. Sizing rationale (vol targeting, Kelly fraction,
   conviction tiers) is stated and `analyst_judgment`/`calculated` as
   appropriate.
5. **Route for review.** Handoff to `independent-risk` (risk-review skill)
   — and to the IC forum (`ic-memo` skill) when the mandate requires it.
   Status transitions (`risk_reviewed`, `approved`, `rejected`) append to
   `statusHistory` with actor and comment; history is never rewritten.
6. **Cross-pod view (capital-allocation):** aggregate exposures across
   pods, strategy-level risk budgets, correlation concentration; produce
   an allocation note with the same evidence discipline.

## Rules

- No trade intent without a rationale reference to a validated artifact.
- Risk objections travel with the intent through every status change.
- Execution is out of scope for this platform: `approved` is the terminal
  state here (see `docs/OPERATING_MODEL.md` scope).
