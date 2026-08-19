---
name: validate-contradictions
description: >-
  Data Validation skill that scans an evidence set for contradictions and outliers before
  promotion: cross-source disagreement beyond the class threshold, sign flips such as bullish
  news against smart-money distribution, impossible values, and wash-trade patterns where
  volume dwarfs liquidity. Handles: targeted re-pulls that separate a moving market from a
  real contradiction, and the block-or-annotate verdict that feeds scoring. Call it after
  cross-check and freshness on every observation set headed to promotion. NOT for: routine
  two-provider price verification (use validate-cross-check); staleness verdicts (use
  validate-freshness); writing or rejecting the signal itself (use validate-signal-score).
allowed-tools: bash read
---

# Validate: Contradictions

## Identity

- Stable id: `validate-contradictions` — owner: Market Intelligence / Data Validation.
  Invoked by: the Data Validation role (`.agents/intel-validation.md`), after
  `validate-cross-check` and `validate-freshness` have run on the same evidence set.

## Purpose

Find the disagreements that survive freshness and cross-check: values two sources cannot both
be right about, directions that flip between evidence kinds, numbers that are physically
impossible, and volume that looks manufactured. Before declaring any contradiction, re-pull
both sides once in a tight window so a moving market is not mistaken for bad data. The output
blocks or annotates — it never promotes, rejects, or edits an artifact itself.

## Inputs

Required: the candidate evidence set (observation ids under `.tribes/org/observations/`), the
cross-check block(s) from `validate-cross-check`, and the freshness report from
`validate-freshness`. Optional: re-pull budget override (default 2 provider calls per
finding, hard cap 6 per run); the signal's core claim, used to grade sign-flip severity.

## Outputs

A contradiction report, returned in-run for `validate-signal-score` to embed:

- `checks_run`: `["disagreement", "sign-flip", "impossible-values", "wash-trade"]` (any not
  applicable recorded as `n/a` with the reason).
- `findings[]`: `{type, evidence (artifact ids + exact fields), detail, severity:
"annotate"|"block", re_pull: {commands, first_ts, second_ts, resolved}}`.
- `verdict`: `clean` | `annotated` | `blocking` — the worst finding's severity.
- Every re-pull recorded as an org-protocol source: provider + command + `source_ts` +
  `retrieved_at` (stamped with `date -u +%Y-%m-%dT%H:%M:%SZ`).
- Labeling: conflicting values are facts; severity is a validation judgment; drop-this-source
  suggestions are labeled recommendations; the only actions are read-only re-pulls.
- Explicit failure states: `blocking`, `re-pull-failed`, per-finding `unresolved`.

## Integration

- Disagreement: reuse the deviations already measured by `validate-cross-check` — anything
  past the contradiction column of its asset-class table lands here for confirmation.
- Sign flips across evidence kinds (direction facts only, hypotheses excluded):
  - news sentiment vs smart-money flow: `tribes-cli smart-money netflow --token <addr>
--chain <chain> --out <file>`, `tribes-cli smart-money perp-trades --token <COIN>
--limit 50 --out <file>`
  - claimed price direction vs a fresh read: `tribes-cli asset price …`
- Impossible values (local scan, no calls): price ≤ 0; candle `h < l` or close/open outside
  `[l, h]`; percentage fields out of range (e.g. top-holder % > 100); negative volume or
  liquidity; timestamps in the future beyond 60 s skew.
- Wash-trade pattern: `tribes-cli token-data trade-data --addresses <addr> --chain <chain>
--out <file>` (or `token-data overview`): `volume_24h_usd > 10× liquidity_usd` → annotate;
  `> 25×` with `trades_24h > 50× unique_wallets_24h` → block.
- News re-pull for sentiment claims: `tribes-cli news fetch --kind <token|perp|stock> …
--out <file>` — long-polls while the backend analyzes (see Timeouts).

## Preconditions

- Cross-check and freshness reports exist for this evidence set, from this session.
- Re-pull budget available within the validation cycle's provider-call budget
  (`org-protocol`); the pass's snapshots are reused before any fresh pull.

## Procedure

1. Assemble the evidence set with its cross-check and freshness reports.
2. Impossible-value scan over every payload field cited by the observations. Violations are
   `block` immediately — no re-pull can fix `h < l`.
3. Disagreement scan: carry over every cross-check `contradiction` verdict as a candidate
   finding.
