---
name: eng-triage
description: >-
  Engineering skill that classifies one reported failure into a single taxonomy class — auth,
  provider-key-unset, rate-limit, provider-5xx/timeout, schema/parse drift, venue rejection,
  harness bug, or data contradiction — captures defensible evidence, and routes it as a work
  order under .tribes/org/workorders/. Handles: evidence normalization, the asset router's
  per-provider failure trail as a one-probe classifier, routing to the right role or skill, and
  work-order creation. Call it whenever any department reports a failing command, artifact, or
  integration. NOT for: reproduction and root-cause work (use eng-diagnose); writing fixes (use
  eng-repair-integration); pre-return verification (use eng-verify-change).
allowed-tools: bash read
---

# Eng: Triage

## Identity

- Stable id: `eng-triage` — owner: Engineering. Invoked by: Engineering Lead (routing incoming
  work orders) and Reliability & Diagnostics (running the classification).

## Purpose

Classify one reported failure into exactly one taxonomy class, capture the evidence that makes
the classification defensible, and route it as a work order to the right role or skill. It
never fixes anything, never re-runs mutating commands, and never touches trading artifacts
except to read them as evidence. Engineering has no trading authority: a work order may never
place, modify, or cancel anything on a venue.

## Inputs

Required from the requesting department: the exact command line (string, verbatim), stderr and
stdout (verbatim), exit code (integer), and refs of any org artifacts involved (ids/paths).
Optional: the `attempted[]` trail from an `asset` command response, prior work-order ids on the
same surface, requester-stated urgency.

## Outputs

A work order `.tribes/org/workorders/<UTC>-<slug>.md` containing, clearly separated: facts
(command, exit code, verbatim error, artifact refs, provider trail), the assigned class
(labeled hypothesis until eng-diagnose confirms it), the route (a recommendation naming a role
or skill), and urgency. The routing action taken (assignment + ack request, or a
not-an-engineering-issue return) is recorded in the same file. No state-machine artifact is
produced — work orders are not trading artifacts. Any market data pulled as evidence records
provider + command + source timestamp + retrieval timestamp per `org-protocol`.

## Integration

- Evidence re-capture, read-only and at most once: re-run the failing command with `--out` to a
  scratch file where the command supports it.
- The `tribes-cli asset` router trail: every response carries `source` plus `attempted[]` with
  per-provider outcomes `ok`, `key_unset`, `http_<status>`, `timeout`, `empty`, `parse_error`,
  `not_found` — one probe distinguishes key, quota, provider, and schema problems.
- Work-order layout, atomic writes, ack sidecars: `org-protocol`.

## Preconditions

- A concrete symptom: at minimum one command or artifact that misbehaved. "Data looks off" with
  no command goes back to the requester for specifics.
- `API_BEARER_TOKEN` present; if unset or expired, run `tribes-cli login` first so auth noise
  does not masquerade as a provider failure.
- `.tribes/org/workorders/` exists (`mkdir -p`).

## Procedure

1. Normalize the evidence: exact command, exit code, stderr verbatim, artifact refs, and a
   `date -u +%Y-%m-%dT%H:%M:%SZ` triage timestamp.
2. Idempotency check: if an open work order already covers this symptom + command, append the
   new occurrence there — never open a duplicate.
3. If evidence is incomplete and the command is read-only, re-run it ONCE with `--out`. Never
   re-run order-mutating commands (trade, cancel, transfer, deposit, withdraw, set-leverage,
   adjust-margin): their outcome evidence comes from Execution Desk artifacts only.
4. If the failing surface has an `asset` router equivalent, run that command once and read
   `attempted[]` — it separates `key_unset` vs `http_429` vs 5xx vs `parse_error` per provider
   in a single call.
5. Classify into exactly one class from the table.
6. Write the work order (atomic write) with facts, class, route, urgency; assign per the table
   and require an ack sidecar from the assignee.

