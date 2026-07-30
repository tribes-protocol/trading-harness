---
name: validate-cross-check
description: >-
  Data Validation skill that verifies an observation's market-data facts against a second,
  independent provider before any signal promotion — primary read through the asset capability
  router, second read through a provider-named group, deviation judged by asset-class
  thresholds. Handles: cross-provider price/candle verification, provider-independence checks
  via the router's source envelope, and the single-live-source degradation to Hyperliquid
  internal coherence (mark vs oracle vs impactPxs) with a mandatory single-source flag. Call it
  on every observation Data Validation intends to promote. NOT for: staleness verdicts (use
  validate-freshness); sign-flip and wash-trade scans (use validate-contradictions); confidence
  or writing the validated-signal (use validate-signal-score).
allowed-tools: bash read
---

# Validate: Cross-Check

## Identity

- Stable id: `validate-cross-check` — owner: Market Intelligence / Data Validation. Invoked
  by: the Data Validation role (`.agents/intel-validation.md`) on every promotion candidate.

## Purpose

Confirm that a market-data fact cited by an observation is reproduced by a second provider
that had no hand in producing it, within a deviation threshold set by asset class — or, when
only one live source exists, that the single source is internally coherent. This skill
measures and records; it never promotes, rejects, scores, or edits the observation.

## Inputs

Required: one `observation` artifact (`.tribes/org/observations/<id>.json`) naming the asset
(identifier + asset class) and the fact(s) to verify (price, latest candle close, volume);
the observation's own provider P0 from its `sources[]`. Optional: the pass's all-dex snapshot
(`.tribes/org/snapshots/<UTC>-all-dexes.json`) to avoid a re-sweep; a `validate-freshness`
report proving the facts are worth checking.

## Outputs

A cross-check block, returned in-run for `validate-signal-score` to embed into the signal's
`checks[]` and payload:

- Per fact: `verdict` (`match` | `investigate` | `contradiction` | `single-source-coherent` |
  `single-source-incoherent`), `deviation_pct`, `threshold_pct`, `asset_class`.
- Both reads recorded as org-protocol sources — provider, command, `source_ts`,
  `retrieved_at`, freshness class — retrieval stamped with `date -u +%Y-%m-%dT%H:%M:%SZ`.
- `single_source: true|false` — mandatory; when true it caps confidence downstream.

Labeling: the two quotes and deviation are facts; the verdict is a validation judgment. This
skill emits no recommendation and takes no action; state changes belong to
`validate-signal-score`. Explicit failure states are listed under Failure & retry.

## Integration

- Primary read: `tribes-cli asset price` / `tribes-cli asset candles … --out` — the
  capability router. Its envelope reports `source` (who answered) and `attempted[]` (why
  others were skipped); read the `asset-data` skill for the routing rules.
- Second read, from a provider different from BOTH P0 and the router's `source`:
  - `tribes-cli market price --ids <coingecko-id>` (CoinGecko)
  - `tribes-cli token-data price --addresses <addr> --chain <chain>` (BirdEye)
  - `tribes-cli stocks candles --symbol <TICKER> --limit 5 --out <file>` (Marketstack EOD)
  - `tribes-cli hyperliquid list-assets --dex <dex> --out <file>` (venue marks; reuse the
    all-dex snapshot within its live window per `org-protocol` instead of re-sweeping)
- Identifier mapping across id spaces: `tribes-cli asset search --query <name>` and
  `tribes-cli asset profile` (links contract address ↔ CoinGecko id) — never assume a
  contract and a coin id are the same asset without this mapping.
- Venue-native perp candles for candle facts: `tribes-cli hyperliquid candles` (org adapter
  per the charter's closed-gaps table).

## Preconditions

- The observation's facts are fresh per `validate-freshness` (stale facts are rejected
  upstream, not cross-checked).
- Both reads for one fact land within a 5-minute window of each other — otherwise the
  deviation measures time, not providers.
- Provider-call budget available for this validation cycle (`org-protocol` budgets).

## Procedure

1. Read the observation; list the facts to verify, the identifier space, and P0.
2. Resolve the asset-class row (table below); map identifiers across spaces via
   `asset search`/`asset profile` when the second read lives in a different id space.
3. Primary read via `asset price`/`asset candles`; record the envelope's `source` as P1.
4. If P1 ≠ P0, the pair (observation value, P1 value) is already independent. If P1 == P0,
   take the second read from a provider-named group P2 ∉ {P0} and use (P1 value, P2 value).
5. Compute `deviation_pct = |a − b| ÷ ((a + b) / 2) × 100`; candle facts compare the closes
   of the latest fully aligned bar.
6. Verdict from the threshold table: ≤ match column → `match`; ≤ investigate column →
   `investigate`; above → `contradiction` (hand to `validate-contradictions` for the re-pull
   confirmation cycle).
