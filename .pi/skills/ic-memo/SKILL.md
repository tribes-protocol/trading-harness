---
name: ic-memo
description: Investment Committee memo workflow — assemble sponsor thesis, independent risk view, and compliance view into a decision-ready IcMemo with dissents preserved; record the decision and conditions. Use when a trade idea or allocation needs committee review.
---

# Investment Committee Memo

The IC is a governance FORUM, not a department (`docs/OPERATING_MODEL.md`).
Its output is a decision record; its quality bar is auditability. Formality
is configurable — thin CIO-style approval still produces the same artifact.

## Steps

1. **Collect the inputs** — three genuinely independent views:
   - Sponsor thesis: the research note + PM sizing rationale (link paths).
   - Independent risk view: a `RiskAssessment` produced via the
     `risk-review` skill — never written by the sponsor.
   - Compliance view: restricted-list check, MNPI considerations, licensing
     constraints on the data used (e.g. Nansen internal-only), marketing
     implications.
2. **Assemble the memo** (`IcMemoSchema`, `src/schemas/reports.ts`):
   `thesis`, `supportingNotes` (artifact paths), `riskView`,
   `complianceView` — each in its author's own words. Disagreements go in
   `dissents[]` verbatim with attribution.
3. **Decision.** `approved | approved_with_conditions | rejected |
   deferred`. Conditions must be testable ex post (limits, review
   triggers, sunset dates). Set `reviewDate`.
4. **Persist + validate.** Save under `artifacts/memos/`, run
   `npx tsx src/cli/index.ts validate ic-memo <file>`.
5. **Hand off** the decision to `portfolio-management` (and
   `independent-risk` for limit monitoring) via the `handoff` skill.

## Rules

- A memo without an independent risk view is incomplete — do not proceed
  on sponsor input alone.
- Approval over an objection is legitimate; deleting the objection is not.
- Every data-derived claim in the thesis keeps its quality caveats (EOD,
  delayed, model estimates) in the memo text.
