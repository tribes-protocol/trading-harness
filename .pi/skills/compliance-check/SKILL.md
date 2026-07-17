---
name: compliance-check
description: Compliance, Controls & Auditability workflow — restricted-list screening, MNPI handling, data-licensing checks, record-retention discipline, and surveillance escalations. Use before publishing artifacts, when MNPI risk appears, or for periodic control reviews.
---

# Compliance Check

Mandate: `compliance` in `docs/OPERATING_MODEL.md` (second line; includes
Market Surveillance as a named team). Compliance tests the process and
challenges the first line — it does not produce investment views.

## Steps

1. **Scope.** What artifact/activity is being checked (note, memo, trade
   intent, external report)?
2. **Restricted list.** Screen instruments against
   `artifacts/restricted-list.json` (create the file structure if absent;
   absence of a maintained list is itself a finding). Matches block the
   artifact until cleared.
3. **MNPI review.** Source audit of the artifact: expert-network content,
   non-public documents, single-source "scoops". Anything plausibly
   material and non-public → stop distribution, record the event, quarantine
   the artifact.
4. **Data licensing.** Check the artifact's data sources against registry
   licensing (`pi registry <id> --json`):
   - FRED-derived output carries the required attribution string.
   - Nansen-derived content stays internal (redistribution restricted).
   - Anything marked delayed/EOD is not described as real-time.
   - Storage-restricted providers (FRED, Birdeye) are not being disk-cached.
5. **Record retention.** Artifacts are in `artifacts/` with schema
   versions, timestamps, and lineage; handoffs validate
   (`pi validate handoff`). Missing decision records are findings.
6. **Surveillance screen** (named team within compliance): unusual
   patterns worth escalation — trading themes ahead of events in
   artifacts, systematic use of restricted sources. Escalations are
   handoffs to the relevant department head with facts, not accusations.
7. **Issue the compliance view** as a `ResearchNote` (department
   `compliance`): pass / pass-with-conditions / blocked, each finding
   traceable to a rule or licensing clause.

## Rules

- Cleared-with-conditions requires conditions someone can verify later.
- Compliance findings are never edited by the first line; disagreement is
  recorded as dissent alongside.
- When in doubt about MNPI, the answer is stop-and-escalate, not
  "probably fine".
