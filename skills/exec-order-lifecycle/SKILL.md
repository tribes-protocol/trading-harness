---
name: exec-order-lifecycle
description: >-
  Execution Desk skill that owns every submitted org order after the placement command returns
  — bounded order-status/list-fills confirmation polling under a checked rate-limit budget,
  partial-fill artifacts, TTL-expiry cancels by cloid, TWAP tracking by twapId, unknown-state
  resolution with venue evidence only, and orphan handling in the session-start recovery pass.
  Handles: producing confirmed-fill artifacts and every cancel the desk runs. Call it with the
  order UUID immediately after exec-place-order, and at session start for recovery. NOT for:
  submitting or resubmitting orders (use exec-place-order); on-chain swap broadcasts and their
  tx polls (use exec-onchain-swap); folding confirmed fills into the book (use
  portfolio-reconcile); protective stop policy (use position-management).
allowed-tools: bash read
---

# Exec: Order Lifecycle

## Identity

- Stable id: `exec-order-lifecycle` — owner: Execution Desk. Invoked by: Order Monitor.

## Purpose

Take ownership of an order the moment the submission command returns and keep it until the
artifact reaches `confirmed-fill` or a terminal state: confirmation from venue data only,
partial-fill bookkeeping, remainder cancels at TTL, TWAP tracking, and resolution of `unknown`
outcomes. The Order Monitor is the only role that may move an artifact out of `unknown`, and
only with venue evidence. This skill never submits, resubmits, or re-prices anything.

## Inputs

Required: an order artifact `.tribes/org/orders/<uuid>.json` (from `exec-place-order`)
holding the cloid — or twapId for TWAPs, plus the oid when the venue echoed one — dex,
coin/pair, instructed size, and the instruction TTL; the wallet address and wallet id from
`tribes-cli wallet list` for cancels. Recovery mode: every non-terminal `orders/` entry plus
the venue open-order sweep.

## Outputs

- A `confirmed-fill` artifact `.tribes/org/fills/<uuid>.json` (same UUID): size-weighted fill
  price, filled size, fees and fee token, oid, cloid or twapId, trade ids, venue timestamps,
  and `partial: true` when filled < instructed — every field a venue fact with provider,
  command, source timestamp, and retrieval timestamp per org-protocol.
- Terminal stamps on the order artifact: `cancelled` (TTL remainder), `expired`, `failed`
  (proven not executed), or `unknown` resolved to its true outcome. Stamps and cancels are
  desk actions; this skill emits no recommendations.

## Integration

- `tribes-cli hyperliquid order-status --address --cloid` (or `--oid`; new adapter per the
  charter) — the only safe fill/cancel/reject confirmation by id.
- `tribes-cli hyperliquid list-fills --address --start-time --out` — fill evidence; filter
  rows by cloid, oid, or twapId (`--aggregate-by-time` combines TWAP slice fills).
- `tribes-cli hyperliquid rate-limit --address` (new adapter) — API budget before poll loops.
- `tribes-cli hyperliquid cancel-order --from --coin --dex --wallet-id` with `--order-id`, or
  `--cloid` (new flag) when the oid is unknown; spot: `cancel-order-spot --pair` with the
  same id options.
- `tribes-cli hyperliquid list-positions --address --dex` — the active-TWAP section
  (twapId, executed/remaining); `tribes-cli hyperliquid twap-cancel --from --coin --twap-id
--wallet-id`.
- `tribes-cli hyperliquid list-open-orders --address --all-dexes --out` — recovery-pass
  orphan diff. Unknown rules, recovery passes, budgets: `org-protocol`.

## Preconditions

- The order artifact exists — a venue order with no intent journal is a recovery case, not a
  monitoring case.
- Wallet identity resolved; `rate-limit` checked before the first poll loop of the session.

## Procedure

1. Budget: `rate-limit --address` — on a low remaining budget, widen poll intervals and defer
   non-urgent checks; never poll blind.
2. Confirm: `order-status --cloid` (oid if known). Filled → pull the matching rows from
   `list-fills`, write `fills/<uuid>.json` atomically, stamp the order artifact filled.
   Resting limit → re-check on a bounded schedule until fill or TTL. Market/IOC orders
   resolve within a poll or two — a missing result there goes down the unknown path, not
   into a long loop.
3. Partials: filled < instructed → write the fill artifact for the filled size with
   `partial: true` and keep monitoring the remainder until TTL.
4. TTL expiry: cancel the remainder — `cancel-order --cloid` (spot:
   `cancel-order-spot --cloid`); re-read `order-status` and `list-fills` afterward (a fill
   can race the cancel), then stamp `cancelled` with the final filled size, or finalize the
   fill artifact if the race filled it. Re-entry for the unfilled size is a NEW instruction
   from Portfolio Management — the desk never chases.
5. TWAP: track via the twapId in the `list-positions` TWAP section (executed vs remaining);
   slices land in `list-fills`. At TTL or on supersession: `twap-cancel`, then a final fills
   read → fill artifact for the executed total (already-executed slices stand).
