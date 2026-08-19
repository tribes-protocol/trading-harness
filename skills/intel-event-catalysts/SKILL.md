---
name: intel-event-catalysts
description: >-
  Market Intelligence catalyst skill that builds an asset-specific event picture — earnings,
  regulatory decisions, ETF rulings, listings, unlocks, macro decision dates — from analyzed
  news, then attaches market-implied odds from Polymarket where a matching market exists.
  Handles: catalyst discovery via news fetch, odds lookup via prediction search/list-events/
  get-event, stdout-redirect snapshots for odds (prediction has no --out), and cycle-over-cycle
  odds drift from kept snapshots. Odds are supporting evidence only, never a standalone signal.
  Call it when the news cycle or a ranked candidate needs its event/odds context. NOT for:
  general headlines and sentiment (use intel-news-collect); dedup and scoring (use
  intel-news-triage); numeric macro values (use macros); social chatter
  (use intel-social-sentiment).
allowed-tools: bash read
---

# Intel: Event Catalysts

## Identity

- Stable id: `intel-event-catalysts` — owner: Market Intelligence. Invoked by: News &
  Sentiment role (`.agents/intel-news.md`).

## Purpose

Turn "what dated events could move this asset" into observation artifacts: each catalyst with
its expected date or window, the news evidence behind it, and — where a Polymarket market
matches — the market-implied probability as supporting evidence. Per the `strategize` evidence
gate, odds NEVER stand alone: an observation whose only source is odds is flagged `odds-only`
and cannot back a validated signal by itself. This skill never predicts, sizes, or trades.

## Inputs

- Required: one asset key (`token:<chainId>:<address>` | `perp:<COIN>` | `stock:<TICKER>`) or
  a named theme (e.g. "Fed September decision") from the Intelligence Lead.
- Optional: event horizon (default 30 days); prior odds snapshots for the same event slug
  (drift computation); already-triaged news observations to cite instead of re-fetching.

## Outputs

- One `observation` artifact per catalyst: `.tribes/org/observations/<UTC>-event-<slug>.json`
  (envelope per `org-protocol`). Payload separates:
  - facts: event name, expected date/window (from sources or the market's own end date —
    never guessed), cited news items, and the odds block (event slug, leading market,
    `probability`, liquidity, volume, `drift_since_last_cycle` when a prior snapshot exists).
  - hypothesis: expected impact direction/magnitude, ALWAYS labeled hypothesis.
  - flags: `supporting_evidence_only: true` on every odds block; `odds-only` when no
    independent non-odds source exists; `thin-market` when liquidity is too low to trust.
- Sources per read, per `org-protocol`: provider `tribes-news` or `polymarket`, exact command,
  `source_ts` (item timestamp; odds: retrieval time — Gamma payloads are point-in-time),
  `retrieved_at` (`date -u`), freshness (`recent` for news, `live` for odds snapshots).

## Integration

- News: `tribes-cli news fetch --kind token|perp|stock …` with `--out` to
  `.tribes/org/snapshots/` — same flags and rules as `intel-news-collect`; bash timeout
  ≥ 120 s, prefer 300 s.
- Odds (all stdout-only — NO --out; snapshot by redirecting stdout):
  - `tribes-cli prediction search --query <q> [--limit-per-type <1..25>] [--events-tag <tag>]`
  - `tribes-cli prediction list-events --tag-slug <slug> --closed false --order volume
--limit <n>` (also `--slug`, `--tag-id`, `--offset`, `--ascending`; `--active` defaults
    true)
  - `tribes-cli prediction get-event --event-slug <slug>` (or `--event-id`; id wins when both
    are passed)
  - Redirect: `tribes-cli prediction get-event --event-slug <slug> >
.tribes/org/snapshots/<UTC>-odds-<slug>.json`
- Probability convention (provider enrichment): each event carries a `leadingMarket` — open
  sub-markets ranked by FIRST outcome price (the "Yes" convention), liquidity tie-break;
  outcome prices arrive as strings and must parse into [0, 1].

## Preconditions

- Asset key/theme resolved; `mkdir -p .tribes/org/snapshots .tribes/org/observations`.
- Cite existing triaged news observations where they already cover the catalyst — re-fetch
  only for coverage gaps (rate budget).
- Prior odds snapshots located (same event slug) before pulling fresh odds, so drift is
  computable.

## Procedure

1. Establish the catalyst list: from cited triaged observations, else one `news fetch` for the
   asset (`--out`, ≥ 120 s timeout) mined for dated or dateable events within the horizon.
2. For each catalyst, look for a matching market: `prediction search` with a targeted query;
   refine ambiguous hits via `list-events`/`get-event` by slug. Redirect every response to its
   own snapshot; stamp `retrieved_at` immediately after each command.
3. Parse the odds: leading market, probability (string → number, verify [0, 1]), liquidity,
   volume. Mark `thin-market` when liquidity is negligible for the question asked.
