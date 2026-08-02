---
name: intel-funding-oi
description: >-
  Market Intelligence analysis of funding rates and open interest on Hyperliquid perps with
  global derivatives context — current funding/OI from the shared all-dex snapshot, per-coin
  history via the new hyperliquid funding-history adapter, cross-venue dislocations via
  predicted-fundings, and CoinGecko's derivatives ticker list for the wider market. Handles:
  funding extremes, OI divergences across pass snapshots, carry context, and cross-venue
  funding spreads — written as observation artifacts with transparent thresholds. Call it
  during a Discovery pass or when Research needs funding/carry evidence. NOT for: liquidation
  or long/short posture proxies (use intel-derivatives-posture); spot volume anomalies (use
  intel-liquidity-anomalies); promoting observations to signals (use validate-signal-score);
  exchange and derivatives research for user conversations (use exchange-analyst).
allowed-tools: bash read
---

# Intel: Funding & OI

## Identity

- Stable id: `intel-funding-oi` — owner: Market Intelligence. Invoked by: Discovery Agent.

## Purpose

Turn the venue's funding and open-interest data into auditable `observation` artifacts:
current funding and OI per perp from the pass snapshot, funding history and cross-venue
predicted funding through the charter's new adapters, and the CoinGecko derivatives list for
context beyond Hyperliquid. Funding extremes and OI divergences are recorded as observations
with their thresholds and raw values — never as trade signals, carry recommendations, or
sizing input. Interpretation (e.g. "crowded long") is a labeled hypothesis.

## Inputs

- Optional targets: perp coins (with dex) to analyze; when absent, the whole snapshot is
  screened.
- The pass's all-dex snapshot path under `.tribes/org/snapshots/`, plus the retained prior
  snapshots (last 5 per source, per `org-protocol`) for OI deltas.
- Optional threshold tightenings from the requesting brief (tighten only).

## Outputs

One observation artifact `.tribes/org/observations/<UTC>-funding-oi.json` (envelope per
`org-protocol`), payload:

- `facts`: per-coin current funding, openInterest, premium, markPx/oraclePx, day notional
  volume (snapshot); funding-history series and predicted cross-venue fundings where pulled;
  matching CoinGecko derivatives rows (funding_rate_pct, open_interest_usd) — each traceable
  to a `sources[]` entry with provider, command, `source_ts` where present, `retrieved_at`
  stamped here, freshness class.
- `findings`: fired rules only — `{rule, threshold, observed, coin, dex, sources}` — facts
  about the data, not judgments.
- `hypotheses`: labeled interpretations (crowding, carry dislocation, short-squeeze setup).
- `gaps`: coins or providers that could not be checked.

No signals, no recommendations, no actions.

## Integration

- Shared snapshot: `tribes-cli hyperliquid list-assets --all-dexes --out
.tribes/org/snapshots/<UTC>-all-dexes.json` — REUSED within its `live` window per
  `org-protocol`; perp rows carry current funding, openInterest, premium, mark/oracle/prevDay
  px, impactPxs, day volumes. Current values only — history needs the adapters below or
  retained snapshots.
- `tribes-cli hyperliquid funding-history --coin <coin> --start-time <ms> [--end-time <ms>]
[--dex <dex>]` — per-coin funding-rate history from the venue (flag reference: the
  `hyperliquid` skill).
- `tribes-cli hyperliquid predicted-fundings` — predicted funding across venues for
  cross-venue dislocations.
- `tribes-cli exchanges derivatives --limit 500 --out <file>` — CoinGecko global derivatives
  tickers (symbol, price, open_interest_usd, funding_rate_pct, volume). No per-coin or
  per-exchange filter flag exists — pull the full list once per pass and filter client-side.
- OI deltas: computed by this skill across the retained pass snapshots — the venue exposes no
  OI history endpoint in the harness.
- Envelope, freshness, snapshot retention: `org-protocol`.

## Preconditions

- Session-start recovery pass already ran; directories exist (`mkdir -p` on first use).
- A current all-dex snapshot exists or is pulled once for this pass; at least one prior
  retained snapshot is needed for any OI-delta finding (else record the gap).
- Funding-history pulls need a window start (`--start-time` in epoch ms); pick it from the
  extreme under test (e.g. trailing 7 days), never an unbounded guess.

## Procedure

1. Stamp retrieval time (`date -u +%Y-%m-%dT%H:%M:%SZ`); load the current snapshot (reuse or
   pull once) and the most recent prior snapshot.
