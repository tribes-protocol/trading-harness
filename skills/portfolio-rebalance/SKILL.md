---
name: portfolio-rebalance
description: >-
  The Portfolio Manager's trade-instruction mint — the ONLY producer of state-5
  trade-instruction artifacts. Handles: promoting approved strategies into sized instructions
  (strategy unexpired, kill switch untripped, conditional trigger-fired proof, portfolio fit,
  sizing against live balances, UUID + TTL + mandatory protective exits), reduce-only
  protective and exit instructions from trigger events and thesis re-evaluations, and
  user-directed orders handed down by the Head of Desk. Call it whenever an approved strategy,
  trigger event, thesis outcome, or confirmed user order must become an instruction. NOT for:
  executing or placing anything (use exec-place-order); evaluating thresholds (use
  portfolio-triggers); computing fit inputs (use portfolio-exposure); venue reconciliation
  (use portfolio-reconcile).
allowed-tools: bash read
---

# Portfolio: Rebalance

## Identity

- Stable id: `portfolio-rebalance` — owner: Portfolio Management. Invoked by: Portfolio
  Manager (pm-lead), the only role allowed to produce state 5.

## Purpose

Decide what fits the book and mint exactly one `trade-instruction` artifact per decision —
sized against live balances, carrying UUID, TTL, and mandatory protective exits — then hand it
to the Execution Desk. This skill never runs an order-mutating command, never re-decides
strategy merit (that was state 4), and never bypasses the desk: every mutation, including
protective stops and closes, is requested from Execution.

## Inputs

One of, as the decision source (each acked on intake per `org-protocol`):

- An `approved-strategy` artifact (`.tribes/org/strategies/<id>.json`) with entry/exit/sizing
  rules, judge verdict, kill switch, `expires_at`.
- A trigger event (`.tribes/org/triggers/<id>.json`) from `portfolio-triggers` — protective or
  entry.
- A thesis re-evaluation outcome (HOLD / ADD / EXIT) arriving as an instruction request citing
  its `.tribes/thesis/` record — never executed directly.
- A user-directed order from the Head of Desk: user-confirmed side + size + asset.

Plus always: fresh reconcile and exposure reports (`live` window), the pass's all-dex asset
snapshot (szDecimals, maxLeverage, markPx, onlyIsolated), and live balances.

## Outputs

`.tribes/org/instructions/<uuid>.json`, state `trade-instruction` — venue, dex, coin (or spot
pair), side, size in base units, order type (market | limit + price | scale | twap), limit/
trigger prices, protective exit prices (tp/sl), leverage, margin mode, reduce-only flag where
applicable, instruction UUID (= filename), TTL as `expires_at`, `upstream[]` ids,
authorization evidence and every contract item in `checks[]`, sizing sources stamped with
provider + command + `source_ts` + `retrieved_at`. The instruction is a decision (an order to
the desk); it is not an executed action and is never treated as one. Rejected inputs are
stamped `rejected`/`expired` with reasons — never silently dropped.

## Integration

- `tribes-cli hyperliquid list-balances --address <addr>` — accountValue, withdrawable for
  sizing (per `--dex` where margin sits on a builder dex).
- `tribes-cli hyperliquid list-assets --all-dexes --out <file>` — szDecimals, maxLeverage,
  markPx, onlyIsolated; reuse the pass snapshot within its `live` window.
- `uuidgen` (lowercased) — the instruction UUID; `date -u` — timestamps.
- Reconcile + exposure reports — fit inputs (`portfolio-reconcile`, `portfolio-exposure`).
- Envelope, id/cloid derivation, serialization, acks: `org-protocol`. Handoff target:
  Execution Desk (`exec-validate-instruction` is the next gate).

## Preconditions

- Authorization exists: the user's explicit confirmation of side + size + asset, OR standing
  authorization with a judge-approved thesis and every safety gate passed — recorded in
  `checks[]`. No authorization, no instruction.
- Reconcile and exposure reports fresh; the asset is not halted by a `discrepancy` and has no
  open protective event (entries only).
- Per-asset serialization: no in-flight instruction on the (dex, coin) — or, for protective
  instructions, the Execution Lead has been asked to supersede the pending entry first.

## Procedure

Entry path (approved strategy, entry trigger, thesis ADD, user order):

1. Intake and ack the source artifact. Idempotency guard: scan `instructions/` for a
   non-terminal instruction citing the same upstream id — if found, STOP (never mint twice
   for one decision).
2. Gate the strategy: `expires_at` unexpired NOW and kill switch untripped against fresh data
   — else stamp it `expired`/`rejected` and bounce to Strategy Research.
3. Conditional strategies (`executable: false`): require the timestamped trigger-fired event
   from `portfolio-triggers` in `upstream[]`; no event, no instruction.
4. Portfolio fit from the exposure report: allocation and class caps, correlation notes,
   margin headroom, trigger conflicts, per-strategy cap. Fit failure → `rejected` with the
   portfolio-fit reason back to Research. For user-directed orders fit runs ADVISORY: record
   concerns, proceed on the user's explicit confirmation.
5. Size against LIVE balances: USD allocation → base units at markPx, rounded DOWN to
   szDecimals; respect venue min notional (~$10), maxLeverage, forced-isolated flags. Sizing
   from stale data is forbidden.
6. Set protective exits: tp/sl prices per the strategy's exit rules — mandatory on every
   entry, waivable only by the user's explicit recorded waiver on a user-directed order.
7. Mint: `uuidgen` → write `instructions/<uuid>.json` atomically with the full envelope,
   TTL = min(strategy `expires_at`, the execution window this decision tolerates), and
   `checks[]` listing every gate passed.
