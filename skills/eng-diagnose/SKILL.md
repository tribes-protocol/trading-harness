---
name: eng-diagnose
description: >-
  Engineering skill that turns a triaged failure into a confirmed root cause: reproduce the
  failing command with --out, isolate the seam by minimal one-axis variation probes (asset,
  chain, identifier form, provider path), read the service and CLI code to name the seam, and
  write a diagnosis note with hypothesis + evidence into the work order. Strictly READ-ONLY —
  no code, config, or env changes. Handles: reproduction, isolation matrices, env-precondition
  checks, and diagnosis notes. Call it on a work order routed by triage. NOT for: initial
  classification and routing (use eng-triage); implementing fixes (use eng-repair-integration);
  gating a finished change (use eng-verify-change).
allowed-tools: bash read
---

# Eng: Diagnose

## Identity

- Stable id: `eng-diagnose` — owner: Engineering. Invoked by: Reliability & Diagnostics, on a
  work order classified by `eng-triage`.

## Purpose

Turn a triaged failure class into a confirmed root cause with evidence: reproduce it, isolate
the failing seam by minimal variation, locate it in the code, and write a diagnosis note the
fixing engineer can act on without re-investigating. Strictly READ-ONLY: no code changes, no
config or env changes, no mutating commands, no rebuilds. Engineering has no trading authority.

## Inputs

Required: the work-order id/path with triage class and evidence (from `eng-triage`). Optional:
prior diagnosis notes on the same surface, org artifact refs, scratch `--out` files captured at
triage.

## Outputs

A diagnosis note appended to the work order, with facts and hypotheses separated:

- Reproduction (fact): exact command, `--out` artifact path, exit code, verbatim stderr.
- Isolation matrix (fact): each probe, the one axis varied, the outcome.
- Code seam (fact): file + symbol references located by reading the source.
- Root-cause hypothesis (hypothesis, labeled as such) with confidence stated in words.
- Recommended fix owner (recommendation): Integration Engineer or Software Engineer.

Explicit failure states: cannot-reproduce, blocked-needs-credentials, inconclusive. Any market
data pulled during probing records provider + command + source timestamp + retrieval timestamp
per `org-protocol`.

## Integration

- Reproduction: the exact failing `tribes-cli` command with `--out` to a scratch file — large
  outputs are never read inline.
- Isolation probes: `tribes-cli asset price|candles|search` and the provider-named groups,
  varying one axis per run; the response's `source` + `attempted[]` outcomes (`ok`,
  `key_unset`, `http_<status>`, `timeout`, `empty`, `parse_error`, `not_found`) are primary
  evidence.
- Code reading: `src/cli/*.ts` (Commander builders, argv zod validation) → `src/services/*.ts`
  (fetch + zod parse) → `src/types` (schemas) → `src/routing` (Router, Adapters, Capabilities,
  Chains) for fallback behavior.
- Repo checks, read-only: `bunx vitest run tests/services/<Service>.test.ts`,
  `bunx vitest run -t "<name>"`, `bun run lint`, `bun run typecheck` — to learn whether the
  recorded contract is green independent of the live failure.

## Preconditions

- A triaged work order with the exact failing command; no work order → run `eng-triage` first.
- `API_BEARER_TOKEN` set (else `tribes-cli login`); provider keys are injected by the control
  plane — an empty key is a finding (provider-key-unset), never something to work around.
- Know the binary model: `bun build --compile` bakes the environment at compile time
  (AGENTS.md), so editing `.env` does not change an already-compiled `tribes-cli`; a stale
  binary is a legitimate root cause — record `tribes-cli --version` with the repro.

## Procedure

1. Re-read the work order; restate expected vs observed behavior in one line each.
2. Reproduce: run the exact failing command with `--out /tmp/diag-<id>-repro.json`; record exit
   code and stderr verbatim. At most two runs — one clean pass out of two means intermittent;
   say so rather than looping.
3. Isolate: vary ONE axis per probe — different asset/identifier (a known-good `--id bitcoin`
   control), different chain, `asset` router vs the provider-named group, different timeframe
   or flag. Stop when the failing axis is identified; at most six probes total.
4. Locate the seam: from the CLI builder in `src/cli` follow the call into `src/services` and
   the zod schema in `src/types`; for wrong fallback behavior read `src/routing`. Quote file +
   symbol, not whole files.
