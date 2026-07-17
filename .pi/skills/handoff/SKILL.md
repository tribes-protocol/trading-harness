---
name: handoff
description: Create and validate an inter-department handoff artifact (the platform's unit of auditability). Use whenever material findings cross a department boundary — research → PM, PM → risk, quant → model validation, news → any desk.
---

# Department Handoff

Every material handoff between departments is a validated JSON artifact.
Department ids come from `src/departments/departments.ts` (see
`docs/OPERATING_MODEL.md` for mandates and canonical flows).

## Steps

1. Confirm both department ids exist in `DEPARTMENT_IDS`
   (`src/departments/departments.ts`). Route to the *function that owns the
   decision* (e.g. venue approval goes to `independent-risk`, not PM).
2. Build the handoff JSON with every required field of `HandoffSchema`
   (`src/schemas/reports.ts`):
   - `fromDepartment`, `toDepartment`, `subject`
   - `dataSources`: providers/endpoints/artifact paths actually used
   - `analyticalMethods`: what was done, reproducibly
   - `findings[]`: each with `statement`, `evidenceType`
     (observed | calculated | model_estimate | hypothesis | assumption |
     analyst_judgment), `support[]`, `confidence`
   - `assumptions`, `limitations`, `unresolvedQuestions`
   - `recommendedNextAction` (specific, not "monitor")
   - `dissents[]`: verbatim disagreements — NEVER dropped or averaged
3. Save to `artifacts/handoffs/<yyyy-mm-dd>-<slug>.json` (or use
   `saveHandoff` from `src/departments/handoff.ts` in a script).
4. Validate: `npx tsx src/cli/index.ts validate handoff <file>` — must print
   `OK`. Fix any issue rather than loosening content.

## Rules

- Quality flags from source data propagate into findings language: EOD data
  is described as "as of <date> close", delayed as "delayed", model output
  (sentiment, smart-money labels) as estimates — never as observed fact.
- Confidence reflects evidence, not conviction. If two sources disagree,
  say so in `limitations` and keep both values.
- A handoff that would embarrass you in an audit is not ready to send.
