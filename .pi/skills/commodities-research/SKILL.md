---
name: commodities-research
description: Commodities Research desk workflow — spot/index-level analysis using FRED series (and plan-gated Marketstack data); produces validated notes with the futures-curve gap stated. Use for energy, metals, ags questions.
---

# Commodities Research Workflow

Mandate: `commodities` in `docs/OPERATING_MODEL.md` (standalone desk; FX
deliberately lives with macro). Coverage honesty (`docs/COVERAGE.md`): spot
and index series via FRED; Marketstack `/commodities` exists but is
plan-gated and rate-limited to 1 call/minute. **No futures curves or term
structure** — carry/roll analysis cannot be first-sourced here; that gap is
stated in every note.

## Steps

1. **Series discovery.** `pi series-search "<commodity>"` — WTI
   (DCOILWTICO), Brent (DCOILBRENTEU), Henry Hub (DHHNGSP), gold
   (fix series), industrial metals PPI/global price indices, ag price
   indices. Confirm units (level vs index) before comparing anything.
2. **Fundamental context.** Inventories/production where FRED carries them;
   otherwise `pi search` for primary sources (EIA, USDA releases) and cite
   the actual source — web-derived numbers get `hypothesis`/lower
   confidence until confirmed against the primary release.
3. **Cross-asset links.** Dollar (DTWEXBGS) and real-rate context from the
   macro desk's latest note (link, don't fork).
4. **Write the note** (`ResearchNote`, department `commodities`): findings
   with evidence types; the futures-curve/term-structure gap goes in
   `limitations` verbatim; positioning implications are
   `analyst_judgment`.
5. **Hand off** to `portfolio-management`; macro-relevant supply shocks
   also to `global-macro`.

## Rules

- Spot-index moves are not roll-adjusted returns — never present them as
  investable performance.
- Seasonality claims require the seasonal-adjustment status of the series
  to be stated.
- FRED attribution + no-disk-cache rules apply.
