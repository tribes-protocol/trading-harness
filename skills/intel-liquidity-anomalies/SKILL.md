---
name: intel-liquidity-anomalies
description: >-
  Market Intelligence detector for volume and liquidity anomalies with transparent, recorded
  thresholds — turnover spikes vs market cap, DEX pool churn and buy/sell imbalance, per-token
  trade-flow surges, and Hyperliquid order-book depth thinning. Handles: flagging where volume
  is out of proportion to liquidity, one-sided flow, activity spikes without matching wallet
  growth, and thin books on perps — written as observation artifacts with every threshold and
  raw value recorded. Call it during a Discovery pass after the trending scan, or on demand for
  one asset that needs an anomaly check. NOT for: the trending sweep itself (use
  intel-trending-scan); funding-rate or open-interest reads (use intel-funding-oi); pool and
  DEX research as the subject (use defi-analyst); one token's safety forensics (use
  token-analyst).
allowed-tools: bash read
---

# Intel: Liquidity Anomalies

## Identity

- Stable id: `intel-liquidity-anomalies` — owner: Market Intelligence. Invoked by: Discovery
  Agent.

## Purpose

Flag markets whose volume, flow, or book depth is out of proportion to their liquidity, as
`observation` artifacts whose anomaly rules are stated in the payload — every flag is
auditable: rule, threshold, and raw values recorded together. What counts as an anomaly is
defined below, not left to impression. This skill never labels an anomaly good or bad, never
ranks, and never proposes trades; a wash-trading suspicion is a labeled hypothesis, not a fact.

## Inputs

- Optional targets: coin symbols (Hyperliquid perps, with dex), token addresses + chains, or
  pool addresses + networks to check; when absent, the sweep starts from `market movers` and
  `onchain trending-pools`.
- The pass's all-dex snapshot path under `.tribes/org/snapshots/` (day-notional baselines for
  book checks), per the `org-protocol` reuse rule.
- Optional threshold tightenings from the requesting brief (tighten only — see Risk & safety).

## Outputs

One observation artifact `.tribes/org/observations/<UTC>-liquidity-anomalies.json` (envelope
per `org-protocol`), payload:

- `facts`: per-asset raw metrics (volumes, caps, reserves, buy/sell splits, book notionals),
  each traceable to a `sources[]` entry with provider, command, `source_ts` where present,
  `retrieved_at` stamped here, freshness class.
- `anomalies`: fired rules only — `{rule, threshold, observed, asset, sources}` — facts about
  the data, not judgments.
