---
name: exec-margin-preflight
description: >-
  Execution Desk gate that proves the account can carry a validated trade-instruction —
  dex-scoped balances (withdrawable, accountValue, totalMarginUsed), existing position and
  open-order netting risk on the asset, free-margin sufficiency with a liquidation-distance
  sanity check, and the per-asset serialization check. Handles: the last money check before
  submission; a shortfall freezes the instruction and returns insufficient-margin to Portfolio
  Management — never a funding flow. Call it after exec-cost-preflight and before
  exec-place-order. NOT for: cost and slippage estimates (use exec-cost-preflight);
  instruction validity (use exec-validate-instruction); reconciling the whole book (use
  portfolio-reconcile); placing the order (use exec-place-order).
allowed-tools: bash read
---

# Exec: Margin Preflight

## Identity

- Stable id: `exec-margin-preflight` — owner: Execution Desk. Invoked by: Risk Assessor.

## Purpose

Prove, with live venue data, that the account can open and carry the instructed position on
the dex it names: enough free margin on THAT dex, no accidental netting or duplication against
what already rests there, a sane liquidation distance at the instructed leverage, and no other
in-flight instruction on the same (dex, coin). A shortfall never becomes a deposit — it
freezes the instruction back to Portfolio Management with reason `insufficient-margin`.

## Inputs

Required: a trade-instruction that passed `exec-validate-instruction` and
`exec-cost-preflight` this session (uuid, dex, coin, side, size, leverage, margin mode, TTL,
protective exits); the wallet address from `tribes-cli wallet list`; the asset's snapshot row
(referencePx, maxLeverage, margin flags, markPx, prevDayPx). Optional: the margin-buffer
fraction from `.tribes/org/config/thresholds.json`.

## Outputs

A margin block appended to the desk sidecar `.tribes/org/instructions/<uuid>.ack.json`.
Facts: `withdrawable`, `accountValue`, `totalMarginUsed` on the instruction's dex, plus the
existing position and resting orders found on the (dex, coin) — each with provider, command,
source timestamp, and retrieval timestamp per org-protocol. Derived (labeled): required
margin, post-trade free margin, estimated liquidation distance. Decision:
`verdict: pass | reject` with reasons; `insufficient-margin` additionally marks the
instruction frozen for the Execution Lead. No artifact state is produced.

## Integration

- `tribes-cli wallet list` — the account address (and the wallet ids the runner uses later).
- `tribes-cli hyperliquid list-balances --address <addr> --dex <dex>` — margin truth on the
  instruction's dex; collateral is per-dex, so a main balance does not margin an xyz order.
- `tribes-cli hyperliquid list-positions --address <addr> --dex <dex>` and
  `tribes-cli hyperliquid list-open-orders --address <addr> --dex <dex>` — existing exposure.
- `.tribes/org/instructions/` and `.tribes/org/orders/` — the serialization scan.
- Envelope, serialization rule, freshness classes: `org-protocol`.

## Preconditions

- Both prior desk gates recorded `ack` this session; the instruction TTL is unexpired NOW.
- Balance, position, and open-order reads are `live` (≤ 5 min) at verdict time.

## Procedure

1. Identity: `wallet list` → the account address for every read below.
2. Balances on the instruction's dex: `list-balances --dex <dex>` → `withdrawable`,
   `accountValue`, `totalMarginUsed` (facts).
3. Existing exposure on the (dex, coin): `list-positions` and `list-open-orders` filtered to
   the coin. A same-direction position or resting entry the instruction does not account for
   → flag `duplication-risk`. An opposite-direction instruction without the reduce-only
   marker would net or flip the position → flag `netting-risk`. Either flag → reject; PM must
   restate intent.
4. Serialization: scan `instructions/` and `orders/` for another non-terminal artifact on the
   same (dex, coin). Found → reject `serialization-conflict`; the Execution Lead resolves
   supersession per org-protocol — this skill never supersedes anything itself.
5. Free margin: requiredMargin = size × referencePx / leverage. Pass requires requiredMargin
   ≤ `withdrawable` minus the configured buffer, after accounting margin already held by
   resting orders. Shortfall → reject `insufficient-margin` with the exact shortfall amount.