7. Single-live-source path — when the attempted trail plus provider coverage show exactly one
   live source (typical for HIP-3 stock/commodity perps on named dexes, where Marketstack EOD
   is a divergent proxy, and for tokens indexed by a single provider): set
   `single_source: true` and run internal coherence on the venue row from `list-assets`:
   markPx vs oraclePx deviation ≤ 1.0% → coherent, > 3.0% → incoherent; impactPxs must
   bracket markPx (impact bid ≤ mark ≤ impact ask), violation → incoherent. For stock/
   commodity perps also record the Marketstack EOD close as an advisory reference — recorded,
   never gating, since divergence from dex marks is expected.
8. Write the cross-check block with both source stamps; save large raw pulls with `--out`
   under `.tribes/org/snapshots/`.

### Deviation thresholds by asset class

| Asset class                              | match ≤ | investigate ≤ | contradiction > |
| ---------------------------------------- | ------- | ------------- | --------------- |
| Majors (top-10 CoinGecko rank)           | 0.5%    | 1.5%          | 1.5%            |
| Listed alts (has a CoinGecko id)         | 1.0%    | 3.0%          | 3.0%            |
| Long-tail on-chain tokens                | 3.0%    | 10.0%         | 10.0%           |
| Stocks vs EOD reference                  | 1.0%    | 2.5%          | 2.5%            |
| HL perps vs spot reference (basis noted) | 1.0%    | 2.0%          | 2.0%            |

## Validation

- The compared pair is provider-independent (or the single-source flag is set) — verified
  from the envelope's `source`, never assumed.
- Both reads within the 5-minute window; both carry all four source fields.
- The threshold row matches the asset class actually resolved, not a guess.

## Risk & safety

- Read-only: no order-mutating command, no artifact edits (one writer per file — the verdict
  travels in this block, and only `validate-signal-score` stamps states).
- Never merge values from two providers into one number; report both.
- Budget: at most 4 provider calls per fact including identifier resolution; re-pull cycles
  belong to `validate-contradictions`, not here.

## Failure & retry

- Transient provider failure (429/5xx/timeout): retry once per `org-protocol`, then record
  `provider-failure` — the fact is unverified and cannot support promotion.
- `no-second-source`: no independent provider covers the asset → take the single-source path;
  never silently promote an unverified fact.
- `identifier-mismatch`: mapping across id spaces could not be confirmed → fail closed with
  the reason; do not compare unlike assets.
- `contradiction` is a recorded outcome, not an error — it routes to
  `validate-contradictions` for confirmation.

## Timeouts & rate limits

- All commands here are fast structured reads; the default 120 s bash timeout is sufficient.
- Reuse the pass's all-dex snapshot within its live window; never trigger a second sweep for
  a cross-check.

## Observability

- Raw pulls saved via `--out` under `.tribes/org/snapshots/<UTC>-crosscheck-<asset>.json`.
- The block itself is persisted inside the signal (or rejection) artifact that
  `validate-signal-score` writes — the artifact is the log per `org-protocol`.

## Escalation

- `contradiction` → `validate-contradictions` (re-pull confirmation), then
  `validate-signal-score` records the outcome.
- `provider-failure` persisting after retry → Intelligence Lead → Engineering work order
  (`eng-triage`); trading on the affected data pauses per the charter.

## Example

```bash
# observation 20260730T101500Z-weth-breakout cites BirdEye price 3421.5 for WETH
tribes-cli asset price --address 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 --chain ethereum
# envelope: source "birdeye" == observation provider → need an independent read
tribes-cli asset profile --address 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 --chain ethereum
tribes-cli market price --ids weth
```

Result block: `{"fact": "price_usd", "asset_class": "listed-alt", "values": {"birdeye":
3421.5, "coingecko": 3418.2}, "deviation_pct": 0.10, "threshold_pct": 1.0, "verdict":
"match", "single_source": false}` plus both source stamps (provider, command, `source_ts`,
`retrieved_at`).

## Acceptance

- [ ] Compared pair independent of the observation's provider (or single-source flag set with
      coherence checked).
- [ ] Deviation computed against the correct asset-class row; verdict + threshold recorded.
- [ ] Every read stamped provider + command + source_ts + retrieved_at.
- [ ] No promotion, rejection, or artifact edit performed here.

## Related skills

- `asset-data` — the capability router and its source/attempted envelope.
- `validate-freshness` — staleness verdicts that precede this check.
- `validate-contradictions` — re-pull confirmation of `contradiction` verdicts.
- `validate-signal-score` — embeds this block; owns promotion and rejection.
- `org-protocol` — envelope, freshness classes, budgets, snapshot reuse.
- `hyperliquid` — flag reference for venue reads.
