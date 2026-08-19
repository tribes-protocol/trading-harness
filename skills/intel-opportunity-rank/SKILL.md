---
name: intel-opportunity-rank
description: >-
  The Intelligence Lead's ranking skill that folds the department's current observations into
  one transparent, ordered opportunity set: explicit scored criteria (signal strength,
  freshness, liquidity, venue tradability from the pass's shared all-dex snapshot), a
  tradable-now vs watchlist split per AGENTS.md, and per-row citations back to observation
  ids. Handles: cross-desk prioritization, the department's briefing input to Data Validation
  and strategize. Call it after a collection cycle, before validation prioritization or a
  briefing. NOT for: producing discovery observations (use intel-trending-scan); news
  collection (use intel-news-collect); validating or scoring evidence
  (use validate-signal-score); choosing an actual trade (use thesis).
allowed-tools: bash read
---

# Intel: Opportunity Rank

## Identity

- Stable id: `intel-opportunity-rank` — owner: Market Intelligence. Invoked by: Intelligence
  Lead (`.agents/intel-lead.md`).

## Purpose

Order the department's raw output so scarce validation and research attention lands on the
best candidates first. The ranking is a RECOMMENDATION about attention — a prioritized
reading of existing observations — never a trade decision, never a promotion: every row cites
the observation ids it stands on, and everything still flows through Data Validation, Strategy
Research, and Portfolio Management unchanged.

## Inputs

- Required: the current non-terminal `observation` artifacts under `.tribes/org/observations/`
  (all four producer lenses: discovery, news, on-chain, social/events); the pass's shared
  all-dex snapshot `.tribes/org/snapshots/<UTC>-all-dexes.json`.
- Optional: a Head-of-Desk focus request (asset class, theme); triage composite scores and
  catalyst timing already embedded in the cited artifacts.

## Outputs

- The ranked set `.tribes/org/snapshots/<UTC>-opportunity-rank.json` — a derived department
  product (NOT one of the eight artifact states; the underlying facts stay in the cited
  observations). Per row: asset (dex, coin/pair), bucket `tradable-now | watchlist` (with the
  AGENTS.md label when watchlist), per-criterion scores + composite, `citations[]`
  (observation ids), direction hint copied from upstream hypotheses (labeled hypothesis), and
  the venue-quality facts used (referencePx/midPx/oraclePx coherence, dayNtlVlm, dayBaseVlm,
  openInterest, impactPxs, maxLeverage, marginMode/onlyIsolated, isDelisted).
- Layer separation, explicit in the file: facts = venue fields + cited observation content;
  signals = none minted here; recommendation = the ordering and buckets; actions = none.
- Venue facts carry the full source record per `org-protocol`: provider `hyperliquid`,
  command, `source_ts` (snapshot sweep time), `retrieved_at`, freshness `live`.
- The file also records the weight vector and threshold values used — the ranking must be
  independently recomputable.

## Integration

- `tribes-cli hyperliquid list-assets --all-dexes --out
.tribes/org/snapshots/<UTC>-all-dexes.json` — ONLY when the pass has no snapshot within its
  `live` window (one sweep per pass, per `org-protocol`); otherwise REUSE the existing file.
- `tribes-cli hyperliquid list-assets --market spot --out <file>` when a candidate is
  Hyperliquid-spot.
- Everything else is local composition over `.tribes/org/observations/` — no other providers.

## Preconditions

- At least one fresh (non-stale, non-terminal) observation exists; otherwise emit the explicit
  empty set (see Failure & retry).
- All-dex snapshot present and within the `live` window, or refreshed once with `--out`.
- The sweep file is read IN FULL from disk — the output spans many dexes and thousands of
  lines; the `xyz` section (stocks/commodities) is read FIRST for any stock or commodity
  candidate, and no tradability verdict is made from a truncated or unread section
  (AGENTS.md hard rule).

## Procedure

1. Gather non-terminal observations; group by asset; drop nothing — assets that will not rank
   still appear in the watchlist tail with their reason.
2. Load the all-dex snapshot (refresh once only if missing/stale); read every dex section from
   the file, `xyz` first when securities/commodities are in play.
3. Score each asset, every criterion in [0, 1], default weight vector (recorded in the
   output): signal strength 0.35 — triage/observation composites, number of DISTINCT
   producer lenses citing it (multi-lens beats single-lens), single-source flags carried
   through; freshness 0.20 — best freshness class among citations; liquidity 0.25 —
   dayNtlVlm, openInterest, impactPxs spread relative to a plausible org size; tradability
   0.20 — listed on its hosting market with coherent quality data.
4. Bucket per the AGENTS.md guardrail: `tradable-now` requires listed AND live referencePx
   with coherent midPx/oraclePx AND meaningful dayNtlVlm/dayBaseVlm and openInterest AND
   reasonable impactPxs AND not isDelisted (honoring marginMode/onlyIsolated as venue
   constraints). Everything else is `watchlist`, labeled `Not currently tradable on
Hyperliquid` or `Listed but not currently actionable`.
5. Order: tradable-now first by composite descending, then the watchlist — never present a
   non-listed asset as executable (AGENTS.md).
6. Atomic-write the set with citations, weight vector, thresholds, and source records.
7. Hand the top rows to Data Validation as the validation priority queue, and the whole set to
   `strategize` as briefing input. The set is advisory prioritization, not a state promotion —
   no ack sidecar is required, but Data Validation's pick-up is followed up by the lead.

## Validation

- Every row cites ≥ 1 existing observation id; the ranker invents no candidates and re-states
  no facts that are not in a citation or the venue snapshot.
- Every tradable-now row passes the full quality checklist; venue fields traceable to the
  snapshot file with all four stamps.
- Weights sum to 1.0 and appear in the output; recomputing composites from the recorded
  inputs reproduces the ordering.
- Single-source and `odds-only` flags from upstream artifacts survive into their rows — the
  ranking never launders a capped-confidence observation into a clean-looking candidate.

## Risk & safety

- Prioritization only: no signal minting, no trade recommendation to the user, no execution
  command, no bypassing of Validation/Research/PM.
- NEVER mark an asset tradable from a partial sweep read or a default-dex lookup; a
  not-tradable verdict requires having read that asset's section (AGENTS.md).
- Stale observations (outside their freshness window) rank with freshness 0 and are marked —
  they can hold a watchlist spot, never boost a tradable-now composite.

## Failure & retry

- Sweep command fails → retry once; still failing → emit the set as WATCHLIST-ONLY, every row
  marked `venue-unverified`, and open an Engineering work order (`eng-triage`) — a ranking
  must never claim tradability it could not verify.
- Zero fresh observations → write the explicit empty set (a fact: "no candidates this
  cycle"), never silence.
- Malformed observation artifact → skip it, record its id under `skipped[]` with the parse
  error, continue; report the skip to the producing role's lead.
- Idempotency: re-running within the snapshot's `live` window reuses the same inputs and
  reproduces the same ordering; each run writes its own `<UTC>` file (last 5 kept by the
  recovery sweep).

## Timeouts & rate limits

- The all-dex sweep is large: ALWAYS `--out`, 120 s bash timeout, and at most one sweep per
  pass shared with every other role (`org-protocol` rate budget). Ranking itself is local file
  work with no provider budget.

## Observability

- The ranked-set file (weights, thresholds, citations, source records, `skipped[]`) is the
  audit record; observation ids join rows back to raw evidence; snapshot retention bounds
  history to the last 5 sets.

## Escalation

- Top rows → Data Validation for priority validation (then `validate-signal-score` decides
  promotion); the set → Head of Desk / `strategize` as the department's briefing input.
- `venue-unverified` sets, systematic venue-data incoherence (listed assets with broken
  marks) → Engineering work order (`eng-triage`) via the Intelligence Lead.
- Nothing tradable across repeated cycles → Intelligence Lead raises the coverage question
  with the Head of Desk (scope, not software).

## Example

```bash
# reuse the pass snapshot if fresh; otherwise exactly one sweep:
tribes-cli hyperliquid list-assets --all-dexes \
  --out .tribes/org/snapshots/20260730T130000Z-all-dexes.json
date -u +%Y-%m-%dT%H:%M:%SZ   # retrieved_at stamp
```

Success: `20260730T130500Z-opportunity-rank.json` — 3 tradable-now rows (top: xyz:NVDA,
composite 0.81, citations: one news cluster + one catalyst + one derivatives observation;
impactPxs tight, OI meaningful), 4 watchlist rows each carrying its AGENTS.md label, weight
vector and thresholds recorded, handed to Data Validation and the briefing.

## Acceptance

- [ ] Entire sweep read from file; `xyz` first for securities/commodities; no verdict from a
      truncated section.
- [ ] Every row scored on the four recorded criteria; weights sum to 1.0; ordering
      recomputable.
- [ ] Tradable-now rows all pass the AGENTS.md quality checklist; watchlist rows labeled.
- [ ] Every row cites real observation ids; upstream caps and flags survived.
- [ ] Set delivered to Data Validation and strategize; failures explicit, never silent.

## Related skills

- `intel-trending-scan` — discovery observations feeding the ranking.
- `intel-liquidity-anomalies` — anomaly observations feeding the ranking.
- `intel-funding-oi` — funding/OI observations feeding the ranking.
- `intel-news-triage` — scored news observations feeding the ranking.
- `intel-event-catalysts` — catalyst timing context in the ranking.
- `intel-smart-money` — on-chain flow observations feeding the ranking.
- `validate-signal-score` — the promotion gate downstream of this ranking.
- `strategize` — the briefing cycle this set feeds.
- `hyperliquid` — the all-dex listing surface behind the venue filter.
- `org-protocol` — snapshots, freshness windows, rate budget, envelopes.
