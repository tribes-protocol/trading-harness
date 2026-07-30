---
name: eng-verify-change
description: >-
  Engineering skill that gates any change before its work order is returned: bun run lint at
  zero warnings, bun run typecheck, the FULL bunx vitest run plus targeted -t runs, bun run
  format with the skills-contract checks for skill-file changes, read-only CLI smoke checks for
  touched commands, and the regression-test authorship check. Handles: the gate sequence, the
  work-order result format (what changed, how verified, residual risk), and the pass/fail
  verdict. Call it on every finished change set, before anything is returned to the requesting
  department. NOT for: classifying failures (use eng-triage); root-cause investigation (use
  eng-diagnose); authoring fixes or adapters (use eng-repair-integration).
allowed-tools: bash read
---

# Eng: Verify Change

## Identity

- Stable id: `eng-verify-change` — owner: Engineering. Invoked by: Software Engineer, and by
  every engineering role before any work order is returned.

## Purpose

Prove a change is safe to return: every repo gate green, touched commands smoke-checked
read-only, regression coverage present, and the work-order result written in the required
format. It verifies; it does not fix — failures bounce back to the author — and it has no
trading authority: verification never places, modifies, or cancels anything on a venue.

## Inputs

Required: the work-order id and its change set — files changed, whether skill files changed,
which CLI commands are touched, and the money-path flag. Optional: the regression-test names to
target, prior verify attempts on the same work order.

## Outputs

The work-order result section, with gate outcomes as facts and the verdict as a recommendation
to the Engineering Lead:

- What changed: file list with one line each.
- How verified: each gate's literal command and outcome (lint / typecheck / full vitest /
  targeted vitest / format / smoke).
- Residual risk: what is NOT covered — untested provider paths, live-only behavior, pending
  human approval.
- Verdict: pass (returnable) or fail (named gate, back to the author).

Explicit failure states: gate-failed, flaky-suite, smoke-blocked. Smoke reads that return
market data record provider + command + source timestamp + retrieval timestamp per
`org-protocol`.

## Integration

- `bun run lint` — eslint at `--max-warnings 0`: zero warnings tolerated.
- `bun run typecheck` — tsc --noEmit. Note: `bun run test` is only a typecheck alias, never
  the test suite.
- `bunx vitest run` — the FULL suite (skills contract, synced-skills drift guard, policy pins,
  pi settings, routing, services); targeted runs via
  `bunx vitest run tests/services/<X>.test.ts` and `bunx vitest run -t "<name>"`.
- `bun run format` — prettier writes; CI's format check covers ts/md/json including
  dot-directories.
- Read-only CLI smoke per touched command group (Procedure step 6).
- Gate ground truth: `.github/workflows/ci.yml` and `tests/skills/SkillsContract.test.ts`.

## Preconditions

- The change set is complete and saved; the author considers it done.
- Smoke checks on authed surfaces need `API_BEARER_TOKEN` (else `tribes-cli login` first).
- Money-path changes may be verified, but the result must restate that adoption stays paused
  in needs-human-approval.

## Procedure

1. `bun run lint` — any warning is gate-failed.
2. `bun run typecheck`.
3. `bunx vitest run` — the full suite, never only the touched files (contract tests catch
   cross-file drift a targeted run misses). Then run the named regression tests with `-t` and
   confirm vitest actually executed the new test file — tests are neither typechecked nor
   linted, so a test that never ran proves nothing.
4. Regression authorship check (bug fixes only): the change set includes a test pinning the
   bug, and the author has stated it fails on the pre-fix code. Missing regression test =
   gate-failed.
5. Skill-file changes: `bun run format`, then check the skills contract so a failure names the
   file rather than the test — frontmatter keys exactly name/description/allowed-tools;
   allowed-tools exactly `bash read`; H1 present; whole file <=300 lines; the forbidden-string
   pins clean; every referenced slug exists; the AGENTS.md routing row present outside the
   synced block.
