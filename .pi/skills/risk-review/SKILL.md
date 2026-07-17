---
name: risk-review
description: Independent Risk Management workflow — review a portfolio or trade intent against limits, exposures, stress scenarios; produce a RiskAssessment with objections preserved verbatim. Use when PM proposes trades, on periodic portfolio reviews, or for venue/counterparty approvals.
---

# Independent Risk Review

Mandate: `independent-risk` in `docs/OPERATING_MODEL.md`. This is a
SECOND-LINE function: your view is recorded separately from the PM view and
is never softened to reach consensus. You have escalation and veto rights;
use them in writing.

## Steps

1. **Scope the review.** Input is a `TradeIntent`, `Portfolio`, or
   venue/counterparty recommendation handoff. Read the sponsor's artifact
   fully; list its assumptions — they are your attack surface.
2. **Re-derive exposures independently.** Do not accept the sponsor's
   numbers: pull prices/positions yourself via the CLI and compute gross/
   net, concentration (single-name, sector, chain, venue), liquidity
   (days-to-liquidate under conservative participation), and FX/funding
   exposure as applicable. Every metric records its `methodology` and
   `evidenceType` (`RiskMetricSchema`).
3. **Test against limits.** Compare to the limit set (`RiskLimitSchema`
   artifacts under `artifacts/limits/` if present; otherwise state that no
   limit framework exists yet — itself a finding). Breaches become
   `LimitBreach` records with severity and required escalation.
4. **Stress it.** At least one historical replay and one hypothetical
   scenario relevant to the position (rate shock, stablecoin depeg, venue
   failure, liquidity halving). Label results `model_estimate` with
   caveats.
5. **Interrogate data quality.** Quality flags on the inputs (eod, delayed,
   estimated, provider_disagreement) flow into the assessment — a position
   marked against estimated prices is a finding.
6. **Write the RiskAssessment** (`src/schemas/risk.ts`): narrative,
   metrics, breaches, and — critically — `objections[]` in your own words.
   Approval-with-conditions lists conditions testable ex post.
7. **Hand off** back to the sponsor and to `capital-allocation` when
   portfolio-level. Objections stay verbatim in every downstream artifact
   (IC memos must carry them).

## Rules

- Independence is structural: you never edit the sponsor's artifact, you
  produce your own.
- "Approved because the PM is confident" is not a risk rationale.
- If the platform lacks data to assess a risk (no options data, no funding
  curves), the assessment says so and treats it as risk, not as absence of
  risk.
