---
name: org-protocol
description: >-
  The trading organization's shared protocol: the artifact state machine, envelope schema,
  freshness classes, id and cloid derivation, handoff acks, per-asset serialization, recovery
  passes, and the .tribes/org runtime layout. Handles: how any org role writes, promotes,
  acknowledges, expires, and recovers typed artifacts. Call it before producing or consuming any
  org artifact, and at session start/end for the mandatory recovery and monitoring passes. NOT
  for: the org chart and department responsibilities (read docs/org/ORGANIZATION.md); placing
  trades (use trade-execution); market briefings (use strategize).
allowed-tools: bash read
---

# Org Protocol

## Identity

- Stable id: `org-protocol` — custodian: Engineering (spec changes approved by the Head of Desk).
- Invoked by: every org role, before its first artifact write and during recovery passes.

## Purpose

One canonical definition of how org artifacts are represented, promoted, handed off, and
recovered, so that every department speaks the same protocol and no state promotion happens
without its contract. This skill defines mechanics only; who may do what is chartered in
`docs/org/ORGANIZATION.md`.

## The state machine

Happy path (producer role in parentheses; full promotion contracts in the charter):

```text
observation (Intelligence) → validated-signal (Data Validation) → strategy-proposal (Generator)
  → approved-strategy (Promoter) → trade-instruction (Portfolio Manager)
  → submitted-order (Execution Runner) → confirmed-fill (Order Monitor)
  → portfolio-position (Portfolio Manager)
```

Terminal states, stamped in-file, exactly one per artifact: `rejected`, `expired`, `cancelled`,
`failed`, `unknown`, `superseded`. Only the Order Monitor may resolve `unknown`, and only with
venue evidence — except on-chain swap unknowns, which the Execution Runner resolves inside
`exec-onchain-swap` with transaction-status and balance-delta evidence. The protective-exit exception: a reduce-only trade-instruction may cite a
portfolio-position id plus a trigger event (or thesis re-evaluation record) as `upstream` and
skip states 1–4; entries never skip.

## The envelope

Every artifact is one JSON file:

```json
{
  "id": "<see id rules>",
  "state": "validated-signal",
  "created_at": "2026-01-01T12:00:00Z",
  "expires_at": "2026-01-01T18:00:00Z",
  "producer": "intel-validation",
  "sources": [
    {
      "provider": "hyperliquid",
      "command": "tribes-cli hyperliquid list-assets --all-dexes",
      "source_ts": "2026-01-01T11:59:40Z",
      "retrieved_at": "2026-01-01T12:00:00Z",
      "freshness": "live"
    }
  ],
  "upstream": ["<ids this was promoted from>"],
  "checks": ["cross-check:pass(deviation 0.3%)", "freshness:live", "evidence:2-independent"],
  "payload": {}
}
```

Rules:

- `expires_at` is null only where the charter allows (observations may omit it; signals,
  strategies, and instructions MUST set it — an instruction's `expires_at` is its TTL).
- `sources[]` is mandatory wherever market data was used; stamp `retrieved_at` yourself with
  `date -u +%Y-%m-%dT%H:%M:%SZ` — several provider payloads carry no as-of field.
- `checks[]` records every promotion-contract item actually verified, one entry each.
- Facts, signals, hypotheses, recommendations, and executed actions are labeled as such in
  `payload` — never mix a hypothesis into a fact field.
- NEVER place credentials, private keys, bearer tokens, or wallet ids in any artifact.
  `.tribes/privy-wallets.json` is NEVER read by org roles.

## Ids and derivations

- Observations/signals/proposals/strategies: `<UTC compact>-<slug>` (e.g.
  `20260101T120000Z-btc-funding-dislocation`), filename `<id>.json`.
- Instructions, orders, fills, positions: one UUIDv4 minted with the instruction (`uuidgen`
  lowercased), reused as the filename through states 5–8 so the whole execution chain joins on
  one key.
- cloid derivation: strip the dashes from the instruction UUID → 32 hex chars → prefix `0x`.
  Only `trade-perp`/`trade-spot` accept a cloid. Scale ladders carry none — the venue assigns
  per-leg oids; capture them from the placement response and `list-open-orders` into the order
  artifact immediately. TWAPs carry none either — capture the venue twapId immediately on
  submission. On-chain swaps: capture the tx hash immediately on broadcast. For all three,
  the journal is the only idempotency key.

## Freshness classes

| Class    | Meaning                                 | Default window      |
| -------- | --------------------------------------- | ------------------- |
| `live`   | venue/provider real-time field          | ≤ 5 min old         |
| `recent` | intraday aggregates, news items         | ≤ 24 h old          |
| `daily`  | EOD candles, daily flows                | ≤ 1 trading day old |
| `static` | metadata (decimals, listings, profiles) | re-check weekly     |

A consumer may tighten but never loosen a window. Data older than its window is stale: usable
only with an explicit `stale` mark and never for order sizing or triggers.

## Handoffs and acks

- One writer per artifact file, with exactly two chartered exceptions: the Backtesting Agent
  and Strategy Evaluator write into a proposal's designated `payload` evidence block (atomic
  writes, touching nothing else), and the authorized gatekeeper for a terminal state stamps
  that state in-file. All other receiver writes are sidecar-only: `<id>.ack.json`
  (`{"by", "at", "verdict": "ack" | "reject", "reason"}`), never an edit to the sender's file.
