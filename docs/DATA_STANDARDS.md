# Data Standards

All shapes are defined in `src/schemas/` (zod, TypeScript strict) and
versioned via `SCHEMA_VERSION` (semver; bump on breaking change). Persisted
artifacts record the version they were written with.

## Provenance (mandatory on every dataset)

Every payload extending `SourcedSchema` carries:

| Field | Meaning |
|---|---|
| `source.provider` / `source.endpoint` | who supplied it and from where |
| `source.requestedAt` / `receivedAt` | request timestamps (UTC ISO-8601) |
| `source.freshness` | `realtime · delayed · eod · historical · unknown` |
| `source.cacheHit` | whether this came from a cache |
| `additionalSources` | providers used for merge/cross-check |
| `quality` | quality flags (below) |
| `lineage` | explicit, reproducible transform steps |

## Quality flags

`realtime, delayed, eod, stale, estimated, preliminary, revised, cached,
incomplete, provider_disagreement, fallback_source, converted, adjusted,
unverified`

Rules:
- Delayed/EOD/cached/estimated data must carry the matching flag; it is
  never presented as real-time.
- Fallback routing stamps `fallback_source` plus a lineage step naming the
  failed primaries.
- Cross-provider spread beyond tolerance stamps `provider_disagreement`;
  all views are preserved — the platform never averages disagreement away.

## Epistemic labels

Findings, signals, and report statements carry an `evidenceType`:
`observed | calculated | model_estimate | hypothesis | assumption |
analyst_judgment`. Provider-proprietary analytics (sentiment scores,
smart-money labels) default to `model_estimate`.

## Identifier discipline

- Equities: platform symbol + exchange MIC + currency; provider-native ids
  kept side by side in `providerIds` — never silently joined.
- Tokens: chain + contract address (or provider-native id). Symbols are
  ambiguous and are never a join key.
- Macro: provider-native series id (e.g. FRED `CPIAUCSL`); observations may
  carry vintage windows (`realtimeStart/End`) — point-in-time and latest
  vintages are never mixed (`vintage` field is explicit).
- Missing values are explicit (`value: null`), never dropped or zero-filled.
- Raw integer token amounts are decimal strings (`rawAmount`), never floats.

## Time

- All timestamps UTC ISO-8601; bar series record the session timezone.
- Frequencies come from one canonical enum (`src/core/time.ts`).
- Adjustment methodology on price series is explicit
  (`raw | split_adjusted | split_dividend_adjusted | unknown`).

## Auditability artifacts

- `ResearchNote` — findings with evidence types, sources, methods,
  assumptions, limitations, open questions.
- `Handoff` — from/to department, timestamp, data sources, methods,
  findings, confidence, assumptions, limitations, unresolved questions,
  recommended next action, dissents (verbatim).
- `IcMemo` — sponsor thesis, independent risk view, compliance view,
  decision, conditions, dissents, review date.

Validate any artifact with `pi validate handoff|note|ic-memo <file>`.