4. Sign-flip scan: compare direction facts across kinds (news sentiment, smart-money flow,
   price change, funding). A flip against the signal's CORE claim grades `block`; a flip
   against context only grades `annotate`.
5. Wash-trade scan when the claim depends on volume or trending rank.
6. For each candidate from steps 3–4 (and 5 when re-pullable): ONE re-pull cycle — both
   sides, ≤ 60 s apart, `--out` into `.tribes/org/snapshots/`. If the disagreement collapses
   within threshold, the market moved: downgrade to `annotate` with both timestamps. If it
   persists, the finding is confirmed at its graded severity. Never re-pull twice to shop for
   agreement.
7. Emit the report; `verdict` = worst severity present.

## Validation

- Every finding cites artifact ids and the exact fields in conflict.
- Every `block` finding is either impossible-by-construction or carries a completed re-pull
  cycle with both timestamps ≤ 60 s apart.
- Re-pull commands and stamps recorded per `org-protocol`; budget arithmetic recorded.

## Risk & safety

- Read-only reads plus bounded re-pulls; this skill must never become a polling loop.
- Never edit or delete a contradictory observation — one writer per file; rejection stamping
  belongs to `validate-signal-score`.
- An annotation never hides a block-level fact; downgrades happen only via a completed
  re-pull cycle, recorded.

## Failure & retry

- Re-pull provider failure: retry once per `org-protocol`; if still failing, the finding is
  `unresolved` and its severity escalates to `block` — what cannot be confirmed cannot
  support promotion (fail closed), and the report records `re-pull-failed`.
- `blocking` is a recorded outcome, not an error: it flows into
  `validate-signal-score`'s rejection reasons.

## Timeouts & rate limits

- `news fetch` polls while the backend analyzes — run it with an explicit bash timeout of at
  least 360 s (worst case ≈ 5 minutes); treat a timeout as `re-pull-failed`, never rerun in a
  loop.
- All other reads are fast; the default 120 s bash timeout is sufficient.
- Budget: 2 provider calls per finding, hard cap 6 per run; snapshots reused first.

## Observability

- Findings are embedded verbatim by `validate-signal-score` into the signal's payload or the
  rejection reasons — the artifact is the log per `org-protocol`.
- Raw re-pull JSON saved via `--out` under `.tribes/org/snapshots/<UTC>-repull-<asset>.json`.

## Escalation

- `blocking` verdict → `validate-signal-score` records the rejection with the findings.
- Impossible values recurring from one provider → Intelligence Lead → Engineering work order
  (`eng-triage`); trading on that provider's data pauses per the charter.

## Example

```bash
# obs A (news): DOGE bullish catalyst; obs B (on-chain): smart money selling DOGE perps.
# Sign-flip candidate → one re-pull cycle, both sides within 60 s (news: >=360 s bash timeout)
tribes-cli news fetch --kind perp --coin DOGE \
  --out .tribes/org/snapshots/20260730T103000Z-repull-doge-news.json
tribes-cli smart-money perp-trades --token DOGE --limit 50 \
  --out .tribes/org/snapshots/20260730T103000Z-repull-doge-sm.json
```

Result: news still bullish, smart-money sells persist — flip contradicts context, not the
core claim:

```json
{
  "verdict": "annotated",
  "findings": [
    {
      "type": "sign-flip",
      "evidence": ["20260730T094500Z-doge-news", "20260730T095000Z-doge-sm-flow"],
      "detail": "bullish news vs SM perp distribution $840k/24h; persisted across re-pull",
      "severity": "annotate",
      "re_pull": { "resolved": false }
    }
  ]
}
```

## Acceptance

- [ ] All four scan types ran or were recorded `n/a` with a reason.
- [ ] No contradiction declared without a completed re-pull cycle (impossible values exempt).
- [ ] Re-pulls bounded, paired ≤ 60 s apart, recorded as sources with both stamps.
- [ ] Verdict equals the worst severity; nothing block-level was silently downgraded.

## Related skills

- `validate-cross-check` — supplies the deviations this skill confirms or clears.
- `validate-freshness` — ages that separate stale data from live disagreement.
- `validate-signal-score` — consumes the verdict; owns rejection stamping.
- `intel-news-triage` — source credibility context for grading news-side findings.
- `org-protocol` — source stamps, budgets, snapshot layout.
- `asset-data` — the router used for fast price-side re-pulls.
