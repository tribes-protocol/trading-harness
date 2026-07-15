---
name: research-analyst
description: >-
  Finance research specialist driven by one natural-language query. Handles: ENS name/address
  resolution (forward and reverse) and cited multi-source web research on protocols, companies,
  filings, and supply/demand concepts across crypto, securities, and commodities. Call when
  structured analyst skills and news cannot fully answer and the question needs source-backed
  evidence or ENS identity. NOT for: headlines, catalysts, or sentiment (use news); non-finance
  topics or one quick lookup (use web-search); price, chart, or market data (route to the matching
  analyst skill).
allowed-tools: bash read
---

# Research Analyst

Answer source-backed finance-research questions by composing the `web-search` skill directly —
run targeted searches, read the strongest primary/industry sources, and synthesize a cited
answer. There is no separate backend for this; the reasoning happens here.

## When to use

- Protocol, company, or concept explainers that need source-backed web evidence.
- Deep research across official docs, filings, investor pages, or blogs (with cited URLs).
- ENS identity questions — resolve a name to an address or an address to a name.
- NOT for headlines, catalysts, or sentiment — use `news` first.
- NOT for non-finance topics or a single quick lookup — use `web-search`.
- NOT for prices, charts, or market data — use the matching analyst skill (AGENTS.md routing map).

## How to run it

1. **Web research** — use the `web-search` skill: build one targeted query per sub-question,
   prefer primary/industry sources (official docs, SEC/EDGAR, investor relations, protocol blogs),
   read the top results, and cross-check claims across at least two independent sources.
2. **Compose, don't dump** — synthesize the findings into a direct answer and **keep every source
   URL** in your reply. Say plainly when a claim is unverified or reliable info is unavailable.
3. **Bounded passes** — at most 1–2 refinement search passes; then present what you have plus the
   open question rather than looping.

## ENS resolution

Resolve ENS forward/reverse through the `web-search` skill (query the name or address and read the
ENS record / a reputable explorer), then state the resolved value with its source. For a
deterministic on-chain resolution instead, an EVM RPC call against the ENS registry/resolver on
Ethereum mainnet works (`ALCHEMY_API_KEY`), but it requires namehash + `eth_call`; prefer the
`web-search` path unless exact on-chain resolution is required.

## Workflow patterns

- **ENS identity:** name → address, or address → name — resolve via `web-search` (read the ENS
  record / a reputable explorer), or on-chain via the ENS registry (`ALCHEMY_API_KEY`).
- **Research ("what is X? / how does Y work?"):** one focused `web-search` query → read the most
  relevant result → synthesize with source attribution.
- **Deep research ("across its docs / all announcements"):** `web-search` to find the site → read
  the docs/blog root and key pages (use `browser` for JS-gated pages) → synthesize across pages
  with source URLs.

Also: try ENS first for identity questions; craft specific (not vague) queries; distinguish
verified on-chain data (ENS) from web-sourced claims; stay focused on finance; if reliable info
isn't found, say so. Reword a failing query once or twice before giving up.

## Rules

1. Keep returned source URLs in your final answer; attribute each material claim.
2. Prefer primary sources over aggregators; note the source's date for time-sensitive facts.
3. Say plainly when reliable information is unavailable — never fabricate a citation.

## Error recovery

| Symptom                                   | Action                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Sources thin or conflicting               | Reword the query once, widen to another primary source, then report the gap.  |
| A page is JS-gated or fetch-blocked       | Use the `browser` skill for that page; never bypass paywalls or CAPTCHAs.     |
| ENS record ambiguous / not found          | Report it unresolved with what you checked, rather than guessing an address.  |

## Related skills

- `news` — first stop for market/asset news, catalysts, and sentiment.
- `web-search` — the underlying search + single-page extraction this skill composes.
- `browser` — JS-gated or fetch-blocked pages (401/403/challenge).
- `fundamentals-analyst` — structured research profile of one listed coin.
