---
name: portfolio-triggers
description: >-
  Portfolio Management skill that evaluates the book and conditional approved strategies
  against .tribes/org/config/thresholds.json — stop/take distance floors, drawdown limits, the
  liquidation-distance minimum, allocation caps, per-strategy exposure caps — and emits trigger
  events as instruction requests to the Portfolio Manager. Handles: book protective triggers
  (reduce-only, outranking entries), conditional-strategy entry triggers, threshold-change
  recording, and the human-approval boundary on loosening hard limits. Call it on every
  monitoring pass and at session end. NOT for: computing the exposure inputs (use
  portfolio-exposure); reconciling venue state (use portfolio-reconcile); minting the resulting
  instruction (use portfolio-rebalance); placing or cancelling orders (use exec-place-order).
allowed-tools: bash read
---

# Portfolio: Triggers

## Identity

- Stable id: `portfolio-triggers` — owner: Portfolio Management. Invoked by: Trigger Manager.

## Purpose

Watch two things and fire on both: the book against its risk thresholds (protective triggers)
and conditional approved strategies against their entry conditions (entry triggers). A firing
trigger becomes a trigger-event artifact and an instruction request to the Portfolio Manager —
never a direct order. Venue-resident bracket exits are the PRIMARY protection on every org
position; org-side triggers are secondary and best-effort in a poll-only harness, and this
skill never claims otherwise.

## Inputs

Required: `.tribes/org/config/thresholds.json`; fresh reconcile and exposure reports (`live`
window — run `portfolio-reconcile` / `portfolio-exposure` first if missing); the pass's
all-dex asset snapshot for marks. Optional: conditional strategies —
`.tribes/org/strategies/*.json` with `executable: false` and a checkable trigger; open trigger
events (for dedup).

## Outputs

- Trigger events: `.tribes/org/triggers/<UTC>-<slug>.json` envelopes (`org-protocol`), payload
  `{kind, severity, position_id | strategy_id, threshold: {field, limit}, observed,
requested_action}` — each observed value stamped with provider + command + `source_ts` +
  `retrieved_at`. Events are signals; the requested instruction is a recommendation; the only
  actions here are event writes and escalations.
- Instruction requests to the Portfolio Manager: protective (reduce-only, cites position id +
  event id) or entry (cites strategy id + event id with the timestamped trigger-fired check).
- Threshold-change records: before/after values appended to the file's `history[]`.
- Explicit failure states: `stale-inputs` (no evaluation ran), `no-thresholds` (only the
  bracket-missing check ran).

## Integration

- `tribes-cli hyperliquid list-positions --address <addr> --all-dexes --out <file>` — sizes,
  liquidation prices, leverage (reuse the reconcile pull within its window).
- `tribes-cli hyperliquid list-assets --all-dexes --out <file>` — marks for distance math and
  for checking conditional-strategy entry conditions (funding, price levels).
- `tribes-cli hyperliquid list-open-orders --address <addr> --all-dexes --out <file>` —
  verify venue brackets (reduce-only trigger orders) exist per position.
- Exposure report (`portfolio-exposure`) — drawdown, allocation shares, per-strategy rollups.
- Envelope, atomic writes, serialization rules: `org-protocol`.

Thresholds schema — `.tribes/org/config/thresholds.json`. Hard limits need human confirmation
to LOOSEN; soft floors are Portfolio Manager discretion, still recorded:

```json
{
  "version": 4,
  "updated_at": "2026-07-30T08:00:00Z",
  "hard": {
    "max_drawdown_pct": 15,
    "min_liq_distance_pct": 20,
    "max_asset_alloc_pct": 30,
    "max_class_alloc_pct": 60,
    "per_strategy_exposure_usd": 4000
  },
  "soft": {
    "min_stop_distance_pct": 1.5,
    "min_take_distance_pct": 2.0
  },
  "history": [
    {
      "at": "2026-07-28T10:00:00Z",
      "by": "human-approved",
      "field": "hard.max_drawdown_pct",
      "before": 12,
      "after": 15
    }
  ]
}
```

## Preconditions

- Inputs within their `live` windows — the `org-protocol` rule is absolute: stale data never
  drives triggers. Stale inputs → `stale-inputs`, refresh or abort.
- Thresholds file loads and validates; missing/invalid → `no-thresholds`: only the
  bracket-missing check runs, and the Portfolio Manager is told to set limits (with the human)
  before any new entry instruction.

## Procedure

1. Load and validate thresholds. Apply any pending change ONLY with a `history[]` entry
   recording before/after; a change loosening any `hard.*` field requires prior human
   confirmation via the Head of Desk, recorded as `"by": "human-approved"`.
2. Load reconcile + exposure reports and marks; verify freshness; skip `discrepancy` assets
   (already halted).