6. Read-only CLI smoke for each touched command: one representative call, `--out` for large
   outputs, and inspect the parsed JSON shape — for example `tribes-cli asset price --id
bitcoin` or `tribes-cli hyperliquid list-assets --dex main --out /tmp/smoke-assets.json`.
   NEVER smoke with mutating commands (trade, cancel, transfer, deposit, withdraw,
   set-leverage, adjust-margin): mutation correctness is proven by the test suite and by the
   Execution Desk's own artifacts, never by a live probe.
7. Write the work-order result in the required format, set the verdict, and ack to the
   Engineering Lead. Re-running this skill on the same change set is safe and idempotent — it
   overwrites the result section with the fresh outcomes.

## Validation

- Every gate's literal command and outcome recorded — "tests pass" without the command is not
  a verification.
- The FULL suite ran, not just targeted files.
- Smoke calls were read-only, one per touched command, with source/latency anomalies noted.

## Risk & safety

- No mutating smoke checks, ever; no trading authority.
- Verification never edits the change — the author fixes; separation keeps the gate honest.
  `bun run format` is the one allowed write, and its diff is reported.
- A pass verdict on a money-path change does NOT authorize adoption: the human-approval pause
  survives verification, and the result restates it.
- NEVER capture credentials or tokens in the result; `.tribes/privy-wallets.json` is NEVER
  read.

## Failure & retry

- gate-failed: name the gate, quote the first error verbatim, return to the author
  (`eng-repair-integration`); never chip at the change from here.
- flaky-suite: rerun the failing test once; pass-on-rerun is recorded as flaky under residual
  risk, fail-twice is gate-failed.
- smoke-blocked (provider down or key unset): record the router trail as evidence; the code
  gates alone may justify a conditional pass with the smoke gap named in residual risk.

## Timeouts & rate limits

- The full vitest suite may take minutes — allow it. Smoke of news or analyst commands:
  explicit >=120 s bash timeout (prefer 300).
- Smoke is one call per touched command; no polling, no loops.

## Observability

- The work-order result section is the audit record: commands, outcomes, verdict, residual
  risk, UTC timestamps; smoke `--out` files kept with paths recorded; ack sidecar per
  `org-protocol`.

## Escalation

- pass → Engineering Lead → requesting department, with the result and ack.
- pass on a money-path change → Engineering Lead → Head of Desk → human approval before
  adoption (`notify`).
- fail → back to the authoring engineer with the named gate; two failed cycles on one work
  order → re-enter `eng-diagnose` with the accumulated evidence.

## Example

```bash
bun run lint && bun run typecheck
bunx vitest run
bunx vitest run -t "parses solana ohlcv drift payload"
bun run format
tribes-cli asset candles --address So11111111111111111111111111111111111111112 \
  --chain solana --timeframe 1h --out /tmp/smoke-sol.json
```

Result: work order updated — changed: the candle schema in src/types,
src/services/BirdeyeService.ts, tests/services/BirdeyeService.test.ts; verified: lint 0
warnings, typecheck clean, full vitest green including the regression test, format clean,
smoke returns candles with source birdeye; residual risk: other BirdEye chains unprobed.
Verdict: pass.

## Acceptance

- [ ] lint (zero warnings), typecheck, FULL vitest, and format all green, recorded with their
      literal commands.
- [ ] Regression test exists, actually ran, and pins the fixed bug.
- [ ] Skill-file changes checked against the CI contract; routing row present.
- [ ] Smoke was read-only, one call per touched command, anomalies noted.
- [ ] Result written as what-changed / how-verified / residual-risk; money-path pause
      restated; verdict set.

## Related skills

- `eng-repair-integration` — authors the change sets verified here.
- `eng-diagnose` — re-entry point when verification disproves the fix.
- `eng-triage` — classifies any new failure surfaced during verification.
- `asset-data` — typical read-only smoke surface with a self-explaining provider trail.
- `hyperliquid` — read-only venue smoke commands (list and order-book reads only).
- `org-protocol` — work-order result delivery, acks, atomic writes.
