# The Trading Organization

This document is the operating charter for the harness's company-style, multi-agent trading
organization. It defines the departments, agent roles, skill assignments, artifact state machine,
handoff contracts, escalation paths, and approval boundaries that let the harness discover
opportunities, validate data, research strategies, execute trades, manage risk, monitor the
portfolio, and maintain its own software — autonomously, within the guardrails of `AGENTS.md`.

It composes with, and never overrides, the existing operating constitution:

- `AGENTS.md` remains the top-level law (tradability guardrail, cross-asset routing, skill
  routing map, execution invariants). Every org skill is registered in the AGENTS.md skill
  routing map (a CI-enforced requirement — see "Repo integration" below).
- The trading spine (`strategize` → `thesis` → `trade-execution` → `position-management`) remains
  the decision-and-action path. The organization wraps it in explicit department ownership and
  artifact contracts; it does not replace it.
- The `.agents/desk-*.md` debate desk (bull/bear/judge/risk and the research desks) is the
  organization's **Decision Review Board**, invoked by Strategy Research through the `thesis`
  skill.

Role definitions live in `.agents/<dept>-<role>.md` (same frontmatter contract as the desk
files). Department skills live in `skills/<slug>/SKILL.md` (same CI contract as every other
skill, plus the org body template in "The skill file contract" below). Runtime state lives in
`.tribes/org/` (local only, never committed — like `.tribes/thesis/` and `.tribes/journal/`).
The shared protocol — envelopes, state machine, journals, recovery — is specified once in the
`org-protocol` skill and referenced everywhere else.

## Design principles

1. **One owner per capability.** Every skill has exactly one owning department; every artifact
   state has exactly one role allowed to produce it. Engineering is the custodian of
   `org-protocol` (the spec itself); every department uses it.
2. **Facts ≠ signals ≠ recommendations ≠ actions.** Artifacts are typed and promoted only through
   validation contracts. Entries always traverse the full chain; the only shortcut is the
   protective-exit exception defined in the state machine, and it is reduce-only by construction.
3. **Structured results, always.** Every skill returns a structured result with sources,
   timestamps, and freshness. Silent failure is forbidden; failure states are explicit.
4. **Idempotency at the money boundary = client order ids + an intent journal + proof before
   retry.** Orders carry a client order id (cloid) derived from the instruction id and are
   journaled before submission. A timed-out or ambiguous submission puts the order in `unknown`
   state, and resubmission is forbidden until `order-status` and `list-fills` prove the first
   attempt did not execute. TWAP and on-chain swaps, which cannot carry a cloid, are idempotent
   through the journal alone: exactly one broadcast, venue/tx ids captured immediately,
   reconciliation before any retry.
5. **Decision, execution, and engineering are separated.** Strategy Research decides what is
   worth trading, Portfolio Management decides what fits the book, the Execution Desk is the
   only department that runs order-mutating commands, and Engineering has no trading authority.
6. **The human boundary is inherited, not invented.** No order without explicit user
   confirmation or standing authorization with every thesis gate passed; fund movements always
   confirmed by the human; venue-resident protective exits are mandatory on every org entry.

## Org chart

```text
Human (the user)
└── Head of Desk — the top-level harness agent (Pi), sole human interface
    ├── Market Intelligence          .agents/intel-lead.md
    │   ├── Discovery                .agents/intel-discovery.md
    │   ├── News & Sentiment         .agents/intel-news.md
    │   ├── On-chain Intelligence    .agents/intel-onchain.md
    │   └── Data Validation          .agents/intel-validation.md
    ├── Strategy Research            .agents/research-lead.md
    │   ├── Strategy Generator       .agents/research-generator.md
    │   ├── Backtesting              .agents/research-backtester.md
    │   ├── Strategy Evaluator       .agents/research-evaluator.md
    │   ├── Strategy Promoter        .agents/research-promoter.md
    │   └── Decision Review Board    .agents/desk-*.md (existing debate desk)
    ├── Portfolio Management         .agents/pm-lead.md
    │   ├── Position Monitor         .agents/pm-position-monitor.md
    │   ├── Exposure & Risk Monitor  .agents/pm-exposure.md
    │   └── Trigger Manager          .agents/pm-triggers.md
    ├── Execution Desk               .agents/exec-lead.md
    │   ├── Trade Validator          .agents/exec-validator.md
    │   ├── Risk Assessor            .agents/exec-risk.md
    │   ├── Execution Runner         .agents/exec-runner.md
    │   └── Order Monitor            .agents/exec-monitor.md
    ├── Engineering                  .agents/eng-lead.md
    │   ├── Reliability & Diagnostics .agents/eng-reliability.md
    │   ├── Software Engineer        .agents/eng-software.md
    │   └── Integration Engineer     .agents/eng-integration.md
    └── Compliance Officer           .agents/compliance-officer.md   (second line)
```

