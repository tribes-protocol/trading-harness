---
name: performance-report
description: Performance & Reporting workflow — measurement, attribution, and IC/investor reporting production, independent of the decision forum. Use for period performance reviews, attribution questions, or report assembly.
---

# Performance Measurement & Reporting

Mandate: `performance-reporting` in `docs/OPERATING_MODEL.md` — reporting
production is deliberately outside the IC and outside PM (research
finding: the decision forum must not grade its own homework).

## Steps

1. **Define the measurement window and basis.** Time-weighted vs
   money-weighted stated; valuation basis is the ops-reconciled book (link
   the reconciliation note — unreconciled books produce draft reports
   only, labeled DRAFT).
2. **Compute returns** from schema-valid price series with explicit
   adjustment handling (dividends/splits per `docs/DATA_STANDARDS.md`).
   FX conversion to base currency is explicit (`converted` quality flag,
   rate source named — FRED reference rates are daily).
3. **Attribute honestly.** Decompose by strategy/desk/asset class as the
   book supports; interaction/residual terms are shown, not buried.
   Attribution methodology is named and consistent period over period —
   method changes are disclosed in the report.
4. **Contextualize with quality flags.** Positions marked on estimated or
   stale prices are footnoted; crypto marked off DEX prices notes
   liquidity basis. Delayed/EOD data language rules apply.
5. **Assemble the report** as a `ResearchNote` (department
   `performance-reporting`) + human-readable summary: performance,
   attribution, data-quality footnotes, limit breaches in the period
   (from risk artifacts), and open IC conditions falling due
   (`reviewDate` sweep over `artifacts/memos/`).
6. **Hand off** to `capital-allocation` and `compliance` (marketing-rule
   sensitivity on any externally-shared number).

## Rules

- Numbers without their data-quality footnotes do not leave this
  department.
- Attribution never overrides ops breaks — unresolved breaks cap the
  report at DRAFT.
- FRED attribution string on any report using FRED data.