5. Cross-check with tests: run the slice's `tests/services` file. Green test + live failure
   implicates the provider payload or env; red test implicates the code.
6. Append the diagnosis note to the work order (atomic write per `org-protocol`): repro,
   matrix, seam, hypothesis, fix owner, kept artifact paths.
7. Write the ack sidecar and hand the work order to the Engineering Lead for assignment.

## Validation

- The reproduction command and its `--out` artifact are recorded — a diagnosis without a
  captured repro is not done (unless the state is cannot-reproduce).
- Every probe changed exactly one variable and the matrix supports the hypothesis.
- The hypothesis names a specific seam (file/symbol/schema field) — "the provider is flaky" is
  a class, not a diagnosis.

## Risk & safety

- READ-ONLY: no edits under `src/`, no git mutations, no rebuilds, no config or env writes —
  all of that belongs to `eng-repair-integration`.
- Never run order-mutating or fund-moving commands to reproduce execution failures; use the
  order artifacts plus read commands (`list-open-orders`, `list-fills`, `order-status`).
- NEVER echo credentials or tokens into notes; `.tribes/privy-wallets.json` is NEVER read.
- No trading authority: diagnosis never promotes, stamps, or creates trading artifacts.

## Failure & retry

- cannot-reproduce (two clean runs): stamp the note, keep the original triage evidence, return
  to the requester asking for occurrence conditions; no probe storms.
- blocked-needs-credentials (`key_unset` on the required provider): stop; route through the
  control-plane path defined in `eng-triage`.
- inconclusive after the probe budget: record what was ruled out; escalate to the Engineering
  Lead for a paired session or a backlog entry.
- Auth failure mid-diagnosis: `tribes-cli login`, retry the command once, then continue or
  record the failure — never loop.

## Timeouts & rate limits

- News or analyst reproductions: explicit >=120 s bash timeout (prefer 300). A full
  `bunx vitest run` may take minutes — allow it.
- Probe budget: at most six provider calls per diagnosis; reuse triage's captured `--out`
  files before pulling fresh data.

## Observability

- Every repro/probe output lands as a file via `--out`, path recorded in the work order; the
  diagnosis note carries UTC timestamps and the probe matrix. The work order remains the single
  log; the ack sidecar records delivery.

## Escalation

- Confirmed code or adapter cause → Engineering Lead assigns `eng-repair-integration`
  (Integration Engineer) or the Software Engineer.
- Provider-side or control-plane cause → backlog + Head of Desk → human (`notify`).
- A money-path seam in the hypothesis (`src/services/HyperliquidService.ts`,
  `TransactionService.ts`, `WalletService.ts`, `SwapBridgeService.ts`): flag it in the note —
  the eventual fix pauses in needs-human-approval per the charter before adoption.

## Example

```bash
# WO 20260730T1015Z-sol-candles-parse: asset candles parse_error on solana
tribes-cli asset candles --address So11111111111111111111111111111111111111112 \
  --chain solana --timeframe 1h --out /tmp/diag-1.json          # repro
tribes-cli asset candles --address 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 \
  --chain ethereum --timeframe 1h --out /tmp/diag-2.json        # probe: chain axis
bunx vitest run tests/services/BirdeyeService.test.ts           # recorded contract green?
```

Result: note recording "solana fails parse_error, ethereum ok; recorded-fixture test green →
hypothesis: provider changed a field in the solana OHLCV payload; seam: the candle schema in
src/types consumed by src/services/BirdeyeService.ts; fix owner: Integration Engineer."

## Acceptance

- [ ] Repro captured with `--out`, exit code, verbatim stderr — or an explicit failure state.
- [ ] One-variable-per-probe matrix recorded; probe budget respected.
- [ ] Seam named at file/symbol level; hypothesis labeled hypothesis, fix owner named.
- [ ] Zero writes outside the work-order note and scratch files; zero mutating commands.

## Related skills

- `eng-triage` — produces the classified work order this consumes.
- `eng-repair-integration` — implements fixes from the diagnosis.
- `eng-verify-change` — verifies the eventual fix before return.
- `asset-data` — router surface and attempted[] trail used in isolation probes.
- `org-protocol` — work-order layout, atomic writes, acks.
- `notify` — human alerts for provider or control-plane causes.
