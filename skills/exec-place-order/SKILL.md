---
name: exec-place-order
description: >-
  Execution Desk skill that turns one validated, preflighted trade-instruction artifact into
  exactly one atomic Hyperliquid order — intent journal first, cloid derived from the
  instruction UUID, bracket exits attached, then mandatory venue verification. Handles: perp and
  Hyperliquid-spot submission for org instructions, duplicate-execution prevention, and the
  unknown-outcome rule. Call it only with a trade-instruction that passed
  exec-validate-instruction, exec-cost-preflight, and exec-margin-preflight. NOT for: deciding
  or sizing trades (use portfolio-rebalance); user-conversation trades outside the org (use
  trade-execution); on-chain swaps (use exec-onchain-swap); cancels and fill tracking after
  submission (use exec-order-lifecycle).
allowed-tools: bash read
---

# Exec: Place Order

## Identity

- Stable id: `exec-place-order` — owner: Execution Desk. Invoked by: Execution Runner.

## Purpose

Submit exactly one atomic order for a trade-instruction, such that a crash, timeout, or retry
at any point can never produce a duplicate or an untracked order. This skill wraps the
`trade-execution` playbook (which stays the single order path) with the org envelope: intent
journal before submission, client order id derived from the instruction UUID, and explicit
terminal states. It never decides, sizes, or re-prices a trade.

## Inputs

Required: a `trade-instruction` artifact (`.tribes/org/instructions/<uuid>.json`) with
`checks[]` proving `exec-validate-instruction`, `exec-cost-preflight`, and
`exec-margin-preflight` passed this session; the wallet address and Privy wallet id from
`tribes-cli wallet list`. The instruction carries: dex, coin (or spot pair), side, size (base
units), order type (market | limit + price | scale | twap), protective exit prices, leverage,
margin mode, TTL.

## Outputs

The order artifact `.tribes/org/orders/<uuid>.json` (same UUID as the instruction) in state
`submitted-order`, holding: the exact command intent, cloid (or twapId for TWAPs), venue
response (oid, status), submission timestamp, and the instruction's protective-exit terms — or
a terminal state `failed` (venue rejection, with the error) / `unknown` (timeout or ambiguous
response). Never a fill claim: fills belong to `exec-order-lifecycle`.

## Integration

- `tribes-cli hyperliquid trade-perp --coin --side (long|short) --amount --dex --from
--wallet-id --cloid` plus `--type limit --price`/`--tp-px`/`--sl-px`/`--reduce-only` as
  instructed (atomic OCO bracket).
- `tribes-cli hyperliquid trade-spot --pair --side --amount --from --wallet-id --cloid`.
- `tribes-cli hyperliquid scale-perp` / `twap-perp` for ladder/time-slice instructions (flag
  details in the `hyperliquid` skill). Neither accepts a cloid: capture every ladder leg oid
  (from the response and `list-open-orders`) or the TWAP twapId into the order artifact
  immediately — that journal is their only idempotency key.
- `tribes-cli hyperliquid order-status --address --cloid` + `list-fills` for the unknown path.
- Sequencing, sizing decimals, and min-notional rules: the `trade-execution` playbook.
- Envelope, cloid derivation, serialization: `org-protocol`.

## Preconditions

- Authorization: the user's explicit confirmation for this instruction, OR standing
  authorization with a judge-approved thesis behind the strategy — recorded in the
  instruction's `checks[]`. No authorization, no order.
- Instruction TTL unexpired NOW (re-check immediately before submission, not just at
  validation).
- No in-flight instruction on the same (dex, coin) — per-asset serialization per
  `org-protocol`.
- No existing `orders/<uuid>.json` for this instruction (see duplicate guard below).
- Preflight data freshness `live` per `org-protocol` freshness classes.

## Procedure

1. Duplicate guard: if `orders/<uuid>.json` exists, STOP — this instruction was already acted
   on. Resolve its actual state via `exec-order-lifecycle`; never submit again from here.
2. Derive the cloid from the instruction UUID (strip dashes, prefix 0x — `org-protocol`).
3. Write the intent journal: create `orders/<uuid>.json` (atomic write) in state
   `submitting`, containing the full command intent and cloid, BEFORE running any command.