3. Bracket check first (primary protection): any position without armed venue-resident exits →
   protective event `bracket-missing`, highest priority.
4. Book evaluation per position: liquidation distance < `min_liq_distance_pct` →
   `liq-distance-breach`; stop distance beyond/tighter than the soft floors → advisory event;
   asset/class allocation over cap → `allocation-breach`; per-strategy rollup over
   `per_strategy_exposure_usd` → `strategy-cap-breach`.
5. Account evaluation: drawdown ≥ `max_drawdown_pct` → `drawdown-breach` (book-level
   protective event).
6. Entry triggers: for each unexpired conditional strategy, check its stated trigger against
   fresh data; fired → entry event embedding the observed evidence and check timestamp (this
   is the state-5 "trigger-fired" proof `portfolio-rebalance` requires).
7. Dedup: an open, unresolved event for the same (position | strategy, kind) is not re-emitted
   — re-running this skill is idempotent.
8. Emit events atomically under `triggers/`; hand instruction requests to the Portfolio
   Manager and require ack sidecars. Protective requests state: supersede any pending
   non-protective instruction on the (dex, coin) first — protective outranks entries
   (`org-protocol` serialization).
9. Session-end: report any armed/open event and the blind-monitoring warning per
   `org-protocol`.

## Validation

- Every event cites the threshold field, limit, observed value, and sources; every observed
  value was `live` at evaluation time.
- Protective events are marked reduce-only in `requested_action`; entry events carry the
  timestamped trigger-fired evidence.
- No duplicate open events; every emitted event has (or is awaiting) a PM ack sidecar.

## Risk & safety

- Evaluation only: never place, cancel, or modify orders; never touch venue brackets — they
  are the primary protection and are re-armed via PM instructions, not replaced by org polls.
- Loosening a hard limit without recorded human confirmation is forbidden; every threshold
  change carries before/after values.
- Protective always outranks entry — never request an entry on an asset with an open
  protective event.
- Never fire on stale marks, `discrepancy` assets, or unreconciled state.

## Failure & retry

- `stale-inputs`: refresh inputs once (re-run reconcile/exposure); still stale → abort with
  the failure state recorded; never evaluate anyway.
- Provider read failing twice → Engineering work order (`eng-triage`); positions that cannot
  be evaluated are named, and their protective status is treated as unknown → escalate rather
  than assume safe.
- An event without a PM ack by session end → follow up, then escalate to the Head of Desk.

## Timeouts & rate limits

- 60 s bash timeout per read; `--out` on all-dex pulls (large outputs).
- Reuses pass snapshots; no extra all-dex sweep; no poll loops (the Order Monitor owns those).

## Observability

- `triggers/` holds every event with its evidence and ack status — the audit trail from
  threshold to instruction request. Threshold history lives in the config file itself.
  Resolved events are stamped in-file and swept by the recovery pass.

## Escalation

- Protective events → Portfolio Manager → reduce-only instruction (`portfolio-rebalance`) →
  Execution Desk.
- Hard-limit breaches (drawdown, liquidation distance, allocation) → ALSO the Head of Desk
  notifies the human (`notify`) — after the protective request is raised, per the charter.
- Entry events → Portfolio Manager for the full state-5 contract; no shortcut.
- Unevaluable positions or repeated data failures → Engineering work order.

## Example

```bash
tribes-cli hyperliquid list-assets --all-dexes \
  --out .tribes/org/snapshots/20260730T093000Z-all-dexes.json
# evaluate → ETH long liq distance 14% < hard.min_liq_distance_pct 20
```

Success: `.tribes/org/triggers/20260730T093010Z-trigger-eth-liq-distance.json` written —
`kind: liq-distance-breach`, severity protective, observed 14 vs limit 20, `requested_action`:
reduce-only size cut on (main, ETH), supersede pending entries first; PM ack sidecar present;
human notified (hard limit).

## Acceptance

- [ ] All book thresholds and all conditional entry triggers evaluated on `live`, reconciled
      inputs — or an explicit failure state recorded instead.
- [ ] Bracket-missing checked first; protective events reduce-only and outranking entries.
- [ ] No duplicate open events; every event acked or followed up.
- [ ] Threshold changes recorded before/after; hard-limit loosening human-approved first.
- [ ] Zero order mutations from this skill.

## Related skills

- `portfolio-exposure` — computes the drawdown/allocation inputs evaluated here.
- `portfolio-reconcile` — reconciled book and bracket-arming facts.
- `portfolio-rebalance` — turns trigger events into trade instructions.
- `org-protocol` — envelope, serialization, freshness, recovery.
- `thesis` — re-evaluation outcomes; protective triggers outrank them.
- `notify` — human notification on hard-limit breaches.
- `hyperliquid` — read-command reference.
