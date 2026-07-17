---
name: fi-credit-research
description: Fixed-Income & Credit Research desk workflow — curves, carry, spreads, credit cycle using FRED reference series; produces validated notes. Use for rates/credit questions, curve analysis, or spread work.
---

# Fixed-Income & Credit Research Workflow

Mandate: `fixed-income-credit` in `docs/OPERATING_MODEL.md`. Coverage
honesty first (`docs/COVERAGE.md`): this platform has *reference-series*
level FI data (FRED) — no bond-level terms & conditions, no dealer runs,
no new-issue calendar. Analysis is macro-credit, not security selection.

## Steps

1. **Curves.** Treasury constant-maturity series (DGS1MO…DGS30); compute
   slopes/butterflies as `calculated` findings with the exact series named.
   Real yields via DFII series; breakevens via T10YIE/T5YIE.
2. **Credit.** ICE BofA OAS families (BAMLC0A0CM investment grade,
   BAMLH0A0HYM2 high yield, and rating/sector sub-indices via
   `pi series-search "BAML"`). Spread levels vs history: state the
   lookback and distribution method.
3. **Cycle context.** Issuance/lending standards proxies (SLOOS series),
   default-adjacent indicators, policy path from the macro desk's latest
   note (link it — don't re-derive silently).
4. **Vintage discipline.** Anything feeding backtests or "as known at the
   time" claims uses `--vintage point_in_time`.
5. **Write the note** (`ResearchNote`, department `fixed-income-credit`):
   findings with evidence types; limitations must name the structural gaps
   (index-level only, EOD, no single-name credit data).
6. **Hand off** to `portfolio-management`; curve/policy interactions also
   to `global-macro`.

## Rules

- Index OAS is not a tradable price — frame conclusions at the
  allocation/positioning level, not security level.
- FRED attribution + no-disk-cache rules apply (see macro-research skill).
- Rate expectations are `analyst_judgment` unless derived from market
  pricing you actually pulled (then `calculated`, with method).
