---
name: exec-cost-preflight
description: >-
  Execution Desk preflight that prices a validated trade-instruction before submission — the
  account's real fee tier via user-fees, an order-book depth walk for expected slippage at
  size, impactPxs sanity, and a funding-cost note for perps held past a funding interval — and
  verdicts the total against the instruction's cost tolerance. Handles: fee, slippage, and
  funding-cost estimation for org instructions. Call it after exec-validate-instruction passes
  and before exec-place-order. NOT for: instruction validity (use exec-validate-instruction);
  margin and balance sufficiency (use exec-margin-preflight); funding as a trading signal (use
  intel-funding-oi); submitting the order (use exec-place-order).
allowed-tools: bash read
---

# Exec: Cost Preflight

## Identity

- Stable id: `exec-cost-preflight` — owner: Execution Desk. Invoked by: Risk Assessor.

## Purpose

Estimate what executing a validated instruction will actually cost — venue fees at the
account's real tier, expected slippage from walking the live book at the instruction's size,
and funding carry for perps held past a funding interval — then verdict the total against the
instruction's declared cost tolerance. Estimates are labeled estimates; this skill never
places, cancels, or resizes anything.

## Inputs

Required: a trade-instruction that passed `exec-validate-instruction` this session (uuid, dex,
coin, side, size, order type, TTL); the wallet address from `tribes-cli wallet list`; the
shared all-dex snapshot row for the asset (referencePx, impactPxs, current funding).
Optional: the strategy's expected hold horizon in hours (funding estimate; default one funding
interval); a cost tolerance in bps from the instruction payload, else the default in
`.tribes/org/config/thresholds.json`.

## Outputs

A cost block appended to the desk sidecar `.tribes/org/instructions/<uuid>.ack.json`. Facts:
fee tier (maker/taker rates), book levels consumed, current and trailing funding rates — each
with provider, command, source timestamp, and retrieval timestamp per org-protocol. Estimates
(labeled): expected fill price, slippage bps, funding cost for the horizon. Decision:
`verdict: pass | reject` with `totalCostBps` vs tolerance. A note suggesting a different order
type (for example limit instead of market) is a recommendation for PM, never an edit.

## Integration

- `tribes-cli hyperliquid user-fees --address <addr>` (new adapter per the charter) — the
  account's real fee tier; public rates are never assumed.
- `tribes-cli hyperliquid order-book --coin <coin> --dex <dex> --depth 20 --out <file>` — L2
  levels for the depth walk.
- The all-dex snapshot (`list-assets --all-dexes`, reused) — referencePx, impactPxs, funding.
- `tribes-cli hyperliquid funding-history --coin <coin> --start-time <ms>` (both flags
  required; window start in epoch ms) — trailing funding for the carry estimate.
- Envelope, freshness classes, retry rules: `org-protocol`.

## Preconditions

- `exec-validate-instruction` verdict `ack` recorded this session; TTL unexpired NOW.
- Book snapshot and asset row within the `live` freshness window at computation time.

## Procedure

1. Fees: `user-fees` → taker rate for market/IOC intents, maker rate for resting Alo limits
   (a Gtc limit may cross — use taker unless the price clearly rests). feeUsd = rate ×
   notional (size × referencePx). Record the tier verbatim as fact.
2. Depth walk: `order-book` on the instruction's side — consume asks (buy) or bids (sell)
   until the size is filled; expected fill price = size-weighted average; slippage bps vs
   mid. Book exhausted before the size fills → fact `insufficient-depth`, verdict reject.
3. Impact sanity: compare the walk result against the snapshot's `impactPxs`; a large
   disagreement flags `impact-incoherent` — a data problem to escalate, not a trading signal.
4. Market-order cap: market orders execute as IOC at mid ±1% (harness-fixed). If walk
   slippage approaches 1%, note that a market order will miss or partial-fill and recommend
   a limit or TWAP instruction to PM.
5. Funding (perps expected to be held one funding interval or more): current funding from the
   snapshot plus trailing `funding-history` → estimated funding cost over the horizon; keep
   the sign — funding can be a credit. Label the estimate with its assumptions.
6. Verdict: totalCostBps = fees + slippage + funding(horizon); `pass` iff ≤ tolerance. Write
   the cost block atomically to the sidecar and hand the verdict to the Execution Lead.

## Validation

- Every number traces to a recorded source command and timestamp; estimates are labeled.
- The book snapshot was within its `live` window at verdict time; its age is recorded.
- Only read commands ran; the instruction file itself was not modified.

## Risk & safety

- Read-only: no order, cancel, transfer, or funding command ever runs here.
- Never widen a tolerance to make an instruction pass — tolerance belongs to PM and
  `thresholds.json`, and loosening a hard limit needs human confirmation per the charter.
- A reject is data for Portfolio Management; this skill never edits what it prices.

## Failure & retry

- Explicit failure states: `insufficient-depth`, `impact-incoherent`, `fee-tier-unavailable`,
  `stale-data`, `provider-failure` — each recorded with the failing command; none defaults to
  pass.
- Provider failure: retry once (org-protocol); still failing → `blocked` with the reason and
  escalate. Never substitute assumed public fee rates for a failed `user-fees` read.
- Idempotent: read-only and safe to re-run; a re-run replaces the cost block with fresh math.

## Timeouts & rate limits

- 60 s bash timeout per read; `order-book` and the sweep write via `--out`. One book snapshot
  per verdict — no polling loops in this skill.

## Observability

- The cost block in `<uuid>.ack.json`: inputs, per-step math, sources with timestamps, and
  the verdict — joined to the execution chain by the instruction UUID.

## Escalation

- `reject` → Execution Lead → Portfolio Manager (resize, change order type, or drop).
- `blocked` (data) → Execution Lead; persistent provider failure → Engineering work order via
  `eng-triage`.

## Example

```bash
tribes-cli hyperliquid user-fees --address 0xWALLET
tribes-cli hyperliquid order-book --coin ETH --depth 20 \
  --out .tribes/org/snapshots/20260730T120500Z-book-eth.json
tribes-cli hyperliquid funding-history --coin ETH --start-time 1785150000000
```

Success: the sidecar gains `{"cost":{"feeBps":4.5,"slippageBps":3.2,"fundingBps":1.1,
"totalCostBps":8.8,"toleranceBps":15,"verdict":"pass"}}` with each input sourced and
timestamped — the instruction may proceed to `exec-margin-preflight`.

## Acceptance

- [ ] Fee math used the account's real tier from user-fees, never assumed public rates.
- [ ] Slippage came from walking a live book at the instruction's size, sanity-checked
      against impactPxs.
- [ ] Funding cost was estimated (with sign and horizon) for any perp held past funding.
- [ ] The verdict compared totalCostBps to the instruction's tolerance; failures were
      explicit, never defaulted.

## Related skills

- `exec-validate-instruction` — the gate that must pass before this preflight.
- `exec-margin-preflight` — the balance/exposure gate that runs alongside this one.
- `exec-place-order` — consumes the pass evidence this preflight records.
- `intel-funding-oi` — funding as market intelligence, not an execution cost input.
- `org-protocol` — envelope, sidecar shape, freshness classes, retry rules.
- `hyperliquid` — full flag reference for book and asset commands.