| Class                  | Signature                                             | Route                                                                                                                         |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| auth                   | unauthorized/expired-token errors from the CLI itself | `tribes-cli login`, retry once (AGENTS.md); still failing → work order to Software Engineer, urgent                           |
| provider-key-unset     | `key_unset` in the trail; provider key env empty      | Head of Desk → human (`notify`) — key injection is control-plane; backlog entry                                               |
| rate-limit             | `http_429`; venue/provider budget exhausted           | Not a defect: requester backs off and reuses snapshots per `org-protocol`; recurring → backlog (budget tuning)                |
| provider-5xx / timeout | `http_5xx`, `timeout`, `http_408`                     | Transient: one retry per the harness rule; persistent → `eng-diagnose`                                                        |
| schema / parse drift   | `parse_error`; zod messages naming fields             | `eng-diagnose`, then `eng-repair-integration`                                                                                 |
| venue rejection        | order rejected with a venue reason                    | Not engineering: Execution Lead / Portfolio Manager; only a rejection the harness should have pre-caught opens `eng-diagnose` |
| harness bug            | stack trace, crash, wrong flag handling, wrong math   | `eng-diagnose` → Software Engineer                                                                                            |
| data contradiction     | providers disagree beyond tolerance                   | `validate-contradictions` (Data Validation) first; systematic one-provider wrongness → `eng-diagnose`                         |

## Validation

- Exactly one class assigned; error strings quoted verbatim, never paraphrased.
- The route names a role or skill from the table; urgency and requester recorded.
- `not_found` on `--id`/`--ticker`/`--perp` was treated as a final identifier error (the
  provider owns that identifier space), never as an outage.

## Risk & safety

- No trading authority: never place, modify, cancel, or promote/stamp trading artifacts.
- Evidence re-runs are read-only and bounded to one; probing is not diagnosis.
- NEVER quote credentials or tokens in a work order; `.tribes/privy-wallets.json` is NEVER read.

## Failure & retry

- cannot-classify (evidence insufficient after one re-run): work order stamped needs-evidence
  and returned to the requester with the exact missing items — never guessed.
- Classification later disproved by eng-diagnose: the diagnosis updates the SAME work order;
  one work order per symptom + command is the idempotency rule.

## Timeouts & rate limits

- Evidence re-runs of news or analyst commands: explicit >=120 s bash timeout (prefer 300).
- Triage costs at most two provider calls (one re-run + one router probe); no loops.

## Observability

- The work order is the log: evidence, class, route, timestamps, occurrence appends, and the
  assignee's ack sidecar per `org-protocol`. Scratch `--out` files are kept and path-referenced.

## Escalation

- Routing per the table. Anything needing spend or a control-plane change (new provider key,
  billing entry) → `.tribes/org/workorders/backlog.md` + Head of Desk notifies the human
  (`notify`).
- Urgent classes (auth broken desk-wide, a money-path command failing) → Engineering Lead
  immediately; the requesting department pauses use of the affected surface meanwhile.

## Example

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
tribes-cli asset price --id bitcoin --out /tmp/triage-probe.json   # read attempted[]
# trail: birdeye key_unset; coingecko ok → class provider-key-unset (BirdEye surface)
mkdir -p .tribes/org/workorders
# write .tribes/org/workorders/20260730T101500Z-birdeye-key-unset.md atomically
```

Result: one work order holding the verbatim trail, class provider-key-unset, route "Head of
Desk → human (control plane)", urgency normal, plus a backlog entry for the missing key.

## Acceptance

- [ ] One class, verbatim evidence, named route, urgency and requester recorded.
- [ ] At most one read-only re-run + one router probe; no mutating command touched.
- [ ] Duplicate check ran before writing; work order written atomically; ack requested.
- [ ] Control-plane gaps went to backlog + human, not to a code fix.

## Related skills

- `eng-diagnose` — reproduction and root-cause work for routed classes.
- `eng-repair-integration` — the fix path for adapter and schema classes.
- `eng-verify-change` — gates any resulting change before return.
- `asset-data` — the router whose attempted[] trail is the classification probe.
- `validate-contradictions` — owner of data-disagreement checks.
- `org-protocol` — work-order layout, acks, atomic writes.
- `notify` — human alerts for control-plane classes.