The Head of Desk is not a new agent file: it is the top-level harness agent that talks to the
human, routes work to departments (spawning them as subagents where supported, or running their
role definitions sequentially as the `thesis` skill already does), and owns the final word with
the user. Department leads own cross-department handoffs; specialists own skills. An explicit
user order does not bypass the machine: the Head of Desk hands the confirmed side/size/asset to
Portfolio Management, which mints a normal trade-instruction flagged `user-directed` (portfolio
fit runs advisory — the user's explicit confirmation overrides it, the envelope does not).

## The artifact state machine

All decision flow is expressed as typed artifacts moving through eight happy-path states. An
artifact may only be promoted by the owner of the target state, and only when the promotion
contract is satisfied. Anything that fails a contract is stamped with a terminal state — never
silently dropped, never silently promoted.

```text
observation → validated-signal → strategy-proposal → approved-strategy
    → trade-instruction → submitted-order → confirmed-fill → portfolio-position
```

| #   | State                | Producer (role)                   | Promotion contract (summary)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `observation`        | Discovery / News / On-chain roles | Every fact carries provider, command, source timestamp, retrieval timestamp, and freshness class. Interpretation is labeled as hypothesis, never as fact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2   | `validated-signal`   | Data Validation                   | Cross-checked per `validate-cross-check` (single-live-source assets degrade to internal-coherence checks and carry a mandatory single-source flag that caps confidence); freshness within class window; contradiction scan clean or noted; confidence assigned; minimum-evidence rule met, else **rejected**. Carries `expires_at`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3   | `strategy-proposal`  | Strategy Generator                | Cites validated signal ids only; precise entry, exit, sizing, risk, and invalidation rules; falsifiable; a backtest spec can be written for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 4   | `approved-strategy`  | Strategy Promoter                 | Evidence path recorded: backtest run + metrics (`research-metrics`) where the engine can represent the strategy, else the alternative-evidence clause (below); robustness pass; overfitting checklist; Review Board debate with judge `RECOMMEND TRADE: yes` — a `conditional` verdict promotes as `executable: false` until its checkable trigger is verified (thesis's own conditional-with-checkable-trigger clause: the timestamped trigger-fired event completes the judge's condition — a vague condition never promotes); evidence gate (≥2 independent signals); an `org-compliance` view is required when decisive evidence is single-source social or internal-only provider data, and a blocked compliance verdict blocks promotion. Carries `expires_at` = min(upstream signal expiries, strategy horizon) and the judge's kill switch. |
| 5   | `trade-instruction`  | Portfolio Manager                 | Strategy unexpired and kill switch untripped (else stamp `expired`/`rejected` and bounce to Research); conditional strategies require a timestamped trigger-fired check; portfolio fit (exposure, concentration, correlation, margin headroom, trigger conflicts); sized against live balances; carries instruction UUID, TTL, venue, dex, coin, side, size, order type, and mandatory protective exits.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 6   | `submitted-order`    | Execution Runner                  | Validation + preflights passed; TTL unexpired at validation AND submission time; intent journal written **before** submission; cloid derived from the instruction UUID (TWAP/swap: journal-only idempotency, venue/tx id captured immediately); one atomic order command. Timeout/ambiguity → state `unknown`, no resubmission without proof.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | `confirmed-fill`     | Order Monitor                     | Fill confirmed from venue data (`order-status`, `list-fills`; swaps: tx receipt success + balance delta) — a submitted order is NEVER treated as filled without confirmation. Partial fills produce a fill artifact for the filled size plus a partial marker on the order artifact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8   | `portfolio-position` | Portfolio Manager                 | Fill reconciled into expected state; position registered under `positions/`, thesis record linked, venue-resident bracket exits verified armed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Terminal states.** Any artifact can end in exactly one of: `rejected` (stamped by the
gatekeeper that refused it), `expired` (stamped by its producer's lead, or by the Order Monitor
for venue-resting orders past their instruction TTL), `cancelled` (Order Monitor),
`failed` (Execution Runner, with the venue error), `unknown` (Execution Runner on
timeout/ambiguity; only the Order Monitor may resolve it, with venue evidence — except
on-chain swap unknowns, which the Execution Runner resolves with transaction-status and
balance-delta evidence per `exec-onchain-swap`), and
`superseded` (Execution Lead, when a protective instruction outranks a pending one). Terminal
artifacts stay in place with the state recorded in-file.

**Protective-exit exception.** A reduce-only instruction may originate directly at state 5,
citing a portfolio-position id plus the trigger event or thesis re-evaluation record as
`upstream`. It MUST be reduce-only, and it still passes Execution validation and preflights.
Entries always require the full chain.

**Per-asset serialization.** The Execution Desk holds at most one in-flight instruction per
(dex, coin). A trigger event first supersedes any pending non-protective instruction on that
asset, then its reduce-only exit runs. Protective instructions always outrank entries.

**Partial fills.** At instruction TTL expiry the Order Monitor cancels the remainder
(`cancel-order --cloid` / `cancel-order-spot --cloid`) and stamps the order artifact. Re-entry
for the unfilled size is a NEW trade-instruction from Portfolio Management — the runner never
chases automatically.

**Envelope.** Every artifact is a JSON file under `.tribes/org/<state-dir>/` with `id`, `state`,
`created_at` (UTC), `expires_at` (nullable), `producer`, `sources[]` (provider, command,
`source_ts`, `retrieved_at`, freshness class), `upstream[]` (ids it was promoted from),
`checks[]` (contract items passed), an optional `dissents[]` (verbatim, attributed
disagreements that are never deleted or softened — deciding over a dissent is legitimate,
erasing it is not), and a state-specific `payload`. One writer per file;
receivers acknowledge or reject via a sidecar `<id>.ack.json`; all writes are
temp-file-then-rename atomic. A handoff without an ack sidecar is not delivered. Backtest and
evaluation results are embedded in the proposal artifact's `payload` before promotion, so the
state-4 audit trail is self-contained.

## Departments

Each table separates skills the role **owns** (single owner per skill) from catalog skills it
**uses**.

### 1. Market Intelligence

Discovers and validates market information across crypto, securities, and commodities (the
cross-asset guardrail applies to every unscoped sweep). Produces `observation` and
`validated-signal` artifacts. Never proposes trades; never executes.

| Role                  | Agent file                    | Owns                                                                                                | Consumes                     | Produces                                  |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------- |
| Intelligence Lead     | `.agents/intel-lead.md`       | `intel-opportunity-rank`                                                                            | Dept outputs, HQ requests    | Ranked opportunity sets, briefing input   |
| Discovery Agent       | `.agents/intel-discovery.md`  | `intel-trending-scan`, `intel-liquidity-anomalies`, `intel-funding-oi`, `intel-derivatives-posture` | Market/venue data            | `observation` artifacts                   |
| News & Sentiment      | `.agents/intel-news.md`       | `intel-news-collect`, `intel-news-triage`, `intel-social-sentiment`, `intel-event-catalysts`        | News, X, prediction markets  | `observation` artifacts                   |
| On-chain Intelligence | `.agents/intel-onchain.md`    | `intel-smart-money`                                                                                 | Nansen/Birdeye on-chain data | `observation` artifacts                   |
| Data Validation       | `.agents/intel-validation.md` | `validate-cross-check`, `validate-freshness`, `validate-contradictions`, `validate-signal-score`    | `observation` artifacts      | `validated-signal` artifacts / rejections |

Uses (existing catalog): `alpha-scout`, `market-strategist`, `asset-data`, `defi-analyst`,
`exchange-analyst`, `token-analyst`, `fundamentals-analyst`, `stock-analyst`,
`commodity-analyst`, `macros`, `news`, `prediction`, `wallet-analyst`, `zipbox-x`, `web-search`,
`research-analyst`, and the `strategize` briefing cycle (the department's flagship composed
product). `intel-news-triage` owns both dedup (keccak item ids against the
`.tribes/org/news-seen.json` ledger, plus headline/url similarity for cross-asset duplicates)
and source credibility/relevance scoring (maintained source-weight table in
`.tribes/org/config/source-weights.json`; independent-source counting feeds
`validate-signal-score`'s evidence count).

Data Validation sits inside Market Intelligence but owns the only path from `observation` to
`validated-signal` — including for observations produced by its own department. It rejects or
downgrades stale, unsupported, and contradictory data, and its rejections are recorded, not
discarded.

### 2. Strategy Research

Converts validated signals into testable strategies, tests them honestly, and promotes only what
survives. Produces `strategy-proposal` and `approved-strategy` artifacts. Never touches live
orders.

| Role               | Agent file                       | Owns                                                                  | Consumes                             | Produces                                   |
| ------------------ | -------------------------------- | --------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------ |
| Research Lead      | `.agents/research-lead.md`       | (coordination; sign-off on evaluation verdicts)                       | `validated-signal` sets, PM feedback | Research agenda, sign-offs                 |
| Strategy Generator | `.agents/research-generator.md`  | `research-hypothesis`                                                 | `validated-signal` artifacts         | `strategy-proposal` artifacts              |
| Backtesting Agent  | `.agents/research-backtester.md` | `research-backtest-spec`, `research-backtest-run`, `research-metrics` | `strategy-proposal` artifacts        | Backtest results + metrics (embedded)      |
| Strategy Evaluator | `.agents/research-evaluator.md`  | `research-robustness`, `research-evaluate`                            | Backtest results                     | Evaluation verdicts                        |
| Strategy Promoter  | `.agents/research-promoter.md`   | (promotion decision per `research-evaluate`'s promotion gate)         | Evaluation + Review Board verdicts   | `approved-strategy` artifacts / rejections |

The Decision Review Board (the existing `.agents/desk-*.md` debate desk, run through the
`thesis` skill) is Strategy Research's adversarial gate: no strategy is promoted without a
bull-vs-bear debate and a judge verdict, exactly as `thesis` defines it. `desk-risk` remains the
Board's live-safety check for a specific entry; the Execution Desk's Risk Assessor re-checks at
execution time.

**Alternative-evidence clause.** The local backtest engine (`ta backtest`) covers two long-only
strategies without costs, and `research-metrics` names exactly which metrics its aggregate
output supports. For strategies the engine cannot represent (shorts, funding carry,
event-driven), the state-4 evidence path is: analytic scenario analysis over venue-native
candles, an inverted-signal proxy backtest where meaningful, and a mandatory Review Board
debate — with the evidence path named in the artifact. A richer engine is an Engineering
backlog item, not an excuse to skip evidence.

### 3. Portfolio Management

Owns the book: positions, balances, exposure, performance, triggers, and portfolio decisions.
The only producer of `trade-instruction` artifacts and of `portfolio-position` state. It
requests all order mutations — including protective stops and closes — from the Execution Desk;
it never runs an order-mutating command itself.

| Role              | Agent file                       | Owns                  | Consumes                                                   | Produces                                   |
| ----------------- | -------------------------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Portfolio Manager | `.agents/pm-lead.md`             | `portfolio-rebalance` | `approved-strategy`, monitor/trigger reports               | `trade-instruction` artifacts, escalations |
| Position Monitor  | `.agents/pm-position-monitor.md` | `portfolio-reconcile` | Venue state, `confirmed-fill` artifacts                    | Reconciled state, discrepancy escalations  |
| Exposure & Risk   | `.agents/pm-exposure.md`         | `portfolio-exposure`  | Reconciled state, account history                          | Exposure/P&L reports                       |
| Trigger Manager   | `.agents/pm-triggers.md`         | `portfolio-triggers`  | Positions, thresholds, conditional-strategy entry triggers | Trigger events → instruction requests      |

Uses: `hyperliquid` (read commands), `position-management` (its REVIEW procedures — the
mutating steps are executed by the Execution Desk on PM's instruction), `wallet-analyst`,
`zipbox-wallet` (addresses/balances). The Trigger Manager watches both book triggers
(stop/take/drawdown/liquidation-distance/allocation) and the entry triggers of conditional
approved strategies.

### 4. Execution Desk

Safely executes trade instructions. Produces `submitted-order` and `confirmed-fill` artifacts.
Accepts instructions only from Portfolio Management (including `user-directed` ones minted for
explicit user orders). Never originates trade ideas. The desk is the ONLY department that runs
order-mutating commands — entries, exits, stops, cancels — and every mutation goes through the
intent journal.

| Role             | Agent file                  | Owns                                           | Consumes                      | Produces                                  |
| ---------------- | --------------------------- | ---------------------------------------------- | ----------------------------- | ----------------------------------------- |
| Execution Lead   | `.agents/exec-lead.md`      | (accept/reject, serialization, supersede)      | `trade-instruction` artifacts | Accept/reject, execution reports          |
| Trade Validator  | `.agents/exec-validator.md` | `exec-validate-instruction`                    | Instruction + live venue meta | Validation verdicts                       |
| Risk Assessor    | `.agents/exec-risk.md`      | `exec-cost-preflight`, `exec-margin-preflight` | Validated instructions        | Cost/margin preflight reports             |
| Execution Runner | `.agents/exec-runner.md`    | `exec-place-order`, `exec-onchain-swap`        | Preflighted instructions      | `submitted-order` artifacts               |
| Order Monitor    | `.agents/exec-monitor.md`   | `exec-order-lifecycle`                         | `submitted-order` artifacts   | `confirmed-fill` artifacts, cancellations |

Uses: `trade-execution` (the placement playbook — `exec-place-order` wraps it with the org
envelope and idempotency rules; it is the same single order path, not a second one),
`hyperliquid`, `spot-trading`, `zipbox-wallet`, `position-management` (the desk runs its
mutating procedures when PM instructs).

A margin shortfall — preflight failure or venue rejection — always freezes the instruction and
returns it to PM with reason `insufficient-margin`. The runner NEVER enters a funding flow:
deposits are non-idempotent and human-gated. Funding happens only as a separate Head-of-Desk ↔
user flow, verified afterward via the venue ledger before PM re-issues the instruction.

### 5. Engineering

Does technical work for any department: bug investigation, integration repair, tests,
diagnostics. Custodian of `org-protocol` (the spec document; changes are approved by the Head of
Desk). Has **no trading authority** — it may never produce, promote, or execute a trading
artifact. Work arrives and leaves as work orders under `.tribes/org/workorders/`.

| Role                      | Agent file                   | Owns                                       | Consumes                     | Produces                            |
| ------------------------- | ---------------------------- | ------------------------------------------ | ---------------------------- | ----------------------------------- |
| Engineering Lead          | `.agents/eng-lead.md`        | `org-protocol` (custodian), triage routing | Work orders from any dept    | Assignments, completed-work returns |
| Reliability & Diagnostics | `.agents/eng-reliability.md` | `eng-triage`, `eng-diagnose`               | Failures, logs, artifacts    | Diagnoses, reproduction notes       |
| Software Engineer         | `.agents/eng-software.md`    | `eng-verify-change`                        | Diagnoses, feature requests  | Code changes + verification reports |
| Integration Engineer      | `.agents/eng-integration.md` | `eng-repair-integration`                   | Provider failures, gap specs | New/repaired adapters + tests       |

The Integration Engineer additionally owns `eng-provider-dd` — documentation-first provider
due diligence with a docs-reviewed → live-tested status ladder — run before any adapter is
built and re-run on unexplained integration failures.

Engineering follows the repo's own conventions (AGENTS.md Architecture + Conventions sections):
service slice + zod types + CLI builder + vitest tests, `bun run lint` / `typecheck` /
`bunx vitest run` before returning work. A gap it cannot close repo-side (a new provider needing
a control-plane billing entry) is escalated to the human via the Head of Desk with the `notify`
skill.

## The skill file contract

Every org skill file must satisfy the repo-wide CI contract (frontmatter restricted to
name/description/allowed-tools, name = directory slug, an H1, ≤300 lines, related-skills
references must exist) **and** carry these body sections, in order, under the H1:

1. **Identity** — stable id (the slug), owning department, and the roles that invoke it.
2. **Purpose** — one paragraph; what the skill decides or produces, and what it never does.
3. **Inputs** — required and optional fields, with types and where they come from.
4. **Outputs** — the structured result schema (fields, artifact state produced if any).
5. **Integration** — the exact commands, providers, and code paths used.
6. **Preconditions** — auth, artifacts, freshness, and state that must hold before running.
7. **Procedure** — numbered operating steps.
8. **Validation** — checks that must pass before the result counts.
9. **Risk & safety** — constraints, forbidden actions, approval requirements.
10. **Failure & retry** — explicit failure states and the retry/no-retry rules.
11. **Timeouts & rate limits** — bash timeouts, provider budget notes.
12. **Observability** — what is journaled where, with which ids.
13. **Escalation** — where results/failures go next (role, artifact, or human).
14. **Example** — one invocation and one successful structured result.
15. **Acceptance** — the checklist that makes a run correct.

Shared schema fragments (the envelope, freshness classes, id derivations) live in
`org-protocol` and are referenced, not restated, so files stay under the 300-line cap.

## Repo integration

- Every org skill lands with one entry in the AGENTS.md `## Skill routing map` section (outside
  the synced zipbox block, grouped under an "Org skills" note) — `tests/skills/SkillsContract.test.ts`
  fails CI for any skill missing there, and for any backticked kebab-case token in that section
  that is not a real slug (so artifact-state words are written unbackticked there).
- The six files pinned by `tests/skills/MultiAssetPolicy.test.ts` and the two pinned desk files
  are not modified by the org rollout.
- `zipbox-*` skills are machine-synced and never hand-edited.
- All new markdown passes `bun run format`; agent files follow the observed pi-subagents
  frontmatter contract (name, description, optional tools, inheritProjectContext,
  inheritSkills, systemPromptMode).

## Handoff contracts

Every cross-department handoff is an artifact plus a required acknowledgment (sidecar
`<id>.ack.json`, written by the receiver — never an edit to the sender's file).

| Handoff                         | Artifact                           | Required content (beyond envelope)                                                                      | Failure path                                  |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Intelligence → Data Validation  | `observation`                      | Sources with timestamps + freshness; hypothesis labeled                                                 | Rejection recorded with reason                |
| Data Validation → Strategy Res. | `validated-signal`                 | Confidence, evidence list, contradiction notes, `expires_at`                                            | Signal expires; regenerate from fresh data    |
| Strategy Res. → Portfolio Mgmt  | `approved-strategy`                | Entry/exit/sizing/invalidation rules, evidence path + metrics, judge verdict, kill switch, `expires_at` | PM rejects with portfolio-fit reason          |
| Portfolio Mgmt → Execution Desk | `trade-instruction`                | Venue, dex, coin, side, size, order type, limit/trigger prices, protective exits, instruction UUID, TTL | Desk rejects (validation/preflight) with data |
| Execution Desk → Portfolio Mgmt | `submitted-order`/`confirmed-fill` | Venue ids (oid, cloid, twapId, tx hash), fill price/size/fees, or explicit terminal state               | PM reconciles; discrepancy escalates          |
| Any dept → Engineering          | work order                         | Symptom, command + exact error, artifact refs, urgency                                                  | Eng returns diagnosis or fix + verification   |
| Engineering → requesting dept   | work-order result                  | What changed, how verified (lint/typecheck/tests), residual risk                                        | Requester re-opens with new evidence          |

The request–response loop is always completed: no ack sidecar means not delivered, and the
sender follows up or escalates.

## Escalation paths

1. **Data problems** (provider errors, stale feeds, contradictions that block validation):
   role → department lead → Engineering work order (`eng-triage`). Trading on the affected data
   pauses until Validation clears it.
2. **Execution problems** (rejected orders, unknown order state, venue errors): Order Monitor →
   Execution Lead → freeze the instruction (never blind-retry) → Engineering work order if
   technical, Portfolio Management if intent must change. Unknown order state is resolved ONLY
   by order-status/list-fills evidence (swaps: tx status polls), never by resubmission.
3. **Portfolio discrepancies** (venue state ≠ expected state): Position Monitor → Portfolio
   Manager → halt new instructions for the affected asset → notify the human (`notify` skill)
   if money is unaccounted for. Positions opened outside the org (manual user trades) are
   adopted at the next reconcile as `user-directed` positions, not treated as discrepancies.
4. **Risk-limit breaches** (drawdown, liquidation distance, concentration): Trigger Manager →
   Portfolio Manager → protective instruction to the Execution Desk (reduce-only) → human
   notification when a hard limit was crossed.
5. **Capability gaps** (no provider for a required datum, engine limitation): any role →
   Engineering backlog (`.tribes/org/workorders/backlog.md`) → human decision when the fix needs
   spend or a control-plane change (new provider key, billing entry).
6. **Anything requiring human money judgment** → Head of Desk → the user, in plain language.

## Approval boundaries

Inherited from the harness and made explicit per department:

- **Trades:** no order without (a) the user's explicit confirmation of side + size + asset, or
  (b) standing authorization plus a judge-approved thesis with every safety gate passed —
  exactly the `thesis` / `trade-execution` rule. The org adds: the instruction must also have
  passed Portfolio fit and Execution preflights, and carry venue-resident protective exits.
- **Fund movements** (deposit, withdraw, transfer, bridge, swap-for-funding): always explicit
  human confirmation, per `hyperliquid` / `spot-trading` / `zipbox-wallet` skill rules. The org
  never automates these; execution freezes on `insufficient-margin` instead.
- **Strategy promotion** (state 4): autonomous, but recorded with full evidence; the human can
  audit `.tribes/org/strategies/` at any time.
- **Protective exits** (stop-loss/take-profit, reduce-only closes on triggered thresholds):
  allowed under standing authorization; always reduce-only; always reported after the fact.
- **Risk thresholds:** changes to `.tribes/org/config/thresholds.json` are recorded with
  before/after values; any LOOSENING of a hard limit requires human confirmation first.
- **Engineering merges:** a work order touching money paths (`src/services/HyperliquidService.ts`,
  `TransactionService.ts`, `WalletService.ts`, `SwapBridgeService.ts`) pauses in
  needs-human-approval BEFORE the change is adopted (notify + explicit user approval); until
  then the desk keeps running the prior binary. Other changes are verified (lint, typecheck,
  tests) and reported.
- **Never:** Engineering trading, Execution originating ideas, Intelligence executing,
  credentials/keys in any artifact or report (`.tribes/privy-wallets.json` is NEVER read).

## The primary workflow

The full loop, with the state each step produces:

1. **Market Intelligence discovers** a candidate: discovery scans, news triage, on-chain flows
   (`intel-*` skills) → `observation`.
2. **Data Validation verifies and scores** it (`validate-*` skills) → `validated-signal` or a
   recorded rejection.
3. **Strategy Research converts** it into a testable strategy (`research-hypothesis`) →
   `strategy-proposal`.
4. **Backtesting and evaluation** (`research-backtest-spec`, `research-backtest-run`,
   `research-metrics`, `research-robustness`, `research-evaluate` + Decision Review Board
   debate) qualify it → `approved-strategy` or rejection with reasons.
5. **Portfolio Management checks fit** — exposure, concentration, margin headroom, conflicts
   (`portfolio-exposure`, `portfolio-reconcile`) — sizes it, and issues → `trade-instruction`.
6. **The Execution Desk validates and executes**: `exec-validate-instruction` →
   `exec-cost-preflight` + `exec-margin-preflight` → `exec-place-order` (intent journal, cloid,
   one atomic command with bracket exits) → `submitted-order`; the Order Monitor confirms →
   `confirmed-fill`.
7. **Portfolio Management monitors** the resulting `portfolio-position`: reconciliation,
   exposure, triggers; protective or exit instructions loop back through steps 5–6 under the
   protective-exit exception.
8. **Engineering handles technical failures** at any step through work orders — without ever
   assuming trading authority.

### Cadence and the poll-only reality

The harness is an interactive, poll-only agent: nothing runs between sessions, there is no
scheduler and no venue dead-man switch. The org therefore operates on these explicit
assumptions:

- **Venue-resident bracket exits are the primary protection** on every org entry (tp/sl legs on
  the entry order per `trade-execution`); org-side triggers are secondary, best-effort.
- **A submitted order must resolve within the session that created it** — the Order Monitor
  polls order-status/list-fills (bounded) until `confirmed-fill` or a terminal state; a session
  must not end with an artifact stuck in `submitted`/`unknown` without notifying the human.
- **Session-start recovery pass** (mandatory, defined in `org-protocol`): resolve any intent
  journal without a confirmed outcome via order-status --cloid + list-fills; diff venue
  open orders against live instructions — cancel orphans with terminal/expired parents, adopt
  orders belonging to live artifacts, and leave orders with no org parentage untouched as
  user-directed context; verify every position's
  protective exits are armed (re-arm via a PM instruction if not); sweep expired artifacts;
  adopt externally opened positions.
- **Session-end monitoring pass**: reconcile, evaluate triggers, and notify the human if any
  trigger is armed, any artifact is non-terminal past its TTL, or monitoring will be blind
  until the next session.
- **Rate budget**: one all-dex sweep per pass, written to `snapshots/` and REUSED by every role
  within its freshness window; validation runs on a per-cycle provider-call budget; the Order
  Monitor checks its venue API budget with the rate-limit command before poll loops.
- **Continuous unattended monitoring is an open gap** (scheduler + dead-man switch are backlog
  items) and is never claimed.

## Integration map

Every org skill maps to existing `tribes-cli` surface (details, flags, and procedures live in
each skill file):

| Skill                       | Primary commands (group)                                                                                                        | Providers behind them                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `intel-trending-scan`       | `market movers/global/categories`, `token-data trending`, `asset trending`, `stocks search`                                     | CoinGecko, Birdeye, Marketstack                             |
| `intel-liquidity-anomalies` | `market movers`, `onchain trending-pools/pool-trades`, `hyperliquid order-book`, `token-data trade-data/trade-history`          | CoinGecko, GeckoTerminal, Birdeye, Hyperliquid              |
| `intel-funding-oi`          | `hyperliquid list-assets --all-dexes`, `hyperliquid funding-history`, `hyperliquid predicted-fundings`, `exchanges derivatives` | Hyperliquid, CoinGecko                                      |
| `intel-derivatives-posture` | `hyperliquid list-assets`, `exchanges derivatives`, `smart-money perp-leaderboard`                                              | Hyperliquid, CoinGecko, Nansen                              |
| `intel-smart-money`         | `smart-money netflow/token-list/who-bought-sold/dex-trades`, `wallet-data labels/pnl/related/net-worth`                         | Nansen (Birdeye for Solana net-worth)                       |
| `intel-opportunity-rank`    | (composes department outputs; venue filter via `hyperliquid list-assets --all-dexes`)                                           | —                                                           |
| `intel-news-collect`        | `news fetch --kind token/perp/stock`                                                                                            | Tribes news API                                             |
| `intel-news-triage`         | (dedup ledger + source-weight scoring over collected items)                                                                     | —                                                           |
| `intel-social-sentiment`    | `zipbox-x` reads, `web-search search`                                                                                           | X proxy, Tavily                                             |
| `intel-event-catalysts`     | `news fetch`, `prediction search/list-events/get-event`                                                                         | Tribes news, Polymarket                                     |
| `validate-cross-check`      | `asset price/candles` (capability router), provider-named groups for the second source                                          | BirdEye, CoinGecko, GeckoTerminal, Marketstack, Hyperliquid |
| `validate-freshness`        | (timestamp normalization + freshness windows over any artifact)                                                                 | —                                                           |
| `validate-contradictions`   | (cross-source comparison over artifacts + targeted re-pulls)                                                                    | any read provider                                           |
| `validate-signal-score`     | (scoring + minimum-evidence gate; writes validated signals)                                                                     | —                                                           |
| `research-hypothesis`       | (writes strategy proposals from signals)                                                                                        | —                                                           |
| `research-backtest-spec`    | (spec from proposal; data source selection)                                                                                     | —                                                           |
| `research-backtest-run`     | `ta backtest`, `hyperliquid candles`, `asset candles`                                                                           | Local engine, Hyperliquid, CoinGecko/Birdeye                |
| `research-metrics`          | `ta indicators`, `ta levels` (metrics from backtest output + candle stats; names what is NOT computable)                        | Local engine                                                |
| `research-robustness`       | `ta backtest`, `ta indicators` across windows/assets/timeframes                                                                 | Local engine                                                |
| `research-evaluate`         | (metrics gate + `thesis` desk debate; writes promotion/rejection)                                                               | —                                                           |
| `exec-validate-instruction` | `hyperliquid list-assets --all-dexes/list-exchanges`                                                                            | Hyperliquid                                                 |
| `exec-cost-preflight`       | `hyperliquid order-book`, `list-assets` (impactPxs, funding), `hyperliquid user-fees`                                           | Hyperliquid                                                 |
| `exec-margin-preflight`     | `hyperliquid list-balances/list-positions/list-open-orders`, `wallet list`                                                      | Hyperliquid, Privy/Tribes                                   |
| `exec-place-order`          | `hyperliquid trade-perp/trade-spot --cloid` (via `trade-execution`; TWAP/scale/ladder per rules in the skill)                   | Hyperliquid (Privy signing)                                 |
| `exec-order-lifecycle`      | `hyperliquid order-status/list-open-orders/list-fills/cancel-order/cancel-order-spot/twap-cancel/rate-limit`                    | Hyperliquid                                                 |
| `exec-onchain-swap`         | `spot-trading quote` + `zipbox-wallet` broadcast + tx status polls (per `spot-trading`)                                         | DEX aggregator, Privy                                       |
| `portfolio-reconcile`       | `hyperliquid list-balances/list-positions/list-open-orders/list-fills/ledger`, `wallet assets`                                  | Hyperliquid, Tribes                                         |
| `portfolio-exposure`        | `hyperliquid list-positions/portfolio`, `wallet assets`                                                                         | Hyperliquid, Tribes                                         |
| `portfolio-triggers`        | `hyperliquid list-positions/list-assets` (marks, liq px), thresholds config                                                     | Hyperliquid                                                 |
| `portfolio-rebalance`       | (writes trade instructions; exits under the protective-exit exception)                                                          | —                                                           |
| `eng-triage`                | (classification protocol over errors/artifacts)                                                                                 | —                                                           |
| `eng-diagnose`              | repo commands (`bunx vitest run`, `bun run lint/typecheck`), `--out` artifacts, logs                                            | —                                                           |
| `eng-repair-integration`    | repo slice conventions (service + types + CLI + tests)                                                                          | —                                                           |
| `eng-verify-change`         | `bun run lint/typecheck`, `bunx vitest run`, targeted CLI smoke reads                                                           | —                                                           |
| `org-compliance`            | (restricted-list, licensing, source-audit, bypass audit; sidecar verdicts) `hyperliquid list-fills/list-open-orders`            | Hyperliquid (read-only)                                     |
| `eng-provider-dd`           | (documentation-first provider DD; committed records under docs/org/providers/) `web-search search/extract`                      | Tavily                                                      |
| `org-protocol`              | `org validate` (machine-checks envelopes and acks); (envelope/state-machine/recovery spec; `date -u`, `.tribes/org/` layout)    | —                                                           |

## Requirement coverage

Consolidations are intentional and owned: "monitor positions" = `portfolio-reconcile` +
`portfolio-triggers` (with `position-management` reviews); "escalate discrepancies" =
`portfolio-reconcile`'s escalation section; "estimate fees and slippage" = `exec-cost-preflight`;
"prevent duplicate execution" = `exec-place-order`'s cloid/intent-journal rules +
`exec-order-lifecycle` reconciliation; "deduplicate stories" and "score credibility/freshness/
relevance" = `intel-news-triage`; "regression tests" and "validate changes" =
`eng-verify-change` (with `eng-repair-integration` writing the tests); "calculate performance
and risk metrics" = `research-metrics`.

## Capability gaps

### Closed by this change (adapters over existing providers)

New `tribes-cli hyperliquid` subcommands, all wrapping the already-integrated
`@nktkas/hyperliquid` SDK (no new provider, no new key):

| Command                                             | SDK method                               | Org need                                                                                                                                                             |
| --------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hyperliquid order-status`                          | `InfoClient.orderStatus` (oid or cloid)  | Order lifecycle: the only safe fill/cancel/reject confirmation                                                                                                       |
| `hyperliquid funding-history`                       | `InfoClient.fundingHistory`              | Funding-rate analysis and carry signals                                                                                                                              |
| `hyperliquid predicted-fundings`                    | `InfoClient.predictedFundings`           | Cross-venue funding dislocations                                                                                                                                     |
| `hyperliquid candles`                               | `InfoClient.candleSnapshot`              | Venue-native OHLCV for TA/backtests on any dex, incl. HIP-3 stock/commodity perps (previously only Marketstack/ETF proxies, whose prices can diverge from dex marks) |
| `hyperliquid portfolio`                             | `InfoClient.portfolio`                   | Equity/P&L history, drawdown monitoring                                                                                                                              |
| `hyperliquid ledger`                                | `InfoClient.userNonFundingLedgerUpdates` | Deposit/withdraw/transfer reconciliation                                                                                                                             |
| `hyperliquid user-fees`                             | `InfoClient.userFees`                    | Real fee tier for cost preflights (not hardcoded public rates)                                                                                                       |
| `hyperliquid rate-limit`                            | `InfoClient.userRateLimit`               | API budget visibility for poll loops                                                                                                                                 |
| `trade-perp --cloid`, `trade-spot --cloid`          | `ExchangeClient.order` (`c` field)       | Idempotent submission keyed to the instruction UUID                                                                                                                  |
| `cancel-order --cloid`, `cancel-order-spot --cloid` | `ExchangeClient.cancelByCloid`           | Cancel by client id when the oid is unknown (timed-out submissions)                                                                                                  |

TWAP orders cannot carry a client order id (the venue's twap action has no such field): their
idempotency is journal-only — intent journal before submit, twapId captured from the response,
twap history reconciled before any retry. Scale ladders (`scale-perp`/`scale-spot` accept no
cloid either) are journal-only in the same way: every leg oid is captured from the placement
response and `list-open-orders` into the order artifact immediately, and lifecycle confirms or
cancels ladder legs by oid.

### Open gaps (flagged, not implemented — need a new provider or control-plane change)

| Gap                                                                                                     | Why it stays open                                                                                                                                 | Interim answer                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liquidation feeds / heatmaps                                                                            | No integrated provider offers them (CoinGecko/Nansen/Birdeye don't; Coinglass-class needs a new billed key + control-plane egress entry)          | `intel-derivatives-posture` uses OI deltas, funding extremes, SM perp leaderboard as proxies                                                                  |
| Long/short ratio                                                                                        | Same — no integrated source                                                                                                                       | Same proxies; gap stated on every artifact that would have used it                                                                                            |
| Historical sentiment / odds time series                                                                 | News API is point-in-time; Polymarket CLOB history unwrapped                                                                                      | Departments snapshot per cycle under `.tribes/org/snapshots/` (`--out` where supported; stdout redirect for prediction and web-search, which have no `--out`) |
| Generic backtest engine (shorts, fees, stops)                                                           | `ta backtest` ships two long-only strategies without costs; an engine is a deliberate Engineering project, not an adapter                         | Alternative-evidence clause above; `research-metrics` names what is computable; Engineering backlog item                                                      |
| Websocket push (order updates, fills, bbo)                                                              | SDK supports it; the harness is poll-only by design today                                                                                         | Bounded order-status/list-fills polls within the session; backlog item                                                                                        |
| Scheduler / dead-man switch                                                                             | No between-session runtime; ExchangeClient.scheduleCancel unexposed                                                                               | Venue-resident brackets as primary protection; session-start recovery + session-end pass; backlog item                                                        |
| Sub-account / vault segregation per strategy                                                            | ExchangeClient supports it; product decision needed                                                                                               | One shared account; PM enforces per-strategy exposure caps instead                                                                                            |
| Historical macro / FRED series                                                                          | The macros surface is one fixed latest-value snapshot proxied by the control plane; no series or calendar endpoint is exposed                     | Macro claims are point-in-time only; a fixed-income/credit desk stays out of scope until series data exists                                                   |
| Response caching / provider rate-limit budgeting in the CLI                                             | Every invocation hits providers directly; a code-level cache/budget layer (as prototyped in PR #74's core/) is an invasive cross-service refactor | org-protocol's procedural budgets: shared pass snapshots, per-cycle call budgets, the rate-limit command before poll loops; Engineering backlog item          |
| Additional on-chain/news providers (Alchemy, Helius, Moralis, NewsData — adapters prototyped in PR #74) | New billed providers need control-plane egress billing entries; adapter code alone cannot land them                                               | Current providers cover the routes; candidates go through eng-provider-dd + human billing decision when a concrete gap demands them                           |

## Runtime layout

```text
.tribes/org/
├── observations/    <UTC>-<slug>.json          (Discovery / News / On-chain roles)
├── signals/         <UTC>-<slug>.json          (Data Validation; rejections stay in place, stamped)
├── proposals/       <UTC>-<slug>.json          (Strategy Generator; backtest + evaluation embedded)
├── strategies/      <UTC>-<slug>.json          (Strategy Promoter)
├── instructions/    <uuid>.json                (Portfolio Manager)
├── orders/          <uuid>.json                (Execution Runner intent journal + submissions)
├── fills/           <uuid>.json                (Order Monitor confirmations)
├── positions/       <uuid>.json                (Portfolio Manager; live book registry, trigger arming)
├── triggers/        <UTC>-<slug>.json          (Trigger Manager; trigger events cited as upstream)
├── snapshots/       <UTC>-<source>.json        (shared raw pulls: all-dex sweep, odds, news cycles)
├── news-seen.json                              (News & Sentiment dedup ledger: item ids + cursors)
├── workorders/      <UTC>-<slug>.md, backlog.md (Engineering)
├── config/          thresholds.json, source-weights.json  (PM limits; news source weights)
└── archive/                                    (terminal artifacts swept here by the recovery pass)
```

Acks live beside their artifacts as `<id>.ack.json`. Retention: terminal artifacts are stamped
in-file and swept to `archive/` by the session-start recovery pass after their retention window;
`snapshots/` keeps only the last few per source. `.tribes/` is gitignored; nothing here is ever
committed. The `strategize` journal (`.tribes/journal/YYYY-MM-DD.md`) and thesis record
(`.tribes/thesis/`) remain canonical and are referenced, not duplicated: org artifacts link to
them by path.

## Relationship to the existing spine

- `strategize` is Market Intelligence's composed briefing product; its evidence gate and journal
  are unchanged and org artifacts cite journal entries.
- `thesis` (with `.agents/desk-*.md`) is the Decision Review Board — Strategy Research invokes
  it for every promotion, and its auto-entry gates remain the only path to autonomous entry.
  When thesis runs as the Review Board, it records verdicts only — its step-7 handoff to
  `trade-execution` is suppressed and reserved for the interactive spine path; org execution
  always flows Portfolio Management → Execution Desk.
  Mapping: one thesis record per approved strategy — the first active one is
  `.tribes/thesis/current.md`, additional concurrent ones live in `.tribes/thesis/active/` (as
  the thesis skill already allows), each linked to its strategy artifact by id in both
  directions. Thesis re-evaluation outcomes (HOLD/ADD/EXIT) are delivered to Portfolio
  Management as instruction requests, never run directly; protective trigger exits outrank
  thesis re-evaluation decisions.
- `trade-execution` remains the one placement playbook; `exec-place-order` adds the org envelope
  (instruction → cloid → intent journal → verification) around it, never a second order path.
- `position-management` remains the tool for protective actions; Portfolio Management requests
  them, the Execution Desk runs them.
- The AGENTS.md skill routing map remains the router and gains one entry per org skill; org
  roles are their primary entry point, and org skills route into the existing catalog per rules
  R0–R4.
