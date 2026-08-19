---
name: validate-freshness
description: >-
  Data Validation skill that decides fresh-or-stale per source for any observation or raw
  payload: normalizes heterogeneous provider timestamps (epoch seconds vs milliseconds vs ISO
  vs date-only), stamps retrieval time when a payload carries no as-of field, and applies the
  org-protocol freshness classes. Handles: timestamp normalization, staleness verdicts with
  the window used, completeness checks on candle series, and failing undatable data closed.
  Call it before cross-checking or scoring any observation, and whenever a consumer needs a
  stale/fresh verdict. NOT for: comparing values across providers (use validate-cross-check);
  sign-flip and outlier scans (use validate-contradictions); confidence and the evidence gate
  (use validate-signal-score).
allowed-tools: bash read
---

# Validate: Freshness

## Identity

- Stable id: `validate-freshness` — owner: Market Intelligence / Data Validation. Invoked by:
  the Data Validation role (`.agents/intel-validation.md`); other org roles may request a
  verdict through Data Validation, never by re-implementing the rules.

## Purpose

Give every source in an evidence set one defensible `fresh` or `stale` verdict, with the
window used, by normalizing provider timestamps that arrive in four different shapes and by
stamping retrieval time where providers supply no as-of at all. Pure local compute over
files — this skill pulls no market data, edits no artifact, and never loosens a window.

## Inputs

Required: an `observation` artifact path (`.tribes/org/observations/<id>.json`) OR a raw
payload file (a snapshot or `--out` file) plus the provider and command that produced it and,
for retrieval-basis payloads, the `retrieved_at` recorded at pull time. Optional: a tightened
window from the consumer (consumers may tighten, never loosen — `org-protocol`); the series
timeframe when checking candle completeness.

## Outputs

A freshness report, one entry per source, for `validate-signal-score` to embed:

- `{provider, command, raw_ts, normalized_ts (ISO UTC), basis: "source"|"retrieval", class,
window_s, age_s, verdict: "fresh"|"stale"}` — provider + command + source timestamp +
  retrieval timestamp always present per `org-protocol`.
- Series entries add `completeness: {expected_bars, actual_bars, gaps, volume_present}`.
- Labeling: ages and counts are facts; the verdict is a validation judgment; a re-pull
  suggestion for stale-but-repullable data is a labeled recommendation. No actions.
- Explicit failure states: `undatable`, `invalid-timestamp`, `incomplete-series` (below).

## Integration

- `date -u +%Y-%m-%dT%H:%M:%SZ` and `date -u +%s` for the now/retrieval stamps; `read` over
  artifact and snapshot files. No provider calls — deterministic and idempotent by
  construction (same inputs at the same instant give the same report).
- Freshness classes and default windows: `org-protocol` (referenced, never restated).
- Known no-as-of payloads that force retrieval basis (providers omit any as-of field):
  `token-data overview/security/trending`, `smart-money netflow/holdings/token-list`, and
  `hyperliquid list-assets` rows. Stamp `retrieved_at` yourself at pull time.

## Preconditions

- The payload's producing command and provider are known (they name the as-of field).
- For retrieval-basis payloads: a `retrieved_at` stamped when the pull actually happened.
  Re-stamping an old file at report time is falsification and is forbidden.

## Procedure

1. Stamp `now` with `date -u`.
2. For each source, locate its as-of field; if the provider supplies none, use the recorded
   `retrieved_at` with `basis: "retrieval"`.
3. Normalize to ISO UTC by the table below; resolve every ambiguity to the OLDER
   interpretation so staleness errs safe.
4. Assign the freshness class per `org-protocol` for the data kind; window = class default
   unless the consumer tightened it.
5. `age_s = now − normalized_ts`; verdict `stale` when `age_s > window_s`, else `fresh`.
6. Candle series: `expected_bars = window ÷ timeframe`; count actual bars, flag gaps of more
   than 2 consecutive missing bars as `incomplete-series`, and record
   `volume_present: false` when `v` is null (CoinGecko `--id` candles) so volume-dependent
   checks are known to be unavailable.
7. Emit the report. Never edit the source artifact — verdicts travel in the report and land
   in the consuming artifact's `checks[]`.

### Normalization rules

