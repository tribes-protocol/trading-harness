---
name: intel-trending-scan
description: >-
  Market Intelligence discovery sweep of what is moving across crypto, securities, and
  commodities — CoinGecko movers/global/categories, BirdEye trending, the asset router's
  trending views, Marketstack ticker resolution, and the pass's shared Hyperliquid all-dex
  snapshot for HIP-3 stock and commodity perps. Handles: unscoped "what is moving" passes under
  the AGENTS.md cross-asset guardrail, provider-attributed trending facts, and explicit gap
  notes for classes with no data — all written as observation artifacts. Call it at the start of
  a Discovery pass, before any ranking or validation. NOT for: ranking or prioritizing the
  candidates (use intel-opportunity-rank); volume/liquidity anomaly detection (use
  intel-liquidity-anomalies); one token's deep-dive (use token-analyst); interactive trending
  questions outside the org (use alpha-scout).
allowed-tools: bash read
---

# Intel: Trending Scan

## Identity

- Stable id: `intel-trending-scan` — owner: Market Intelligence. Invoked by: Discovery Agent.

## Purpose

Produce the department's raw "what is moving" picture as an `observation` artifact covering all
three asset classes, so the Intelligence Lead and Data Validation start every cycle from
provider-attributed facts rather than impressions. This skill records what providers report as
trending — it never ranks candidates, never scores them, never proposes trades, and labels
every interpretation as hypothesis. Ranking belongs to `intel-opportunity-rank`; promotion
belongs to Data Validation.

## Inputs

- Optional scope: an asset-class restriction, ONLY when the requesting brief explicitly scoped
  it — otherwise the cross-asset guardrail applies and all three classes are swept.
- Optional overrides: movers duration (1h|24h|7d), per-list limits, chains to sweep for
  on-chain trending (default solana; add others explicitly).
- The path of this pass's all-dex snapshot under `.tribes/org/snapshots/` when one exists
  (reuse rule per `org-protocol`).
- No upstream artifacts required — this skill starts the chain at state 1.

## Outputs

One observation artifact `.tribes/org/observations/<UTC>-trending-scan.json` (envelope per
`org-protocol`), payload:

- `facts`: per-class row sets exactly as providers returned them (crypto / securities /
  commodities), each traceable to a `sources[]` entry with provider, command, `source_ts`
  where the payload carries one, `retrieved_at` stamped by this skill, and freshness class.
- `hypotheses`: labeled interpretations (e.g. "rotation into AI category"), never mixed into
  facts.
- `gaps`: providers or classes with no data this pass, stated plainly.

No signals, no recommendations, no actions — those are later states owned by other roles.

## Integration

- `tribes-cli market movers --duration 24h --out <file>` — CoinGecko gainers/losers (also
  1h|7d|14d|30d|60d|1y windows; no limit flag).
- `tribes-cli market global --out <file>` and `tribes-cli market categories --limit 50 --out
<file>` — market backdrop and category rotation.
- `tribes-cli token-data trending --chain <chain> --limit 20 --out <file>` — BirdEye on-chain
  trending; default chain is solana, pass `--chain` explicitly per swept chain.
- `tribes-cli asset trending --space onchain --limit 20 --out <file>` and `--space coins` —
  capability router with provider fallback; the response names which provider answered.
- `tribes-cli stocks search --query <name> --limit 10` — Marketstack ticker resolution for
  securities names surfaced by the snapshot or elsewhere.
- Shared snapshot: `tribes-cli hyperliquid list-assets --all-dexes --out
.tribes/org/snapshots/<UTC>-all-dexes.json` — REUSED within its `live` window, never
  re-pulled per role; its markPx-vs-prevDayPx changes and day notional volumes are the
  securities and commodities trending source (HIP-3 perps on named dexes).
- Envelope, ids, freshness classes, atomic writes: `org-protocol`.

## Preconditions

- The session-start recovery pass already ran (`org-protocol`); this skill never substitutes
  for it.
- `mkdir -p .tribes/org/observations .tribes/org/snapshots` on first use.
- Provider keys as configured on this box; a key-not-set error is a recorded capability gap,
  never a retry loop.
- If this pass already produced a trending-scan observation that was not rejected, STOP and
  reuse it — one sweep per pass.

## Procedure

1. Stamp retrieval time: `date -u +%Y-%m-%dT%H:%M:%SZ`.
2. Snapshot: reuse the pass's all-dex snapshot if within its `live` window; otherwise pull it
   once with `--out` into `snapshots/`.
