---
name: intel-derivatives-posture
description: >-
  Market Intelligence read of derivatives positioning TO THE EXTENT PROVIDERS ALLOW — OI deltas
  across pass snapshots, funding extremes, and smart-money Hyperliquid perp positioning — with
  the hard truth stamped on every artifact: no integrated provider offers true liquidation
  feeds or long/short ratios, so everything here is a named proxy. Handles: crowding and
  squeeze-risk hypotheses, leverage-flush detection from OI drops, per-coin smart-money
  leaderboard and trade-side skew — written as observation artifacts carrying the provider-gap
  stamp. Call it when Discovery or Research needs positioning context on a perp. NOT for: the
  funding/OI baselines themselves (use intel-funding-oi); on-chain smart-money flows (use
  intel-smart-money); ranked opportunity sets (use intel-opportunity-rank); derivatives
  research for user conversations (use exchange-analyst).
allowed-tools: bash read
---

# Intel: Derivatives Posture

## Identity

- Stable id: `intel-derivatives-posture` — owner: Market Intelligence. Invoked by: Discovery
  Agent.

## Purpose

Estimate how positioned and how crowded a perp market is, using only what the harness's
providers actually offer. Plainly: there is NO integrated provider for liquidation feeds,
liquidation heatmaps, or long/short ratios (charter Open gaps — a Coinglass-class source would
need a new billed key and control-plane change). This skill therefore composes proxies — OI
deltas between pass snapshots, funding extremes, cross-venue OI context, and smart-money perp
activity — and stamps that provider gap on EVERY artifact it writes, so no downstream consumer
mistakes a proxy for a measured liquidation or positioning ratio. It never proposes trades.

## Inputs

- Required: one or more perp coins (with dex) to assess — this is a per-asset deepening pass,
  not a venue sweep.
- The pass's all-dex snapshot and retained prior snapshots under `.tribes/org/snapshots/`
  (`org-protocol` retention: last 5 per source) for OI deltas.
- Optional upstream: an `intel-funding-oi` observation id for the coin (reuse its findings as
  `upstream` instead of recomputing).

## Outputs

One observation artifact `.tribes/org/observations/<UTC>-derivatives-posture-<coin>.json`
(envelope per `org-protocol`), payload:

- `facts`: current OI/funding/premium (snapshot), OI deltas with both snapshot references,
  CoinGecko derivatives rows for the coin off-venue, smart-money perp leaderboard rows and
  recent perp trade sides — each traceable to a `sources[]` entry with provider, command,
  `source_ts` where present, `retrieved_at` stamped here, freshness class.
- `proxies`: fired proxy rules only — `{proxy, definition, threshold, observed, sources}`.
- `hypotheses`: labeled interpretations (crowded long, squeeze risk, suspected flush).
- `gaps`: ALWAYS contains at least `no-liquidation-feed` and `no-long-short-ratio`, plus any
  run-specific gap. A posture artifact without this stamp is invalid.

No signals, no recommendations, no actions.

## Integration

- Shared snapshot: `tribes-cli hyperliquid list-assets --all-dexes --out
.tribes/org/snapshots/<UTC>-all-dexes.json` — REUSED per `org-protocol`; current OI,
  funding, premium per perp. Deltas come from comparing retained snapshots — no OI history
  endpoint exists in the harness.
- `tribes-cli exchanges derivatives --limit 500 --out <file>` — off-venue OI and funding for
  the same symbol (client-side filter; no per-coin flag). Current values only.
- `tribes-cli smart-money perp-leaderboard --token <SYMBOL> --limit 20 --out <file>` — Nansen
  Hyperliquid per-coin trader leaderboard, fixed trailing 30 d: pnl, roi, position_value_usd,
  trade_count. NOTE: rows carry NO long/short side — this measures who is active and
  successful, not direction.
- `tribes-cli smart-money perp-trades --token <SYMBOL> --limit 100 --out <file>` — latest
  smart-money Hyperliquid perp trades WITH side/action fields; the only directional
  smart-money read available.
- Funding-extreme rule: reuse `intel-funding-oi`'s published rule and findings rather than
  redefining it here.
- Envelope, snapshot retention, freshness: `org-protocol`.

## Preconditions

- Session-start recovery pass already ran; directories exist (`mkdir -p` on first use).
- A current all-dex snapshot plus at least one prior retained snapshot (else every OI-delta
  proxy is recorded as a gap, and the artifact says so).
- NANSEN_API_KEY configured for the smart-money legs; key-not-set is a recorded gap.

## Procedure

1. Stamp retrieval time (`date -u +%Y-%m-%dT%H:%M:%SZ`); load current + prior snapshots and
   extract the coin's rows.
2. Compute OI deltas and pull off-venue context (`exchanges derivatives`, filtered
   client-side). Reuse the pass's funding findings from `intel-funding-oi` when cited as
   upstream; otherwise apply its funding-extreme rule to the snapshot.
3. Pull smart-money positioning: `perp-leaderboard` (who, how big, how good — no side) and
   `perp-trades` (recent sides). Compute the trade-side balance over the pulled window.