- `hypotheses`: labeled interpretations (e.g. "wash-trading suspicion: volume +250% with flat
  unique wallets").
- `gaps`: providers or targets that could not be checked.

No signals, no recommendations, no actions; promotion is Data Validation's job.

## Integration

- `tribes-cli market movers --duration 24h --out <file>` and `tribes-cli market price --ids
<csv> --out <file>` — flag candidates, then confirm market caps and 24h volumes per coin.
- `tribes-cli onchain trending-pools [--network <id>] --limit 20 --out <file>` — pool rows with
  volume_24h_usd, reserve_usd, buys_24h/sells_24h.
- `tribes-cli onchain pool --network <id> --address <pool> --out <file>` — single-pool confirm:
  per-window volumes and tx counts.
- `tribes-cli onchain pool-trades --network <id> --address <pool> --limit 300 --out <file>` —
  large-print detection (t is epoch ms).
- `tribes-cli token-data trade-data --addresses <csv> --chain <chain> --out <file>` — 24h
  aggregates incl. volume_24h_change_pct, unique_wallets_24h, last_trade_at.
- `tribes-cli token-data trade-history --address <addr> --time-frame 24h --chain <chain> --out
<file>` — windowed buy/sell USD totals (also 1h|4h|7d windows).
- `tribes-cli hyperliquid order-book --coin <coin> --depth 20 [--dex <dex>] --out <file>` — L2
  snapshot; levels are `{px, sz, n}` per side.
- Baselines: the shared all-dex snapshot (day notional volume per perp). Envelope and
  freshness: `org-protocol`.

## Preconditions

- Session-start recovery pass already ran; directories exist (`mkdir -p` on first use).
- All-dex snapshot available or pulled once for this pass (`org-protocol` budget rule).
- Provider keys as configured; key-not-set is a recorded gap, not a workaround.

## Procedure

1. Stamp retrieval time (`date -u +%Y-%m-%dT%H:%M:%SZ`); collect targets (given, or from
   `market movers` + `onchain trending-pools`).
2. Pull the metrics per target with `--out` files: `market price` for cap/volume confirms,
   `onchain pool` + `pool-trades` for pools, `token-data trade-data`/`trade-history` for
   tokens, `hyperliquid order-book` for perps.
3. Apply the anomaly rules. Defaults (recorded verbatim in every artifact):

   | Rule           | Default trigger                                                                                         |
   | -------------- | ------------------------------------------------------------------------------------------------------- |
   | turnover       | volume_24h_usd / market_cap_usd ≥ 0.5 (both fields confirmed via `market price`)                        |
   | pool churn     | pool volume_24h_usd / reserve_usd ≥ 3 with reserve_usd ≥ $50k                                           |
   | flow imbalance | buy or sell share ≥ 70% of windowed USD volume (`trade-history`) or of tx counts (`pool` buys/sells)    |
   | activity spike | trade-data volume_24h_change_pct ≥ +200%; flat/down unique_wallets_24h adds a wash-trading hypothesis   |
   | book thinning  | at depth 20: one side's notional < 40% of the other, or both sides' total < 1% of snapshot day notional |

4. For each fired rule, record `{rule, threshold, observed, asset}` plus the exact source
   commands; for near-misses worth watching, record a labeled hypothesis, never a fired flag.
5. Assemble and atomically write the observation; hand off to Data Validation and track the
   ack sidecar.

## Validation

- Every fired anomaly shows rule + threshold + observed raw values + sources — reproducible by
  Validation from the cited `--out` files.
- Timestamps normalized to UTC ISO in the envelope (providers mix epoch ms, epoch s, and
  no-timestamp payloads — `retrieved_at` is always stamped here).
- Freshness: `live` for order-book and snapshot baselines, `recent` for 24h aggregates.
- No judgment words in `facts`/`anomalies`; suspicions only in `hypotheses`.

## Risk & safety

- Read-only; never an order-mutating command, never a recommendation.
- Thresholds may be tightened per run; loosening a default requires the Intelligence Lead's
  note in the artifact — silent loosening is forbidden.
- An anomaly is not an opportunity claim: manipulation, delistings, and stale pools fire the
  same rules. Say so in the hypothesis when relevant.
- NEVER place credentials or bearer tokens in any artifact.

## Failure & retry

- Non-auth provider failure: retry once, then record the target in `gaps` and continue.
- Auth failure: `tribes-cli login` once, retry once, else stop and report.
- Empty result (e.g. no pool trades): widen the window or limit once; if still empty, record
  the fact — empty is data, not an error.
- Run states: `complete`, `partial` (gaps listed), `failed` (nothing checkable — no artifact;
  report to the Intelligence Lead).

## Timeouts & rate limits

- Single fast reads; the default 120 s bash timeout suffices — none of these commands need
  more.
- `order-book` is a per-coin call: check only flagged perps, not the whole venue. Reuse the
  pass snapshot for baselines; never re-sweep. Cap `pool-trades` pulls at the flagged pools.

## Observability

- Raw pulls under `.tribes/org/snapshots/` via `--out`; the observation artifact cites them.
  Artifact id: `<UTC compact>-liquidity-anomalies`.

## Escalation

- Happy path: observation → Data Validation (`validate-cross-check`, `validate-contradictions`
  when providers disagree on the same metric).
- Provider failure or systematically absurd values (negative reserves, zero-cap majors):
  Intelligence Lead → Engineering work order (`eng-triage`).

## Example

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
tribes-cli onchain trending-pools --network solana --limit 20 --out .tribes/org/snapshots/20260730T101500Z-trending-pools.json
tribes-cli token-data trade-data --addresses <addr1>,<addr2> --chain solana --out .tribes/org/snapshots/20260730T101500Z-trade-data.json
tribes-cli hyperliquid order-book --coin ETH --depth 20 --out .tribes/org/snapshots/20260730T101500Z-eth-book.json
```

Success: `observations/20260730T101502Z-liquidity-anomalies.json` in state `observation` — two
fired rules (pool churn 4.2 vs threshold 3; activity spike +310% with flat wallets, plus its
wash-trading hypothesis), one book check clean and recorded as a fact, thresholds embedded,
four `sources[]` entries.

## Acceptance

- [ ] Every fired anomaly carries rule, threshold, observed values, and sources.
- [ ] Thresholds recorded in the artifact; any loosening attributed to the Intelligence Lead.
- [ ] Facts, anomalies, and hypotheses kept in separate payload fields.
- [ ] Snapshot baselines reused; per-coin calls limited to flagged targets.
- [ ] Artifact written atomically; ack from Data Validation tracked.

## Related skills

- `intel-trending-scan` — the sweep that feeds this pass its default targets.
- `intel-funding-oi` — funding and open-interest companion pass.
- `intel-derivatives-posture` — positioning proxies built on the same snapshots.
- `validate-cross-check` — reproduces and promotes (or rejects) these observations.
- `validate-contradictions` — where cross-provider metric disagreements go.
- `defi-analyst` — pool and DEX research outside the org envelope.
- `org-protocol` — envelope, ids, freshness classes, atomic writes.