| Raw shape                    | Rule                                               |
| ---------------------------- | -------------------------------------------------- |
| numeric ≥ 1e12               | epoch milliseconds                                 |
| numeric in [1e9, 1e12)       | epoch seconds → ×1000                              |
| numeric < 1e9                | not a timestamp — treat as missing                 |
| ISO 8601 with time           | parse; assume UTC when the zone is absent          |
| `YYYY-MM-DD HH:MM:SS`        | assume UTC                                         |
| date-only `YYYY-MM-DD`       | 00:00:00Z that day (oldest plausible — errs stale) |
| missing, or future by > 60 s | missing → retrieval basis + `no_as_of` note        |

Provider reality this table exists for: candle `t` fields are epoch ms; BirdEye trade rows
carry `block_unix_time` in epoch seconds; Nansen emits ISO strings and date-only rows; news
items carry numeric `timestamp` plus `analyzedAt`.

## Validation

- Every source in the input got exactly one verdict — no silent skips.
- Every retrieval-basis entry carries the `no_as_of` note and a true pull-time stamp.
- All `normalized_ts` values are ISO UTC with the `Z` suffix; the rule used is recoverable
  from `raw_ts`.

## Risk & safety

- A `stale` verdict is binding: stale data is usable only with an explicit stale mark and
  never for order sizing or triggers (`org-protocol`).
- Never loosen a window to make evidence pass; never re-stamp retrieval on old data.
- Read-only: no provider calls, no artifact mutations, no state promotion.

## Failure & retry

- No network, so no retries. Failure states, all recorded and fail-closed:
  - `undatable` — no as-of field and no recorded retrieval stamp → verdict `stale`.
  - `invalid-timestamp` — unparseable or future beyond skew → treated as missing; if no
    retrieval stamp exists either, `undatable`.
  - `incomplete-series` — gap threshold exceeded; recorded, consumer decides usability.
- Malformed artifact JSON → report to the producing role via the Intelligence Lead; never
  repair another writer's file.

## Timeouts & rate limits

- Local compute only — completes in seconds, consumes no provider budget. Default bash
  timeout is ample.

## Observability

- Verdicts are embedded in the consuming artifact's `checks[]` (e.g. `freshness:live`,
  `freshness:stale(age 9m, window 5m)`) by the role that ran this skill; the artifact is the
  log per `org-protocol`.

## Escalation

- Systematic staleness from one provider (repeated `stale` on live-class reads) →
  Intelligence Lead → Engineering work order (`eng-triage`); trading on the affected data
  pauses until Validation clears it, per the charter.
- Individual stale evidence → the promotion simply fails at `validate-signal-score` with
  reason `stale-evidence`; no escalation needed.

## Example

```bash
date -u +%Y-%m-%dT%H:%M:%SZ   # 2026-07-30T10:22:00Z
# source 1: smart-money netflow snapshot (no as-of field), retrieved_at 2026-07-30T10:05:00Z
# source 2: news item timestamp 1785403500 (epoch s < 1e12 → seconds)
```

Report:

```json
[
  {
    "provider": "nansen",
    "command": "tribes-cli smart-money netflow --token … --chain solana",
    "basis": "retrieval",
    "normalized_ts": "2026-07-30T10:05:00Z",
    "class": "recent",
    "window_s": 86400,
    "age_s": 1020,
    "verdict": "fresh",
    "note": "no_as_of"
  },
  {
    "provider": "tribes-news",
    "command": "tribes-cli news fetch --kind perp --coin BTC",
    "basis": "source",
    "normalized_ts": "2026-07-30T09:25:00Z",
    "class": "recent",
    "window_s": 86400,
    "age_s": 3420,
    "verdict": "fresh"
  }
]
```

## Acceptance

- [ ] Every source normalized to ISO UTC; ambiguity resolved to the older reading.
- [ ] Retrieval basis used only where the payload truly lacks an as-of, stamped at pull time.
- [ ] Every verdict carries class, window, and age; stale is binding downstream.
- [ ] Undatable or invalid-timestamp data failed closed as stale.

## Related skills

- `org-protocol` — the freshness classes and windows this skill applies.
- `validate-cross-check` — consumes these verdicts before comparing providers.
- `validate-contradictions` — uses ages to separate moving markets from contradictions.
- `validate-signal-score` — embeds the report; rejects on stale evidence.
- `asset-data` — payload shapes and the router envelope this skill reads.
- `news` — item timestamp semantics for news-derived observations.