3. Crypto sweep: `market movers` (24h; add 1h only when volatility warrants a second pull),
   `market global`, `market categories`, `token-data trending` per swept chain, `asset
trending` in both spaces. Every pull uses `--out` into `snapshots/`.
4. Securities sweep: extract stock-dex perp rows from the snapshot; compute 24h change from
   markPx vs prevDayPx; note day notional volume; resolve unfamiliar names with `stocks
search`. State plainly: Marketstack has no movers or live-quote sweep (EOD candles only), so
   venue perp marks are the freshest securities read.
5. Commodities sweep: same snapshot extraction for commodity-dex perp rows.
6. Assemble the observation: facts per class (verbatim provider rows, trimmed to the swept
   limits), hypotheses labeled, gaps listed — a class with a down provider still gets its
   section with the gap stated.
7. Write the artifact atomically (tmp then mv), one `sources[]` entry per command actually run.
8. Hand off to Data Validation; no `<id>.ack.json` sidecar means not delivered — follow up or
   escalate per the charter.

## Validation

- Three class sections present (or a scope note naming who scoped the request), each non-empty
  or carrying an explicit gap.
- Every fact row traceable to a `sources[]` entry; `retrieved_at` stamped on every source —
  several trending payloads (BirdEye trending, CoinGecko movers/categories) carry no as-of
  field of their own.
- Freshness classes assigned: `live` for the venue snapshot, `recent` for trending, mover, and
  category lists.
- No rank, score, weight, or recommendation field anywhere in the payload.

## Risk & safety

- Read-only: this skill never runs an order-mutating command, never sizes, never recommends.
- Provider rank order (BirdEye rank, CoinGecko search popularity) is recorded as a fact about
  the provider, never presented as the org's own ranking.
- Interpretation lives only in `hypotheses`, labeled. NEVER place credentials or bearer tokens
  in any artifact.

## Failure & retry

- Non-auth provider failure: retry once, then record the provider in `gaps` and continue with
  the remaining classes/providers (`org-protocol`).
- Auth failure: `tribes-cli login` once, retry the command once, else stop and report.
- Key-not-set: capability unavailable on this box — record in `gaps`; do not retry or work
  around.
- Explicit terminal states of a run: `complete`, `partial` (gaps listed in the artifact), or
  `failed` (all providers down — write NO artifact; report to the Intelligence Lead).

## Timeouts & rate limits

- All commands are single fast reads; the default 120 s bash timeout suffices — none need more.
- Budget: ONE all-dex sweep per pass (reused), one movers/categories/trending pull per provider
  per pass. There is no caching layer below this skill — reuse the `--out` files, never re-pull
  inside a pass.

## Observability

- Raw pulls live under `.tribes/org/snapshots/` via `--out`; the observation artifact cites
  them and is itself the log. Artifact id: `<UTC compact>-trending-scan`.

## Escalation

- Happy path: observation → Data Validation (`validate-cross-check` chain) for promotion or a
  recorded rejection.
- Provider errors blocking a class: Intelligence Lead → Engineering work order (`eng-triage`);
  trading on the affected data pauses until Validation clears it (charter escalation path 1).

## Example

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
tribes-cli hyperliquid list-assets --all-dexes --out .tribes/org/snapshots/20260730T100000Z-all-dexes.json
tribes-cli market movers --duration 24h --out .tribes/org/snapshots/20260730T100000Z-movers.json
tribes-cli market categories --limit 50 --out .tribes/org/snapshots/20260730T100000Z-categories.json
tribes-cli token-data trending --chain solana --limit 20 --out .tribes/org/snapshots/20260730T100000Z-bird-trending.json
```

Success: `observations/20260730T100002Z-trending-scan.json` in state `observation` — facts for
all three classes (crypto movers + categories + on-chain trending; stock and commodity perps
extracted from the snapshot), two labeled hypotheses, one gap ("BirdEye base-chain trending
empty"), five `sources[]` entries each with retrieval timestamps and freshness classes.

## Acceptance

- [ ] Cross-asset guardrail honored: three classes covered, or the scope recorded.
- [ ] Every fact carries provider + command + retrieval timestamp + freshness class.
- [ ] All-dex snapshot reused, not re-pulled, within its window.
- [ ] No ranking, no scoring, no trade language; hypotheses labeled.
- [ ] Artifact written atomically and handed to Data Validation (ack tracked).

## Related skills

- `intel-opportunity-rank` — ranks what this scan and its sibling passes observed.
- `intel-liquidity-anomalies` — the volume/liquidity anomaly companion pass.
- `intel-funding-oi` — funding and open-interest companion pass.
- `validate-cross-check` — first gate on the observations this skill writes.
- `alpha-scout` — interactive trending discovery outside the org envelope.
- `market-strategist` — market-wide aggregates for user conversations.
- `org-protocol` — envelope, ids, freshness classes, atomic writes.
