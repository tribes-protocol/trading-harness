---
name: validate-signal-score
description: >-
  Data Validation skill that owns the observation to validated-signal promotion: assigns
  confidence from a fixed rubric (source count, independence, freshness, cross-check outcome,
  contradiction penalty), enforces the >=2-independent-signals evidence gate, derives
  expires_at, and records REJECTED with reasons as a first-class outcome. Handles: writing
  validated-signal artifacts, rejection stamping, observation acks, and the single-source
  confidence cap. Call it as the last validation step, with cross-check, freshness, and
  contradiction results in hand. NOT for: pulling second-source data (use
  validate-cross-check); timestamp normalization (use validate-freshness); the contradiction
  scan itself (use validate-contradictions).
allowed-tools: bash read
---

# Validate: Signal Score

## Identity

- Stable id: `validate-signal-score` — owner: Market Intelligence / Data Validation. Invoked
  by: the Data Validation role (`.agents/intel-validation.md`). The org's ONLY producer of
  `validated-signal` artifacts — including for its own department's observations.

## Purpose

Turn a cross-checked, freshness-verified, contradiction-scanned evidence set into exactly one
`validated-signal` artifact with a defensible confidence and expiry — or into a recorded
REJECTED outcome with reasons. Enforces the ≥2-independent-signals evidence gate (the
`strategize` hard rule). Deterministic by design: no market reads happen here, so the same
inputs always score the same. It never gathers data and never proposes trades or strategies.

## Inputs

Required: the evidence set (observation ids + artifacts under `.tribes/org/observations/`);
the cross-check block (`validate-cross-check`); the freshness report (`validate-freshness`);
the contradiction report (`validate-contradictions`); the claim — one falsifiable statement
the signal asserts, labeled as signal, never as fact. Optional: independent-source counts for
news-derived evidence from `intel-news-triage` (its counting is authoritative for news);
claim horizon (event time) when the claim is catalyst-dated.

## Outputs

- Promotion: `.tribes/org/signals/<UTC>-<slug>.json` in state `validated-signal`, envelope
  per `org-protocol`: `upstream` = observation ids; `sources[]` = union of evidence sources,
  each with provider + command + `source_ts` + `retrieved_at`; `checks[]` recording every
  gate item with its measured value; `expires_at`; payload holding the claim (signal), the
  evidence values (facts), `confidence` (0–1 + band), `single_source`, and contradiction
  annotations. Plus an ack sidecar `<obs-id>.ack.json` (verdict `ack`) per consumed
  observation.
- Rejection: a signal file written in `signals/` with state `rejected` and
  `payload.reasons[]` — a recorded outcome, never a silent drop (rejections stay in place,
  stamped, until the recovery sweep archives them) — plus reject acks naming the reason on
  the failing observations.
- Labeling: evidence values are facts; the claim + confidence is the signal; this skill
  makes no recommendation and its only actions are the atomic file writes above.
- Explicit outcomes: `promoted`, `rejected`, `duplicate-signal`, `incomplete-validation`.

## Integration

- `date -u +%Y-%m-%dT%H:%M:%SZ` for stamps; `mkdir -p .tribes/org/signals`; atomic writes
  (`<file>.tmp` then `mv`) and ack sidecars exactly per `org-protocol`.
- Id: `<UTC compact>-<slug>` (e.g. `20260730T104500Z-eth-funding-dislocation`).
- No provider commands — every datum arrives through the three upstream validate skills.

## Preconditions

- All three prerequisite reports exist for THIS evidence set and were produced this session.
- Cross-check verdict is not an unconfirmed `contradiction` (those must have gone through
  `validate-contradictions` first).
- `.tribes/org/signals/` exists (create on first use); session-start recovery has run.

## Procedure

1. Duplicate guard: scan `signals/` for an unexpired signal whose `upstream` covers this
   evidence set. If found, STOP with `duplicate-signal` and reference it — never mint twice.
2. Verify the three reports are present; a missing one is `incomplete-validation` — run the
   missing skill, do not improvise its result.
3. Count independent evidence: independence requires a different provider AND a different
   collection method (a news item + an on-chain flow = 2; two headlines from one wire = 1,
   per `intel-news-triage` counting). Gate: ≥ 2 independent, else reject
   `insufficient-evidence`.
4. Apply the report gates: any load-bearing source `stale` → reject `stale-evidence`;
   cross-check `contradiction` or `single-source-incoherent` → reject `cross-check-failed`;
   contradiction verdict `blocking` → reject `blocking-contradiction`.
5. Score confidence per the rubric below; apply the single-source cap; `confidence < 0.45` →
   reject `low-confidence`.
6. Derive `expires_at` = min over load-bearing sources of (`normalized_ts` + its freshness
   window), further capped by the claim horizon, and never later than `created_at` + 24 h.
   If the result is ≤ now → reject `stale-evidence`.
7. Write the artifact atomically with full `checks[]`; write `ack` sidecars on every
   consumed observation.
