# Operating Model

Institutional operating model for the Pi research platform, synthesized from
documentation-first research (records in `docs/research/operating-model/`,
sources include SEC/FCA/ESMA regimes, AIFMD Art. 15, SR 11-7, MAR Art. 16,
IIA three-lines model, AIMA/MFA/GIPS practice literature). Machine-readable
descriptors live in `src/departments/departments.ts`.

## Structure: three lines of defense

- **First line** — research desks, portfolio management, trading operations,
  treasury, data platform: they own and execute investment and operational
  processes.
- **Second line** — independent risk, model validation, compliance: policy,
  monitoring, effective challenge. Fully independent reporting lines (CRO/CCO
  never report to the CIO).
- **Third line** — internal audit: modeled as an out-of-scope external
  function for this harness (periodic, not workflow-embedded).

## Departments (modeled in the harness)

### Front office — research

| id | Department | Mandate (summary) |
|---|---|---|
| `global-macro` | Global Macro Research | Policy path, rates, inflation, growth, **and FX** (research finding: buy-side FX is priced off the same policy/flow analysis macro owns — bank-style "Commodities & FX" pairing was rejected). Uses FRED vintages for revision-safe analysis. |
| `equity-research` | Equity Research | Single names, sectors, indices, ETFs: screening, fundamental work, relative value. EOD data via Marketstack; news flow via NewsData. |
| `fixed-income-credit` | Fixed-Income & Credit Research | Curves, carry, spreads (Treasury curves, ICE BofA OAS series via FRED), credit cycle work. Constraint recorded honestly: no bond-level terms & conditions or dealer-run data among current providers. |
| `commodities` | Commodities Research | Standalone physical-data-driven desk (split from FX per research). Term-structure data limited: FRED spot/index series; no futures-curve provider currently — recorded as a coverage gap. |
| `crypto-onchain` | Crypto & On-Chain Research | Protocol fundamentals, flows (smart-money via Nansen = model estimates), DeFi risk, token supply/unlocks, venue quality. Recommends venues/counterparties; **approval authority sits with independent risk**, per research. |
| `quant-research` | Quantitative Research | Signal research, factor models, backtesting with out-of-sample discipline; model development is first line — validation is elsewhere (SR 11-7 separation). Backtests carry mandatory caveats (`BacktestSummarySchema`). |
| `market-intelligence` | Market Intelligence (Technical & Market Structure) | Shared capability, **not** a standalone TA desk (per research): trend/momentum/positioning/liquidity context consumed by all desks and PM. |
| `news-events` | News & Event Analysis | Central monitoring utility + triage: materiality assessment, source credibility, event routing to PM/risk/compliance. Distinct department to exercise realistic cross-department routing. |

### Front office — portfolio

| id | Department | Mandate (summary) |
|---|---|---|
| `portfolio-management` | Portfolio Management (pod/strategy) | Position sizing, portfolio construction, rebalancing, drawdown management within mandate and limits. Consumes research notes + risk views; produces trade intents with rationale references. |
| `capital-allocation` | Capital Allocation (CIO office) | Split from pod-level PM per research: cross-pod capital allocation, aggregate portfolio construction, strategy-level risk budgeting. |

### Second line — independent

| id | Department | Mandate (summary) |
|---|---|---|
| `independent-risk` | Independent Risk Management | Limit framework, exposures, VaR/stress/scenario/liquidity/concentration/counterparty risk, escalation with veto rights; venue/counterparty approval. CRO-style independence (AIFMD Art. 15 analog); risk views recorded separately, never merged into PM views. |
| `model-validation` | Model Validation & Governance | Distinct unit organizationally separate from model developers: firmwide model inventory, tiering by materiality, independent validation, periodic review, change control (SR 11-7 adapted). Covers pricing, risk, signal, and surveillance models. |
| `compliance` | Compliance, Controls & Auditability | Regulatory obligations, restricted lists, MNPI/alt-data diligence, record retention, marketing rules — **including Market Surveillance as a named team inside compliance** (per research: MAR Art. 16 / SEC 204A anchor surveillance in compliance at buy-side scale, not a separate department). |

### First line — operations & reporting

| id | Department | Mandate (summary) |
|---|---|---|
| `operations` | Trade Operations | Settlement/reconciliation lifecycle, trade breaks, position integrity (T+0/T+1 clock). Kept separate from fund accounting per research (different clocks and counterparties). |
| `treasury` | Treasury Analytics | Cash, collateral, margin, financing, counterparty exposure management — first-order survival discipline in multi-strategy contexts. |
| `performance-reporting` | Performance & Reporting | Performance measurement, attribution, investor/IC reporting production — deliberately outside the IC construct (research: reporting production must be independent of the decision forum). |

### Platform

| id | Department | Mandate (summary) |
|---|---|---|
| `data-platform` | Data Engineering & Research Platform | Two sub-functions per research: (a) Data Sourcing & Vendor Management (provider due diligence, licensing/entitlements, the provider registry), (b) Platform Engineering & Data Quality (adapters, point-in-time correctness, reproducibility, quality monitoring). Owns `docs/research/providers/*` and `src/registry/providers.json`. |

## Governance forums (workflows + artifacts, not departments)

Research strongly recommended modeling these as chartered forums with
artifacts and decision records, not staffed departments:

- **Investment Committee** — `IcMemoSchema` artifacts: sponsor thesis,
  independent risk view, compliance view, decision, conditions, recorded
  dissents, review date. Formality is configurable (thin CIO-led approval
  for liquid strategies vs full memo-and-vote).
- **Risk Committee** — periodic limit/breach review; breach artifacts from
  `LimitBreachSchema` with status workflow (open → acknowledged →
  remediated / accepted_with_signoff).
- **Valuation Committee** — noted for completeness; NAV production is out of
  scope (no fund administrator in the harness).

## Explicitly out of scope (with justification)

- **Trading/Execution desk** — the platform produces trade intents up to
  `approved`; no order routing or execution exists in the harness.
- **Fund Accounting / NAV** — requires an administrator relationship; the
  platform models NAV *oversight* interfaces only.
- **Legal, Internal Audit, Investor Relations** — third-line/external
  functions; artifacts reference them where handoffs would occur.

## Handoffs

Every material handoff is a validated `Handoff` artifact (see
`src/schemas/reports.ts` and `pi validate handoff`): originating and
receiving department, timestamp, data sources, analytical methods, findings
with evidence types, confidence, assumptions, limitations, unresolved
questions, recommended next action, and verbatim dissents. Canonical flows:

- research desk → `portfolio-management`: trade thesis (entry/exit/risk)
- `quant-research` → `model-validation`: model submission for validation
- `portfolio-management` → `independent-risk`: trade intent for risk review
- `independent-risk` → `portfolio-management`: risk view / objection (kept
  distinguishable; disagreement is preserved, never averaged)
- `news-events` → any desk / `independent-risk` / `compliance`: event triage
- `crypto-onchain` → `independent-risk`: venue/counterparty recommendation
- desks → IC forum: memo; IC → `portfolio-management`: decision + conditions
- `data-platform` → all: provider/data-quality advisories
- `compliance` → all: restricted-list / surveillance escalations

## Disagreement preservation

Risk objections, compliance concerns, and analyst dissents are first-class
records (`DissentSchema`) that travel with memos and handoffs. A decision
may proceed over an objection, but the objection remains verbatim in the
artifact and in reporting.