2. Screen every target perp (or the whole snapshot) with the default rules, recorded verbatim
   in the artifact:

   | Rule                | Default trigger                                                                                   |
   | ------------------- | ------------------------------------------------------------------------------------------------- |
   | funding extreme     | abs(current funding) ≥ 3x the median abs(funding) across the same dex, OR annualized abs ≥ 30%    |
   | OI divergence       | sign(ΔOI) opposite sign(Δprice) between the two most recent snapshots, with abs(ΔOI) ≥ 10%        |
   | cross-venue disloc. | predicted or current funding for the same coin differs materially across venues; spread recorded  |
   | premium stretch     | abs(premium) persistently wide vs oracle while funding is extreme (supporting fact for the above) |

3. For coins that fire a rule, deepen: pull `hyperliquid funding-history` for the coin (is the
   extreme new or chronic?) and check `predicted-fundings` for cross-venue confirmation, when
   the adapters are available.
4. Pull `exchanges derivatives --limit 500 --out` once; match flagged coins client-side for
   off-venue OI and funding context. These rows are point-in-time with no as-of field —
   freshness is the retrieval stamp.
5. Record findings with rule + threshold + observed values + sources; put crowding/carry
   interpretations in `hypotheses`, labeled.
6. Write the observation atomically; hand off to Data Validation and track the ack sidecar.

## Validation

- Every finding reproducible from the cited `--out` files and snapshots; thresholds embedded.
- OI deltas cite BOTH snapshot files (paths + their retrieval stamps) — a delta from one
  snapshot is invalid.
- Freshness: `live` for snapshot/venue reads, `recent` for the derivatives list; funding
  history series carry their venue timestamps.
- Facts, findings, and hypotheses kept in separate payload fields.

## Risk & safety

- Read-only; never an order-mutating command, never sizing or carry-trade advice.
- Funding extremes are symmetric evidence — they mark stress, not direction; direction claims
  live only in labeled hypotheses.
- Thresholds may be tightened per run; loosening requires the Intelligence Lead's note in the
  artifact.
- NEVER place credentials or bearer tokens in any artifact.

## Failure & retry

- Non-auth provider failure: retry once, then record the gap and continue with remaining
  sources.
- Auth failure: `tribes-cli login` once, retry once, else stop and report.
- A funding-history / predicted-fundings failure after one retry: a recorded gap plus an
  Engineering work order — never a reason to fake history from a single snapshot.
- Run states: `complete`, `partial` (gaps listed), `failed` (no snapshot obtainable — no
  artifact; report to the Intelligence Lead).

## Timeouts & rate limits

- Single fast reads; the default 120 s bash timeout suffices, including the full
  `exchanges derivatives --limit 500` pull.
- Budget: ONE all-dex sweep per pass (reused); ONE derivatives-list pull per pass;
  funding-history only for flagged coins, not the whole venue.

## Observability

- Raw pulls under `.tribes/org/snapshots/` via `--out`; OI deltas name their two snapshot
  files. Artifact id: `<UTC compact>-funding-oi`.

## Escalation

- Happy path: observation → Data Validation (`validate-cross-check`; contradictions between
  venue funding and CoinGecko rows go to `validate-contradictions`).
- Provider failure or impossible values (negative OI, funding orders of magnitude off):
  Intelligence Lead → Engineering work order (`eng-triage`).

## Example

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
tribes-cli hyperliquid list-assets --all-dexes --out .tribes/org/snapshots/20260730T103000Z-all-dexes.json
tribes-cli exchanges derivatives --limit 500 --out .tribes/org/snapshots/20260730T103000Z-derivatives.json
```

Success: `observations/20260730T103002Z-funding-oi.json` in state `observation` — one funding
extreme (coin X at 4.1x dex median, threshold 3x), one OI divergence (+14% OI vs -3% price
across snapshots 20260730T0900Z/1030Z), matching CoinGecko context rows, a labeled
crowded-long hypothesis, and a 7-day funding-history series confirming the extreme is new.

## Acceptance

- [ ] Current funding/OI came from the reused pass snapshot, not a fresh sweep.
- [ ] Every finding carries rule, threshold, observed values, and sources; OI deltas cite two
      snapshots.
- [ ] Derivatives list pulled once and filtered client-side; retrieval stamped.
- [ ] Direction/crowding talk only in labeled hypotheses; no signals or recommendations.
- [ ] Artifact written atomically; ack from Data Validation tracked.

## Related skills

- `intel-derivatives-posture` — positioning proxies built on these funding/OI facts.
- `intel-trending-scan` — the discovery sweep this pass complements.
- `intel-liquidity-anomalies` — volume/liquidity companion pass.
- `validate-cross-check` — promotes or rejects these observations.
- `validate-signal-score` — where validated funding evidence becomes a scored signal.
- `exchange-analyst` — derivatives research outside the org envelope.
- `hyperliquid` — venue command reference, including the new adapters once landed.
- `org-protocol` — envelope, snapshot reuse and retention, freshness classes.