6. Unknown resolution — the only path out of `unknown`: `order-status --cloid` plus
   `list-fills` since submission. Order or fill found → adopt it (record the oid, continue at
   step 2). Neither found after the venue had time to settle → stamp `failed`
   (proven-not-executed). Evidence unreachable → keep `unknown`, freeze the (dex, coin), and
   escalate. NEVER resubmit to resolve an unknown.
7. Recovery pass (session start, org-protocol): run step 6 for every non-terminal `orders/`
   entry; then diff `list-open-orders --all-dexes` against live instructions — cancel
   orphans whose parent artifact is terminal or expired, adopt resting orders that belong to
   live artifacts (record their oids), and report venue orders with no org parentage as
   user-directed context (never cancel those).
8. Handoff: give each `confirmed-fill` UUID to Portfolio Management for reconciliation and
   expect the ack sidecar per org-protocol.

## Validation

- Every fill artifact cites order-status/list-fills rows — a submit response alone is NEVER
  fill evidence.
- Every cancel was verified afterward by a fresh order-status or open-orders read.
- Every poll loop was budget-checked and bounded, with the loop count recorded.

## Risk & safety

- This skill never places an order: cancels (order, spot order, TWAP) are its only
  mutations, and each targets one id traceable to an org artifact.
- Cancel only proven orphans (terminal or expired parent); venue orders with no org
  parentage are adopted as user-directed context — cancelling a manual user order is
  forbidden.
- Protective bracket legs of a live position are cancelled here ONLY when a PM protective
  instruction explicitly names the old exit to replace — cancel the old stop/TP by its order
  id BEFORE the Runner places the replacement (`position-management` hard rule: two live
  exits double-book the same size). Never on this skill's own initiative.
- No funding flow, ever.

## Failure & retry

- Explicit states: filled (fill artifact), `partial` marker, `cancelled`, `expired`,
  `failed`, `unknown` (frozen). Silent drops are forbidden.
- A cancel rejected because the order already filled or is gone is benign: re-read status
  and stamp the truth. Re-issue a cancel only after status shows the order still resting —
  that discipline makes cancels effectively idempotent.
- `order-status` unreachable after one retry → block new instructions on that asset and
  escalate (org-protocol recovery rule). Auth error: `tribes-cli login` once, re-run the
  read.

## Timeouts & rate limits

- `rate-limit` before every poll loop; poll `order-status` at ≥ 5 s intervals, at most 20
  polls per order per pass, then reassess or escalate.
- 60 s bash timeout per command; `list-fills` and `list-open-orders --all-dexes` write via
  `--out` (large outputs).

## Observability

- `orders/<uuid>.json` accumulates the lifecycle history: polls, evidence, cancel results,
  and state transitions with timestamps. `fills/<uuid>.json` is the confirmation record. The
  whole execution chain joins on the instruction UUID.

## Escalation

- Unresolved `unknown` or unreachable venue evidence → Execution Lead freezes the
  (dex, coin); the Head of Desk notifies the human (`notify`) before the session ends.
- Fill-vs-expectation discrepancies → Portfolio Manager via `portfolio-reconcile`.
- Technical venue errors → Engineering work order via `eng-triage`.

## Example

```bash
tribes-cli hyperliquid rate-limit --address 0xWALLET
tribes-cli hyperliquid order-status --address 0xWALLET \
  --cloid 0x3f2a4c6e8b1d4f209a7c5e3b1d9f8a60
tribes-cli hyperliquid list-fills --address 0xWALLET --start-time 1785410000000 \
  --out .tribes/org/snapshots/20260730T121000Z-fills.json
```

Success: `fills/3f2a….json` written in state `confirmed-fill` (0.5 ETH at 2412.3, fee 0.35
USDC, oid and cloid recorded, not partial); the order artifact is stamped filled and the UUID
is handed to Portfolio Management.

## Acceptance

- [ ] Confirmation came from order-status/list-fills evidence, never the submit response.
- [ ] Partials produced a fill artifact plus a partial marker; TTL remainders were cancelled
      by cloid and stamped.
- [ ] `unknown` moved only on venue evidence; nothing was ever resubmitted from here.
- [ ] The recovery pass resolved journals, cancelled proven orphans only, and adopted the
      rest.
- [ ] Every poll loop was rate-limit-checked and bounded.

## Related skills

- `exec-place-order` — the submission that hands every UUID to this skill.
- `exec-onchain-swap` — the swap path, which owns its own tx-hash lifecycle.
- `portfolio-reconcile` — folds confirmed fills into the book.
- `position-management` — protective-exit procedures run on PM instructions.
- `org-protocol` — unknown rules, recovery passes, envelope, budgets.
- `hyperliquid` — full flag reference for status, fills, and cancel commands.
- `notify` — human alert when an unknown cannot be resolved in-session.