8. Hand to the Execution Desk; require the ack sidecar; follow up or escalate if none.

Reduce-only exception path (protective exits, thesis EXIT, partial-fill remainders):

9. May originate directly at state 5: `upstream[]` cites the `portfolio-position` id plus the
   trigger event or thesis re-evaluation record. MUST set reduce-only; side OPPOSITE the
   position; size ≤ live position size. Protective outranks entries: request supersede of any
   pending entry on the (dex, coin) before handoff. Still passes desk validation and
   preflights — the exception skips states 1–4, never the desk.
10. Partial fills at TTL: re-entry for the unfilled remainder is a NEW instruction minted
    here, at current prices — the desk never chases.

## Validation

- `checks[]` proves: authorization, strategy-unexpired, kill-switch-clear, trigger-fired
  (conditional only), portfolio-fit (or advisory note), sized-live, exits-set, serialization-
  clear.
- Size, prices, and decimals are consistent with the cited asset snapshot; TTL > now.
- Reduce-only instructions: flag set, side opposite, size ≤ position, upstream cites position
  - trigger/thesis ids.
- Exactly one instruction file per decision; UUID is the filename.

## Risk & safety

- This skill NEVER runs trade, cancel, leverage, margin, transfer, deposit, or withdraw
  commands — the Execution Desk is the only order-mutating department.
- Entries always traverse the full chain; only reduce-only instructions use the exception.
- Insufficient margin headroom → do NOT mint. Funding is never automated: escalate to the
  Head of Desk for a human-confirmed funding flow, verify it landed via the venue ledger
  (`portfolio-reconcile`), then re-issue.
- An `insufficient-margin` return from the desk freezes re-issuance for that decision until
  reconcile confirms new funds.
- Never loosen a threshold to make a trade fit (`portfolio-triggers` owns that boundary).

## Failure & retry

- Desk rejection (validation/preflight) → instruction stamped `rejected` with the desk's
  data; fix the cause (resize, reprice, or bounce upstream) and mint a NEW instruction — never
  edit a rejected artifact into a retry.
- Stale inputs → refresh reconcile/exposure once; still stale → abort with `stale-inputs`.
- Missing desk ack → follow up once, then escalate to the Head of Desk.
- Minting interrupted mid-write → the atomic-write rule means no partial artifact; re-run the
  idempotency guard in step 1 before any re-mint.

## Timeouts & rate limits

- 60 s bash timeout per read; `--out` on the all-dex snapshot. No polling loops here — fill
  confirmation belongs to the desk (`exec-order-lifecycle`).

## Observability

- `instructions/<uuid>.json` is the audit record; the same UUID names the order, fill, and
  position artifacts (`org-protocol`), so one key joins decision → execution → book. Rejected
  and expired instructions stay in place, stamped, until the recovery sweep archives them.

## Escalation

- Portfolio-fit and gate rejections → back to Strategy Research with reasons.
- Margin shortfalls and funding needs → Head of Desk → the human (funding is human-gated).
- Serialization conflicts → Execution Lead (supersede decisions are theirs).
- Unacked handoffs, repeated desk failures → Head of Desk; technical faults → `eng-triage`.

## Example

```bash
uuidgen | tr 'A-Z' 'a-z'   # → 3f2a4c6e-8b1d-4f20-9a7c-5e3b1d9f8a60
```

```json
{
  "id": "3f2a4c6e-8b1d-4f20-9a7c-5e3b1d9f8a60",
  "state": "trade-instruction",
  "expires_at": "2026-07-30T15:00:00Z",
  "producer": "pm-lead",
  "upstream": ["20260729T221000Z-eth-funding-carry", "20260730T093010Z-trigger-eth-entry"],
  "checks": [
    "authorization:standing+thesis",
    "strategy-unexpired",
    "kill-switch:clear",
    "trigger-fired:20260730T093010Z",
    "portfolio-fit:pass",
    "sized-live:0.5@2510",
    "exits-set:tp2600/sl2350",
    "serialization:clear"
  ],
  "payload": {
    "venue": "hyperliquid",
    "dex": "main",
    "coin": "ETH",
    "side": "long",
    "size": "0.5",
    "orderType": "market",
    "tpPx": "2600",
    "slPx": "2350",
    "leverage": 3,
    "marginMode": "cross",
    "reduceOnly": false
  }
}
```

Success: the desk acks, validates, preflights, and places it with cloid
`0x3f2a4c6e8b1d4f209a7c5e3b1d9f8a60` derived from this UUID.

## Acceptance

- [ ] Every gate in the state-5 contract checked and recorded in `checks[]`.
- [ ] Sized against live balances with correct decimals; TTL and protective exits set.
- [ ] Reduce-only exception used only for reduce-only instructions, with position + trigger/
      thesis upstream ids.
- [ ] One instruction per decision (idempotency guard ran); handoff acked.
- [ ] Zero order-mutating commands executed by this skill.

## Related skills

- `exec-validate-instruction` — the desk gate every instruction meets next.
- `exec-place-order` — turns the instruction into the one atomic order.
- `exec-order-lifecycle` — confirmation and terminal states fed back for state 8.
- `portfolio-exposure` — fit inputs: headroom, concentration, correlation.
- `portfolio-reconcile` — live book truth and funding verification.
- `portfolio-triggers` — trigger events consumed here as entry/protective sources.
- `thesis` — re-evaluation outcomes (HOLD/ADD/EXIT) arriving as requests.
- `org-protocol` — envelope, UUID/cloid derivation, serialization, acks.
