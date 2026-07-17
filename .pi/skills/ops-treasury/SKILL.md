---
name: ops-treasury
description: Trade Operations & Treasury Analytics workflow — position/cash reconciliation, break investigation, margin/collateral/counterparty exposure review. Use for book integrity checks, settlement-lifecycle questions, or counterparty exposure reviews.
---

# Operations & Treasury Workflow

Mandates: `operations` and `treasury` in `docs/OPERATING_MODEL.md` — kept
as distinct functions (different clocks: T+0/T+1 ops vs continuous
treasury) sharing one data backbone. First-line execution functions; their
independence value is *mechanical honesty*: books must tie out.

## Operations steps

1. **Reconcile positions.** Compare the portfolio artifact
   (`artifacts/portfolios/*.json`) against independently pulled market
   data: every position re-valued via the CLI; quantity/identifier
   mismatches and stale marks become break records.
2. **Investigate breaks.** Each break: instrument, expected vs observed,
   plausible cause (corporate action missed? identifier drift? currency
   mixup?), owner, and aging. Corporate-action checks via the
   marketstack adapter (splits/dividends) for equities.
3. **Report.** A `ResearchNote` (department `operations`) listing breaks
   with severity and aging; unresolved breaks hand off to
   `portfolio-management` and `performance-reporting` (their numbers are
   wrong too until cleared).

## Treasury steps

1. **Cash & collateral map.** Cash balances by currency and venue from the
   portfolio artifact; for crypto venues, wallet balances verified
   on-chain (`pi wallet <chain> <address> --json`) — self-custody claims
   get checked, not assumed.
2. **Counterparty exposure.** Aggregate exposure per venue/counterparty
   (including unsettled amounts); tier venues by the risk desk's approved
   list (approval belongs to `independent-risk`).
3. **Margin & financing.** Where leverage exists, compute headroom under
   stress marks (reuse risk's scenarios); financing costs are
   `calculated` with source stated.
4. **Report + hand off** concentration or headroom concerns to
   `independent-risk` as a handoff with numbers, not adjectives.

## Rules

- A reconciliation that "mostly ties" is a list of breaks, not a pass.
- On-chain balances are `observed`; exchange-reported balances are
  `provider-reported` and labeled as such.
- Treasury never nets exposures across counterparties without a netting
  basis stated.
