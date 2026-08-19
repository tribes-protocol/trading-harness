---
name: exec-validate-instruction
description: >-
  Execution Desk gate that decides whether one trade-instruction artifact is executable exactly
  as written — venue/dex/coin resolution against the shared all-dex snapshot, the AGENTS.md
  market-quality guardrail, instruction completeness (UUID, TTL, protective exits, size and
  price sanity), and authorization evidence — producing a pass|reject verdict with per-check
  results. Handles: the mandatory first check on every instruction the desk accepts, entries
  and reduce-only exits alike. Call it before any preflight or order command touches an
  instruction. NOT for: fee and slippage estimates (use exec-cost-preflight); balance and
  exposure gating (use exec-margin-preflight); placing the order (use exec-place-order);
  sizing or correcting instructions (use portfolio-rebalance).
allowed-tools: bash read
---

# Exec: Validate Instruction

## Identity

- Stable id: `exec-validate-instruction` — owner: Execution Desk. Invoked by: Trade Validator.

## Purpose

Answer one question with evidence: can this trade-instruction be executed exactly as written,
on the venue it names, right now? The gate resolves the asset against live venue data, applies
the AGENTS.md tradability guardrail, verifies the instruction is complete and authorized, and
returns pass or reject with a result per check. It never resizes, re-prices, or repairs an
instruction — corrections belong to Portfolio Management.

## Inputs

Required: a `trade-instruction` artifact `.tribes/org/instructions/<uuid>.json` carrying
venue, dex, coin (or spot pair), side, size (base units), order type with its prices,
protective-exit prices, leverage, margin mode, TTL (`expires_at`), and authorization evidence
in `checks[]` / `upstream[]`. Also: the shared all-dex snapshot
`.tribes/org/snapshots/<UTC>-all-dexes.json` when one exists within its `live` window.
Optional: the spot asset list for HL-spot instructions.

## Outputs

A validation block appended to the desk sidecar `.tribes/org/instructions/<uuid>.ack.json`
(org-protocol sidecar shape, extended with `checks[]`): `verdict: "ack" | "reject"`, one
result per check below, reject reasons, snapshot path and age. Facts: the quoted venue row
(referencePx, midPx, oraclePx, dayNtlVlm, dayBaseVlm, openInterest, impactPxs, szDecimals,
maxLeverage, margin flags), each with provider, command, source timestamp, and retrieval
timestamp per org-protocol. The verdict itself is a desk decision (action); no artifact state
is produced — promotion to submitted-order happens downstream.

## Integration

- `tribes-cli hyperliquid list-assets --all-dexes --out <snapshot>` — perp venue truth,
  reused per the org-protocol snapshot budget; a fresh sweep only when the shared one is stale.
- `tribes-cli hyperliquid list-assets --market spot` — HL-spot pairs.
- `tribes-cli hyperliquid list-exchanges` — only to resolve a dex label.
- Guardrail semantics: the AGENTS.md tradability guardrail. Envelope, sidecar shape, and
  freshness classes: `org-protocol`.

## Preconditions

- The instruction file exists, parses, and is in state `trade-instruction` (not terminal).
- The session-start recovery pass has run this session (org-protocol) — run it first if not.
- A usable snapshot: the shared all-dex file within its `live` window (≤ 5 min), else run ONE
  fresh sweep, write it to `snapshots/`, and let every later role reuse it.

## Procedure

1. Completeness: id equals the filename UUID; `expires_at` present and unexpired NOW; venue,
   dex, coin/pair, side, size, order type and its required prices all present; protective-exit
   prices present for every entry. A reduce-only exit may omit its own bracket but MUST carry
   the reduce-only marker and cite a portfolio-position id in `upstream[]`.
2. Authorization: the user's explicit confirmation for this instruction, or standing
   authorization plus a judge-approved thesis reference, recorded in the instruction. Missing
   → reject `no-authorization`; there is no other path.
3. Resolution: locate the exact coin on the named dex in the snapshot (spot: exact pair in
   the spot list). Read the hosting dex section in full — never conclude not-listed from a
   truncated or unread section. Absent after a full read → reject `not-listed`.
4. Market quality (AGENTS.md guardrail): live `referencePx`; `midPx`/`oraclePx` coherent
   where present; meaningful nonzero `dayNtlVlm`/`dayBaseVlm` and `openInterest`; `impactPxs`
   reasonable for the instruction size. Missing, zero, stale, or internally inconsistent →
   reject `quality-fail` (the asset is watchlist-only).
