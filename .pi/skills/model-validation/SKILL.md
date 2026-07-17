---
name: model-validation
description: Model Validation & Governance workflow — independently validate a submitted model/signal, maintain the model inventory, and issue findings with effective challenge. Use when quant-research submits a model, on periodic reviews, or after material model changes.
---

# Model Validation Workflow

Mandate: `model-validation` in `docs/OPERATING_MODEL.md`. SR 11-7 adapted:
validation is organizationally separate from development, with effective
challenge — the authority and incentive to say no.

## Steps

1. **Inventory first.** Register/refresh the model's entry in
   `artifacts/model-inventory.json` (create if absent): id, owner
   (department), purpose, tier by materiality (P&L impact, breadth of use,
   complexity), last validation date, status. Tiering drives depth of
   review.
2. **Reproduce before you critique.** From the submission handoff's data
   lineage and methodology, re-run the core result. If you cannot
   reproduce it from the artifact alone, that IS the finding — return it
   as such.
3. **Challenge on three axes:**
   - *Conceptual soundness*: does the economic rationale survive scrutiny?
     Pre-registration honored, or was the hypothesis moved after results?
   - *Data integrity*: point-in-time correctness (vintages), survivorship,
     adjustment consistency, quality flags on inputs, leakage across the
     IS/OOS boundary.
   - *Outcomes analysis*: OOS degradation vs in-sample, sensitivity to
     parameters and costs, capacity realism, behavior in stress windows.
4. **Issue findings** as a `ResearchNote` (department `model-validation`):
   each finding with severity and required remediation;
   overall verdict — approved / approved-with-conditions (testable) /
   rejected. Developer disagreement is recorded verbatim as dissent, never
   arbitrated away.
5. **Hand off** to `quant-research` (findings) and `independent-risk`
   (inventory/tier changes). Approved models get their validation
   reference attached before any PM use.
6. **Periodic review:** tier-based cadence; any material change to data,
   code, or use re-triggers validation.

## Rules

- You validate the model as submitted — if the developer "fixes" it
  mid-review, the review restarts on the new version.
- A model with no falsification criterion cannot be validated.
- Findings are about the model, not the developer; but they are never
  softened for comfort.
