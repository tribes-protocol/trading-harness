---
name: portfolio-reconcile
description: >-
  Portfolio Management skill that pulls full venue truth — balances, positions, open orders,
  fills since the last pass, the venue ledger, and off-venue wallet balances — and reconciles it
  against the org's expected book under .tribes/org/positions/. Handles: expected-vs-venue
  diffs, confirmed-fill reconciliation, adoption of user-directed external positions, the
  open-position review duty (reads only), and discrepancy escalation. Call it at session
  start/end, after every confirmed fill, and before instructions are minted. NOT for: exposure,
  concentration, or drawdown math (use portfolio-exposure); threshold evaluation (use
  portfolio-triggers); minting instructions (use portfolio-rebalance); mutating stops, closes,
  or orders (use exec-place-order).
allowed-tools: bash read
---

# Portfolio: Reconcile

## Identity

- Stable id: `portfolio-reconcile` — owner: Portfolio Management. Invoked by: Position Monitor.

## Purpose

Establish one trustworthy picture of the book: what the venue says we hold versus what the org
believes we hold, with every difference explained, adopted, or escalated — never silently
absorbed. This skill also carries the department's "monitor open positions" duty: the REVIEW
half of `position-management` (its table and flags), reads only. It never mutates orders,
positions, or funds, and never mints instructions.

## Inputs

Required: the account EVM address from `tribes-cli wallet list`; the expected book
(`.tribes/org/positions/*.json`); `fills/` artifacts not yet reconciled. Optional: the previous
reconcile snapshot (carries the fills cursor `cursor_ms`); a fresh all-dex sweep snapshot within
its `live` window (reuse it instead of re-sweeping — `org-protocol` budget).

## Outputs

A reconcile report at `.tribes/org/snapshots/<UTC>-reconcile.json`, separating:

- Facts: venue positions/orders/balances, fills, ledger entries, off-venue balances — each with
  provider, command, `source_ts`, `retrieved_at`, freshness class per `org-protocol`.
- Classifications: every diff stamped exactly one of `match`, `registration-ready` (confirmed
  fill awaiting state-8 registration), `external-adopt` (user-directed), `discrepancy`.
- Recommendations: the position-review table with flags (NO-STOP, THIN-LIQ-BUFFER,
  LEV/EXPOSURE-CONCERN, MARKET-QUALITY-CONCERN) and protective-instruction requests.
- Actions: escalations actually raised, and the advanced `cursor_ms`.

No artifact state is promoted here: `portfolio-position` (state 8) registration is the
Portfolio Manager's act, taken on this report's evidence.

## Integration

- `tribes-cli wallet list` — account address (and nothing else from the wallet snapshot).
- `tribes-cli hyperliquid list-positions --address <addr> --all-dexes --out <file>`
- `tribes-cli hyperliquid list-open-orders --address <addr> --all-dexes --out <file>`
- `tribes-cli hyperliquid list-balances --address <addr>` (repeat with `--dex <dex>` for each
  builder dex holding margin — this command has no all-dex sweep flag).
- `tribes-cli hyperliquid list-fills --address <addr> --start-time <cursor_ms> --out <file>`
- `tribes-cli hyperliquid ledger --address <addr> --out <file>` — venue deposit/withdraw/
  transfer entries for funding reconciliation.
- `tribes-cli wallet assets --wallet-addresses <addr...> --out <file>` — off-venue balances.
- Review table and flags: `position-management` procedure 1 (reads only — its mutating
  procedures run only at the Execution Desk, on Portfolio Manager instructions).
- Envelope, freshness classes, snapshot reuse, recovery ordering: `org-protocol`.

## Preconditions

- `tribes-cli login` done (auth errors on `wallet list` mean it is not).
- Order-state resolution ran first: within the session-start recovery pass,
  `exec-order-lifecycle` resolves unknown/submitted orders BEFORE this diff, so fills are
  stamped and orphan cancels are done when the comparison runs.
- Venue pulls are from this pass, or within their `live` freshness window.

## Procedure

1. Resolve the account address; stamp `retrieved_at` on every pull (`date -u`).
2. Pull venue truth: positions and open orders (all dexes), balances per dex with margin.
   Reuse the pass's snapshots within their `live` window rather than re-sweeping.
3. Pull fills since `cursor_ms` from the latest reconcile snapshot (first run: omit
   `--start-time` — up to the 2000 most recent fills).
4. Pull the venue ledger and off-venue wallet assets.
5. Position diff — for every `positions/` entry against venue rows: dex, coin, side, size
   match → `match`; size drift fully explained by newly reconciled fills → `match` with note;
   anything unexplained → `discrepancy`.