6. Liquidation distance: estimate the post-trade liquidation price at the instructed leverage
   and margin mode. When `.tribes/org/config/thresholds.json` is present, distance below
   `hard.min_liq_distance_pct` → reject `liq-distance-breach`. Additionally (and as the only
   check when no thresholds file exists), a buffer thinner than the asset's recent daily move
   (snapshot markPx vs prevDayPx) → reject `thin-liq-buffer` with the numbers; PM may lower
   leverage or size.
7. Verdict: write the margin block atomically; `ack` only when every check passed.
   `insufficient-margin` → mark the instruction frozen and return it to Portfolio Management.

## Validation

- Balances, positions, and orders were read on the instruction's dex, never defaulted to
  main.
- Derived numbers (required margin, liquidation distance) show their inputs and are labeled
  derived — never presented as venue facts.
- Only read commands ran; nothing was cancelled, transferred, or submitted.

## Risk & safety

- NEVER a funding flow: no deposit, no withdraw, no usd-class or dex-cash transfer, no
  bridge. Funding is a separate human-gated Head-of-Desk flow, verified via the venue ledger
  before PM re-issues the instruction.
- Never shrink the instruction to fit free margin — resizing is PM's decision.
- The serialization rule is absolute: at most one in-flight instruction per (dex, coin);
  protective instructions outrank entries (the Execution Lead enforces supersession).

## Failure & retry

- Explicit reject reasons: `insufficient-margin` (freezes), `duplication-risk`,
  `netting-risk`, `serialization-conflict`, `thin-liq-buffer`.
- Provider failure: retry once (org-protocol); still failing → `blocked:
account-data-unavailable` and escalate — a verdict is never issued on partial account data.
- Idempotent: read-only and safe to re-run; a re-run replaces the margin block against fresh
  balances.

## Timeouts & rate limits

- 60 s bash timeout per read; three account reads per verdict, no polling loops. Reuse the
  session's snapshot for referencePx — never re-sweep here.

## Observability

- The margin block in `<uuid>.ack.json`: balances, exposure found, serialization scan result,
  derived math, verdict, timestamps — joined to the execution chain by the instruction UUID.

## Escalation

- `insufficient-margin` → Execution Lead freezes the instruction → Portfolio Manager decides:
  resize, drop, or ask the Head of Desk to raise funding with the human.
- `serialization-conflict` → Execution Lead (supersede or queue per org-protocol).
- `blocked` → Execution Lead; persistent failure → Engineering work order via `eng-triage`.

## Example

```bash
tribes-cli wallet list
tribes-cli hyperliquid list-balances --address 0xWALLET --dex xyz
tribes-cli hyperliquid list-positions --address 0xWALLET --dex xyz
tribes-cli hyperliquid list-open-orders --address 0xWALLET --dex xyz
```

Success: the sidecar gains `{"margin":{"withdrawable":412.8,"requiredMargin":100.0,
"bufferOk":true,"existingExposure":"none","serialization":"clear","liqDistancePct":18.4,
"verdict":"pass"}}` — the instruction may proceed to `exec-place-order`.

## Acceptance

- [ ] Margin was checked on the instruction's dex with live balances.
- [ ] Existing positions, resting orders, and in-flight artifacts on the (dex, coin) were all
      scanned before the verdict.
- [ ] A shortfall froze the instruction with `insufficient-margin` — no funding flow ran.
- [ ] Derived numbers are labeled and traceable; no verdict was issued on partial data.

## Related skills

- `exec-validate-instruction` — the instruction gate preceding this one.
- `exec-cost-preflight` — the cost verdict consumed alongside this gate.
- `exec-place-order` — the submission path a pass here unlocks.
- `exec-order-lifecycle` — resolves the in-flight order states this gate scans for.
- `portfolio-reconcile` — book-wide reconciliation; this gate is per-instruction.
- `org-protocol` — serialization rule, envelope, freshness classes, retry rules.
- `zipbox-wallet` — wallet identity commands.
- `hyperliquid` — full flag reference for the account reads.