5. Delisting: `isDelisted` → reject entries and increases (`delisted`). A reduce-only exit on
   an existing position passes with a `delisted-reduce-only` note.
6. Venue constraints: leverage ≤ the asset's `maxLeverage`; margin mode honors
   `requiresIsolatedMargin` / `onlyIsolated` / `marginMode` exactly as returned; size
   conforms to `szDecimals` (round down, never up); the order — and every ladder leg or TWAP
   slice — meets the $10 minimum notional at `referencePx`; limit and trigger prices sit on
   the correct side of the reference price for the order type.
7. Verdict: write the block atomically (temp file, then rename). `ack` only when every check
   passed; otherwise `reject` naming each failed check. Hand the result to the Execution Lead.

## Validation

- Every check has a recorded result — no silent skips, no default-pass on missing data.
- The snapshot used was within its freshness window at verdict time, and its age is recorded.
- Only read commands ran; the instruction file itself was not modified.

## Risk & safety

- Pass or reject only: never edit, resize, re-price, or "improve" an instruction.
- Never validate against stale data; a stale snapshot forces a fresh sweep or a blocked
  result — stale data is never used for size or price sanity.
- The reduce-only exemption never applies to entries; entries always carry protective exits.
- No order-mutating command and no funding flow ever runs from this skill.

## Failure & retry

- Explicit reject reasons: `incomplete`, `ttl-expired`, `no-authorization`, `not-listed`,
  `delisted`, `quality-fail`, `venue-constraint:<detail>`.
- Sweep or spot-list failure: retry once (org-protocol); still failing → NO verdict — record
  `blocked: venue-data-unavailable` and escalate. An unvalidated instruction never proceeds.
- Idempotent: read-only and safe to re-run; a re-run replaces this skill's block in the
  sidecar with a fresh verdict against fresh data.

## Timeouts & rate limits

- `list-assets --all-dexes` returns thousands of lines: always `--out`, allow a 120 s bash
  timeout. Other reads: 60 s. No polling loops in this skill.
- One all-dex sweep per pass (org-protocol budget) — reuse the shared snapshot otherwise.

## Observability

- The sidecar `<uuid>.ack.json` is the audit record: verdict, per-check results, snapshot
  path and age, sources with timestamps. It joins the execution chain on the instruction UUID.

## Escalation

- `reject` → Execution Lead → Portfolio Manager with the per-check results (PM corrects and
  re-issues, or stamps the instruction `rejected`).
- `blocked: venue-data-unavailable` → Execution Lead; repeated provider failure becomes an
  Engineering work order via `eng-triage`. Trading on the affected asset pauses meanwhile.

## Example

```bash
date -u +%Y-%m-%dT%H:%M:%SZ   # retrieval stamp
tribes-cli hyperliquid list-assets --all-dexes \
  --out .tribes/org/snapshots/20260730T120000Z-all-dexes.json
# read the hosting dex section in full, run checks 1-6, then write the sidecar block
```

Success: `instructions/3f2a….ack.json` gains
`{"by":"exec-validator","verdict":"ack","checks":["completeness:pass","auth:standing+thesis",
"listed:xyz:AAPL","quality:pass","constraints:pass(szDecimals 2, lev 5<=10)"]}` with the
snapshot source stamped — the instruction may proceed to `exec-cost-preflight`.

## Acceptance

- [ ] The verdict rests on a full read of the hosting dex section in a live-window snapshot.
- [ ] Every check has a recorded result; a reject names each failed check.
- [ ] Authorization evidence was verified, not assumed.
- [ ] Nothing was mutated: no order command, no instruction edit, no default-pass.

## Related skills

- `exec-cost-preflight` — fee/slippage preflight that follows a pass verdict.
- `exec-margin-preflight` — balance/exposure gate that follows a pass verdict.
- `exec-place-order` — consumes the pass evidence this gate records.
- `portfolio-rebalance` — mints and corrects the instructions this gate judges.
- `org-protocol` — envelope, sidecar shape, freshness classes, snapshot budget.
- `trade-execution` — the playbook whose tradability step this gate mirrors.
- `hyperliquid` — full flag reference for the discovery commands.