4. Compute `drift_since_last_cycle` against the prior snapshot for the same slug, when one
   exists (facts: previous probability, current, delta, hours between).
5. Assemble one observation per catalyst: facts / hypothesis / flags per Outputs; every odds
   block `supporting_evidence_only: true`; `odds-only` when no independent non-odds source.
6. Atomic-write artifacts; hand ids to Data Validation (ack sidecar per `org-protocol`); the
   catalyst set also feeds `intel-opportunity-rank` as freshness/timing context.

## Validation

- Every probability parsed into [0, 1]; every odds figure traceable to a snapshot file plus
  all four source stamps.
- Every event date comes from a source or the market's own end date — no invented dates.
- No artifact presents odds as its sole basis without the `odds-only` flag; every odds block
  carries `supporting_evidence_only: true`.
- Closed/archived markets never quoted as live odds (search defaults to active; verify the
  event's state field in the snapshot).

## Risk & safety

- Read-only research. Polymarket order placement does not exist anywhere in the harness — no
  bets, ever.
- Odds are market opinion, not truth: they support a thesis built on independent evidence;
  they never create one (the `strategize` evidence gate is the binding rule downstream).
- Interpretation stays labeled hypothesis; thin markets stay flagged; stale odds snapshots
  (outside the `live` window) are context only, never quoted as current.

## Failure & retry

- News failure path: exactly as `intel-news-collect` (auth → login + one retry;
  analyzing-timeout → one retry then partial with failure record).
- Prediction (keyless): network/5xx → retry once; still failing → record failure state
  `odds-unavailable` and emit the catalyst observation news-only (marked `no-odds-source`).
- Empty prediction search → record the no-market fact (that absence is itself informative);
  not a failure.
- Snapshot redirect wrote an empty file → treat as the command failing; retry once, then
  `odds-unavailable`.
- Idempotency: re-running within a cycle reuses existing snapshots for the same event slug
  within their freshness window instead of re-pulling.

## Timeouts & rate limits

- `news fetch`: bash timeout ≥ 120 s, prefer 300 s (the CLI long-polls up to ~5 min).
- `prediction` commands are fast: 60 s bash timeout.
- Budget: ≤ 5 odds lookups per asset per cycle; one news fetch per asset per cycle (reuse
  triaged observations first).

## Observability

- Odds snapshots under `.tribes/org/snapshots/<UTC>-odds-<slug>.json` are the drift history —
  the recovery sweep keeps the last 5 per source, which bounds drift lookback; a longer odds
  time series is a known open gap (Polymarket price history is unwrapped) flagged on artifacts
  that would need it. Artifacts cite snapshot paths and news observation ids.

## Escalation

- Observations → Data Validation (`validate-signal-score` enforces that odds-only evidence
  cannot clear the gate); timing context → `intel-opportunity-rank`.
- Persistent provider failure → Intelligence Lead → Engineering work order (`eng-triage`).
- Odds-history needs beyond kept snapshots → Engineering backlog via the Intelligence Lead
  (charter open gap), never improvised.

## Example

```bash
# catalyst news for NVDA (bash timeout 300 s)
tribes-cli news fetch --kind stock --ticker NVDA \
  --out .tribes/org/snapshots/20260730T123000Z-news-stock-nvda.json
# market-implied odds for the September Fed decision (stdout redirect — no --out exists)
tribes-cli prediction search --query "Fed rate cut September" --limit-per-type 5 \
  > .tribes/org/snapshots/20260730T123200Z-odds-fed-september.json
date -u +%Y-%m-%dT%H:%M:%SZ   # retrieved_at stamp
```

Success: `20260730T123500Z-event-nvda-earnings.json` — earnings date from two news items,
odds block (probability 0.64, liquidity healthy, drift +0.05 vs last cycle),
`supporting_evidence_only: true`, hypothesis labeled, all source stamps present.

## Acceptance

- [ ] Every catalyst has a sourced date/window; no guessed dates.
- [ ] Odds snapshotted via stdout redirect with retrieval stamps; probabilities in [0, 1].
- [ ] `supporting_evidence_only` on every odds block; `odds-only` flagged where applicable.
- [ ] News fetches used `--out` and the ≥ 120 s (preferably 300 s) timeout.
- [ ] Artifacts handed to Data Validation with ack follow-up; drift recorded where computable.

## Related skills

- `prediction` — the underlying Polymarket command group (research-only).
- `news` — the underlying news command group and its fallback chain.
- `intel-news-collect` — bulk headline collection this skill builds on.
- `intel-news-triage` — triaged observations cited as catalyst evidence.
- `intel-opportunity-rank` — consumes catalyst timing in the department ranking.
- `validate-signal-score` — enforces the odds-never-standalone evidence gate.
- `macros` — numeric macro values behind macro-decision catalysts.
- `strategize` — the briefing cycle whose evidence gate this skill honors.
- `org-protocol` — envelope, freshness classes, snapshots, acks.