4. Submit ONE atomic command: bracket entries via a single trade-perp with tp/sl flags; ladder
   via one scale-perp; time-slice via one twap-perp. NEVER split a bracket into separate
   orders; NEVER submit more than one command per instruction.
5. On a clean venue response: update the artifact to `submitted-order` with oid/status (TWAP:
   twapId) and hand the UUID to `exec-order-lifecycle`.
6. On explicit venue rejection: stamp `failed` with the venue error; return the artifact to the
   Execution Lead → Portfolio Manager.
7. On timeout or ambiguous response: stamp `unknown`. Do NOT retry. Resolution belongs to
   `exec-order-lifecycle`: only order-status/list-fills evidence may move the artifact out of
   `unknown`.

## Validation

- The submitted command's coin, dex, side, size, and prices match the instruction byte-for-byte
  against the intent journal.
- The venue response echoes the cloid (or returned a twapId) and it is recorded.
- Exactly one submission command appears in the artifact history.

## Risk & safety

- Reduce-only instructions MUST carry the reduce-only flag; protective exits are exchange-side
  (bracket legs), not promises.
- Honor venue constraints from validation: max leverage, isolated-margin requirements, min
  notional, szDecimals — never round size upward.
- A margin rejection is `failed` with reason insufficient-margin → freeze and return to PM.
  NEVER attempt deposits, transfers, or any funding flow from this skill.
- NEVER modify, cancel, or net other orders or positions from this skill.

## Failure & retry

- There are NO in-skill retries of the submission command. Auth errors: `tribes-cli login`
  once, then — because the original outcome is unknown — follow the `unknown` path, not a
  resubmit.
- A resubmission is legal only after `exec-order-lifecycle` proves the prior attempt did not
  execute (no order for the cloid, no fill in list-fills) AND stamps the artifact `failed`;
  the new attempt needs a fresh instruction from Portfolio Management.

## Timeouts & rate limits

- Submission commands: 60 s bash timeout. Anything slower is `unknown`, not an error to retry.
- This skill makes no polling loops; budget checks live in `exec-order-lifecycle`.

## Observability

- `orders/<uuid>.json` is the audit record: intent, cloid, venue response, timestamps, state
  transitions. The instruction, order, fill, and position artifacts all share the UUID.

## Escalation

- `failed` → Execution Lead → Portfolio Manager (with venue error verbatim).
- `unknown` unresolved after lifecycle checks → Execution Lead freezes the (dex, coin) and the
  Head of Desk notifies the human (`notify`).

## Example

```bash
# instruction 3f2a…: long 0.5 ETH perp on main, market, tp 2600, sl 2350
tribes-cli hyperliquid trade-perp --coin ETH --side long --amount 0.5 \
  --from 0xWALLET --wallet-id wid_123 --cloid 0x3f2a4c6e8b1d4f209a7c5e3b1d9f8a60 \
  --tp-px 2600 --sl-px 2350
```

Success: `orders/3f2a….json` moves `submitting → submitted-order` with the venue oid, cloid
echoed, and bracket legs resting exchange-side; lifecycle takes over confirmation.

## Acceptance

- [ ] Intent journal existed before the venue saw the order.
- [ ] Exactly one atomic command; cloid = instruction UUID transform; brackets attached.
- [ ] Outcome stamped as submitted-order, failed, or unknown — never assumed filled.
- [ ] No funding, no second command, no retry without lifecycle proof.

## Related skills

- `trade-execution` — the underlying single order-placement playbook.
- `exec-validate-instruction` — instruction gate that must precede this skill.
- `exec-cost-preflight` — fees/slippage estimate consumed here.
- `exec-margin-preflight` — balance/exposure gate consumed here.
- `exec-order-lifecycle` — confirmation, cancels, unknown-state resolution.
- `exec-onchain-swap` — the desk's non-Hyperliquid execution path.
- `org-protocol` — envelope, cloid derivation, serialization, recovery.
- `hyperliquid` — full flag reference for order commands.