- No ack sidecar = not delivered; the sender follows up or escalates per the charter.
- All writes are atomic: write to `<file>.tmp`, then `mv` over the target.

## Serialization and budgets

- At most ONE in-flight instruction per (dex, coin) at the Execution Desk. Protective
  (reduce-only) instructions outrank entries; the Execution Lead stamps a pending entry
  `superseded` before a protective exit on the same asset runs.
- One all-dex sweep per pass: write `hyperliquid list-assets --all-dexes --out` to
  `.tribes/org/snapshots/<UTC>-all-dexes.json` and REUSE it within its `live` window instead of
  re-sweeping per role.
- Bounded polling only: order confirmation polls check the API budget first
  (`tribes-cli hyperliquid rate-limit --address <addr>`) and back off on low budget.

## Recovery passes

Session-start (mandatory before any new org work):

1. For every `orders/<uuid>.json` not in a terminal or confirmed state: resolve via
   `tribes-cli hyperliquid order-status --address <addr> --cloid <cloid>` and
   `list-fills`; stamp the true outcome. Never resubmit to "fix" an unknown.
2. Diff venue `list-open-orders --all-dexes` against live instructions: cancel orphans whose
   parent artifact is terminal/expired, adopt resting orders that belong to live artifacts,
   and leave venue orders with NO org parentage untouched — report them as user-directed
   context. Cancelling a manual user order is forbidden.
3. Verify every position in `positions/` has venue-resident protective exits armed; if not,
   raise a protective instruction request to the Portfolio Manager.
4. Adopt externally opened positions (venue position with no `positions/` entry) as
   `user-directed` positions.
5. Sweep: stamp expired artifacts, move terminal artifacts past retention (7 days; workorders
   30 days) into `archive/`, keep the last 5 snapshots per source.

Session-end (mandatory when execution or monitoring happened):

1. Reconcile the book (`portfolio-reconcile`), evaluate triggers (`portfolio-triggers`).
2. If any artifact is non-terminal past its TTL, any trigger is armed, or an order is
   unresolved, notify the human (`notify` skill) — monitoring is blind between sessions.

## Runtime layout

```text
.tribes/org/
├── observations/ signals/ proposals/ strategies/   (research chain, <UTC>-<slug>.json)
├── instructions/ orders/ fills/ positions/         (execution chain, <uuid>.json)
├── triggers/     <UTC>-<slug>.json                 (trigger events; cited as upstream)
├── snapshots/    <UTC>-<source>.json               (shared raw pulls)
├── news-seen.json                                  (dedup ledger: item ids + cursors)
├── workorders/   <UTC>-<slug>.md, backlog.md       (Engineering)
├── config/       thresholds.json, source-weights.json
└── archive/                                        (swept terminal artifacts)
```

Create directories on first use (`mkdir -p`). `.tribes/` is gitignored — NEVER commit it.

## Failure & retry

These retry rules apply to READ commands only:

- Auth failure: `tribes-cli login`, retry the original command once, then stop and report.
- Non-auth provider failure: retry once, then record the failure in the artifact/work order and
  continue or escalate per the charter — never silently drop.

Order-mutating and fund-moving commands (trade, scale, twap, transfer, deposit, withdraw,
transaction broadcasts) are NEVER retried on timeout, ambiguity, or post-login uncertainty —
the AGENTS.md retry-once invariant covers reads; a mutating command's unknown outcome is
stamped `unknown` and resolved only with venue evidence (see `exec-place-order`,
`exec-onchain-swap`). A cancel may be re-issued only after order-status shows the order still
resting.

- A recovery step that cannot complete (e.g. order-status unreachable) blocks new instructions
  for that asset and escalates to the Execution Lead.

## Observability

Every artifact write, promotion, terminal stamp, and ack IS the log — no side-channel state.
Cross-links: strategy artifacts reference their thesis record path; fills reference the
strategize journal day file when a briefing led to the trade.

## Example

Promote an observation to a validated signal (Data Validation):

```bash
date -u +%Y-%m-%dT%H:%M:%SZ   # retrieval stamp
mkdir -p .tribes/org/signals
# write signals/20260101T120500Z-btc-funding-dislocation.json per the envelope, then:
mv .tribes/org/signals/20260101T120500Z-btc-funding-dislocation.json.tmp \
   .tribes/org/signals/20260101T120500Z-btc-funding-dislocation.json
```

Result: an envelope with `state: "validated-signal"`, two independent sources, `checks[]`
listing each contract item, and `upstream` citing the observation id.

## Acceptance

- [ ] Every promotion matched its charter contract and recorded `checks[]`.
- [ ] Every artifact has exactly one writer; acks are sidecars; writes were atomic.
- [ ] Ids and cloids follow the derivation rules; execution chain joins on one UUID.
- [ ] Session-start recovery ran before new work; session-end pass ran after execution.
- [ ] Nothing in `.tribes/org/` was committed; no credentials anywhere.

## Related skills

- `trade-execution` — the one order-placement playbook the desk wraps.
- `position-management` — protective actions the desk runs on PM instructions.
- `strategize` — briefing cycle + journal the org cites.
- `thesis` — the Decision Review Board and auto-entry gates.
- `notify` — human alerts from recovery and monitoring passes.