4. Apply the proxy rules. Defaults (recorded verbatim in every artifact):

   | Proxy            | Default trigger                                                                                       |
   | ---------------- | ----------------------------------------------------------------------------------------------------- |
   | crowding         | funding extreme (per `intel-funding-oi`) AND OI up ≥ 10% across the two most recent snapshots         |
   | squeeze risk     | crowding present AND price flat-to-adverse for the crowded side over the same window                  |
   | leverage flush   | OI down ≥ 15% between snapshots alongside an adverse price move — liquidation-CASCADE HYPOTHESIS only |
   | SM directional   | ≥ 70% of pulled smart-money perp trades on one side, with trade count ≥ 10                            |
   | SM concentration | top-3 leaderboard position_value_usd ≥ 50% of the pulled top-20 total (activity, not direction)       |

5. Record fired proxies with definition + threshold + observed values + sources; direction and
   causal claims (e.g. "that OI drop was liquidations") go ONLY into `hypotheses`, labeled —
   no provider can confirm them.
6. Stamp `gaps` with `no-liquidation-feed` and `no-long-short-ratio` (always) plus any
   run-specific gaps; add a `checks[]` entry naming the proxies used in place of the missing
   feeds.
7. Write the observation atomically; hand off to Data Validation and track the ack sidecar.

## Validation

- The gap stamp is present — an artifact missing `no-liquidation-feed` / `no-long-short-ratio`
  fails validation by construction.
- Every fired proxy reproducible from cited `--out` files; OI deltas cite both snapshot files.
- Smart-money facts are single-source (Nansen) — flagged as such so `validate-cross-check`'s
  single-source cap applies; the fixed trailing-30d window and page-1 limit are recorded as
  constraints on the fact, not hidden.
- Facts, proxies, and hypotheses kept in separate payload fields.

## Risk & safety

- Read-only; never an order-mutating command, never direction or sizing advice.
- Proxies are weaker than the feeds they stand in for — consumers see that through the gap
  stamp; this skill never words a proxy as a measured ratio or a confirmed liquidation event.
- Leaderboard concentration is not endorsement; skilled traders are also wrong. Say so where
  it matters, in `hypotheses`.
- NEVER place credentials or bearer tokens in any artifact.

## Failure & retry

- Non-auth provider failure: retry once, then record the gap and continue with the remaining
  proxies — a posture artifact with only snapshot-based proxies is still valid if stamped.
- Auth failure: `tribes-cli login` once, retry once, else stop and report.
- No prior snapshot: OI-delta proxies gap out; run continues on funding + smart-money legs.
- Run states: `complete`, `partial` (gaps listed), `failed` (no snapshot at all — no artifact;
  report to the Intelligence Lead).

## Timeouts & rate limits

- Single fast reads; the default 120 s bash timeout suffices for every command here.
- Nansen budget: leaderboard + trades once per coin per pass, `--limit` capped as shown; the
  derivatives list is pulled once per pass and shared with `intel-funding-oi` where possible.

## Observability

- Raw pulls under `.tribes/org/snapshots/` via `--out`; artifacts cite them and any upstream
  `intel-funding-oi` observation id. Artifact id: `<UTC compact>-derivatives-posture-<coin>`.

## Escalation

- Happy path: observation → Data Validation (`validate-cross-check`, single-source cap on the
  Nansen legs).
- Provider failure or impossible values: Intelligence Lead → Engineering work order
  (`eng-triage`).
- The missing liquidation/long-short capability itself: already on the Engineering backlog per
  the charter — cite the gap, do not re-file it per run.

## Example

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
tribes-cli smart-money perp-leaderboard --token BTC --limit 20 --out .tribes/org/snapshots/20260730T110000Z-btc-perp-lb.json
tribes-cli smart-money perp-trades --token BTC --limit 100 --out .tribes/org/snapshots/20260730T110000Z-btc-perp-trades.json
tribes-cli exchanges derivatives --limit 500 --out .tribes/org/snapshots/20260730T110000Z-derivatives.json
```

Success: `observations/20260730T110002Z-derivatives-posture-btc.json` in state `observation` —
crowding proxy fired (funding 3.4x dex median, OI +12% across snapshots), SM directional at
74% long over 100 trades (single-source flagged), a labeled squeeze-risk hypothesis, and
`gaps: ["no-liquidation-feed", "no-long-short-ratio"]` stamped with the proxies named in
`checks[]`.

## Acceptance

- [ ] Every artifact stamps `no-liquidation-feed` and `no-long-short-ratio` and names its
      proxies.
- [ ] OI deltas cite two retained snapshots; no delta claimed from one.
- [ ] Leaderboard used for activity/concentration only — never presented as direction; sides
      come only from perp-trades.
- [ ] Nansen facts flagged single-source with the 30d/page-1 constraints recorded.
- [ ] No signals, recommendations, or causal liquidation claims outside labeled hypotheses.

## Related skills

- `intel-funding-oi` — funding/OI baselines and the funding-extreme rule this skill reuses.
- `intel-smart-money` — on-chain smart-money flows beyond the perp venue.
- `intel-trending-scan` — the discovery sweep that surfaces coins worth a posture pass.
- `intel-opportunity-rank` — where posture observations feed ranked candidate sets.
- `validate-cross-check` — promotes or rejects these observations (single-source cap).
- `exchange-analyst` — derivatives research outside the org envelope.
- `org-protocol` — envelope, snapshot retention, freshness classes, atomic writes.