6. Fill diff — fills matching a `fills/<uuid>.json` artifact not yet in the registry →
   `registration-ready` (cite the shared UUID). Fills matching no org artifact are external
   activity: fold into step 7's adoption or step 5's discrepancy reasoning.
7. Venue positions with no registry entry → `external-adopt`: per the charter these are
   user-directed positions, adopted at this reconcile — not discrepancies.
8. Ledger reconciliation — every deposit/withdraw/transfer entry maps to a known,
   human-confirmed funding event; any unexplained entry is money unaccounted → escalate.
9. Bracket check — every position has venue-resident protective exits armed (reduce-only
   trigger orders in open orders). Missing protection → a protective-instruction request to
   the Portfolio Manager; NEVER place it from here.
10. Review pass — fill the `position-management` review table per position; apply the flags.
11. Write the report atomically (`org-protocol` temp-then-rename); advance `cursor_ms` to the
    newest fill time ONLY if every step completed.

## Validation

- Every venue row (position, fill, ledger entry) and every expected entry is classified
  exactly once; nothing is silently dropped or double-counted.
- Every fact carries provider + command + `source_ts` + `retrieved_at`.
- The report contains zero mutations and zero minted instructions.
- Cursor advanced only on a complete pass.

## Risk & safety

- Reads only. Never trade, cancel, adjust margin, or transfer — mutations are Execution Desk
  work on Portfolio Manager instructions.
- A `discrepancy` on an asset halts new instructions for that asset until cleared.
- Adopted user positions are respected, not "fixed": never request closes for them without the
  user's direction.
- No credentials or wallet ids in the report.

## Failure & retry

- Auth failure: `tribes-cli login`, retry the pull once, else stop and report.
- A pull failing twice: mark that section `unverified` in the report. An `unverified` section
  blocks `registration-ready` promotion and instruction minting for its assets; raise an
  Engineering work order (`eng-triage`) if the failure is technical.
- Never advance the fills cursor on a partial pass — re-pulling the same fills window is
  idempotent, missing fills is not recoverable.

## Timeouts & rate limits

- 60 s bash timeout per read; `--out` on fills, ledger, positions, and open-orders pulls
  (large outputs).
- One all-dex sweep per pass; reuse snapshots within freshness windows (`org-protocol`).

## Observability

- The reconcile snapshot IS the record: pulls, classifications, cursor, escalations, source
  stamps. `registration-ready` items cite the fill/instruction UUID so the execution chain
  joins on one key. Snapshots retain the last 5 per source.

## Escalation

- `discrepancy` → Portfolio Manager: halt the asset. Money unaccounted (ledger or balance
  unexplained) → Head of Desk notifies the human (`notify`) immediately.
- Missing brackets → protective-instruction request to the Portfolio Manager
  (`portfolio-rebalance` mints; the Execution Desk places).
- Technical provider failures → Engineering work order (`eng-triage`).

## Example

```bash
tribes-cli hyperliquid list-positions --address 0xWALLET --all-dexes \
  --out .tribes/org/snapshots/20260730T090000Z-positions.json
tribes-cli hyperliquid list-fills --address 0xWALLET --start-time 1753830000000 \
  --out .tribes/org/snapshots/20260730T090000Z-fills.json
tribes-cli hyperliquid ledger --address 0xWALLET \
  --out .tribes/org/snapshots/20260730T090000Z-ledger.json
```

Success: report shows 3 positions `match`, 1 fill `registration-ready` (uuid cited), 1 venue
position `external-adopt` as user-directed, ledger fully explained, brackets armed on all but
one position (protective request raised), cursor advanced.

## Acceptance

- [ ] Every venue row and every expected entry classified exactly once.
- [ ] Ledger entries all explained or escalated; unexplained money → human notified.
- [ ] Bracket arming verified per position; missing protection requested, never placed.
- [ ] Reads only; sources stamped throughout; cursor advanced only on a complete pass.

## Related skills

- `org-protocol` — envelope, freshness, snapshot reuse, recovery passes.
- `position-management` — the review table and flags this skill reuses (reads only).
- `portfolio-exposure` — risk math computed on this reconciled book.
- `portfolio-triggers` — threshold evaluation on this reconciled book.
- `portfolio-rebalance` — the instruction mint fed by this report.
- `exec-order-lifecycle` — resolves order states before this diff runs.
- `hyperliquid` — full reference for the read commands.
- `notify` — human alert when money is unaccounted for.