8. On any gate failure: write the `rejected` artifact with ALL failed reasons (not just the
   first), and reject acks on the failing observations. Rejection is a normal outcome.

### Confidence rubric

| Component                                      | Contribution                    |
| ---------------------------------------------- | ------------------------------- |
| Base (evidence gate met)                       | 0.30                            |
| Each independent source beyond the 2nd         | +0.10 (cap +0.20)               |
| Cross-check `match`                            | +0.20                           |
| Cross-check `investigate`                      | +0.00                           |
| Single-source coherent (`single_source: true`) | +0.10, and TOTAL capped at 0.60 |
| All load-bearing sources fresh                 | +0.10                           |
| Each contradiction `annotate` finding          | −0.15                           |

Bands: 0.45–0.65 `medium`, > 0.65 `high`; below 0.45 → reject. The single-source cap means a
single-source signal can never score `high` — the flag and cap are mandatory, per the
charter.

## Validation

- `checks[]` lists every gate item with its measured value (e.g. `evidence:3-independent`,
  `cross-check:match(0.1%<=1.0%)`, `freshness:all-fresh`, `contradictions:clean`,
  `confidence:0.60(medium)`).
- `expires_at` is in the future and its derivation is recoverable from the sources.
- Exactly one writer: this skill wrote the signal file and only ack sidecars elsewhere.

## Risk & safety

- No other role or skill may write `signals/`; entries never skip this gate (only the
  protective-exit exception in `org-protocol` bypasses states 1–4, and that path carries no
  signal).
- Hypotheses in observations are not evidence — only stamped facts count toward the gate.
- Never loosen a window, threshold, or the rubric to make a signal pass; the rubric is fixed
  and changes to it are a charter change, not a run-time choice.
- NEVER place credentials or wallet ids in any artifact (`org-protocol` envelope rules).

## Failure & retry

- Atomic write failure: retry the tmp+`mv` once, then escalate to the Intelligence Lead with
  the filesystem error. No provider calls exist here, so no provider retries.
- `incomplete-validation` and `duplicate-signal` stop the run without writing a signal;
  `rejected` writes the rejection artifact. Nothing is ever silently dropped.

## Timeouts & rate limits

- Local compute and file writes only — seconds; no provider budget consumed. Default bash
  timeout is ample.

## Observability

- The signal (or rejection) artifact plus the ack sidecars ARE the log (`org-protocol`).
- When the evidence came from a briefing cycle, the payload cites the `strategize` journal
  day file by path; downstream strategy artifacts join back through the signal id.

## Escalation

- Promoted signals → Strategy Research (`research-hypothesis` consumes; delivery requires
  their ack sidecar — no ack means not delivered, follow up per the charter).
- Repeated rejections traced to one provider or source → Intelligence Lead → Engineering
  work order (`eng-triage`); trading on the affected data pauses until Validation clears it.

## Example

```bash
date -u +%Y-%m-%dT%H:%M:%SZ    # 2026-07-30T10:45:00Z
mkdir -p .tribes/org/signals
# write the envelope to signals/20260730T104500Z-eth-funding-dislocation.json.tmp, then:
mv .tribes/org/signals/20260730T104500Z-eth-funding-dislocation.json.tmp \
   .tribes/org/signals/20260730T104500Z-eth-funding-dislocation.json
# ack each consumed observation via observations/<obs-id>.ack.json
```

Successful artifact (excerpt):

```json
{
  "state": "validated-signal",
  "upstream": ["20260730T101500Z-eth-funding-obs", "20260730T102000Z-eth-sm-flow"],
  "checks": [
    "evidence:2-independent",
    "cross-check:match(0.1%<=1.0%)",
    "freshness:all-fresh",
    "contradictions:clean",
    "confidence:0.60(medium)"
  ],
  "expires_at": "2026-07-30T18:45:00Z",
  "payload": {
    "claim": "ETH funding dislocation mean-reverts within 8h",
    "confidence": 0.6,
    "single_source": false
  }
}
```

## Acceptance

- [ ] Evidence gate measured, not assumed; independence counted by provider AND method.
- [ ] Confidence came from the rubric alone; single-source cap applied; band recorded.
- [ ] `expires_at` derived from source windows and horizon, and is in the future.
- [ ] Rejections written with all reason codes and reject acks — never a silent drop.
- [ ] Duplicate guard ran before minting; writes were atomic; acks are sidecars only.

## Related skills

- `validate-cross-check` — the independent-verification block this skill embeds.
- `validate-freshness` — staleness verdicts gating promotion.
- `validate-contradictions` — the block-or-annotate report feeding the penalty.
- `intel-news-triage` — authoritative independent-source counting for news evidence.
- `research-hypothesis` — the downstream consumer of promoted signals.
- `org-protocol` — envelope, ids, acks, atomic writes, recovery sweeps.
- `strategize` — the evidence-gate convention and journal this skill cites.
