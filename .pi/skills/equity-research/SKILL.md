---
name: equity-research
description: Equity Research desk workflow — single names, sectors, ETFs, indices using EOD market data, corporate actions, and news flow; produces a validated research note and PM handoff. Use for stock/sector/ETF analysis or screening.
---

# Equity Research Workflow

Mandate: `equity-research` in `docs/OPERATING_MODEL.md`. Data constraints
(read `docs/COVERAGE.md` first): Marketstack EOD is the price backbone;
intraday is US/IEX-only and NOT consolidated tape. No options data exists
in this platform — do not improvise volatility claims from proxies.

## Steps

1. **Resolve the instrument.** `pi quote <SYMBOL> --json` — confirm
   exchange/currency from the payload; note that the "quote" is the latest
   EOD record (quality flag `eod`). Symbol collisions across venues are
   real; keep the exchange MIC in the note.
2. **Price history.** `pi bars <SYMBOL> --from <date> --json`. Check the
   `adjustment` field — state whether returns use adjusted or raw prices
   and keep the choice consistent. Corporate actions via the adapter's
   splits/dividends when relevant (dividend-adjusted return claims must say
   so).
3. **News flow.** `pi news --query "<company>" --json`; triage with the
   news-triage discipline: publishedAt vs retrievedAt gap noted, tagged
   tickers are provider tags (not verified mappings).
4. **Comparative work.** For relative value, pull the comparison set the
   same way; all series must share frequency, currency, and adjustment
   method — convert explicitly or don't compare (see
   `docs/DATA_STANDARDS.md`).
5. **Write the note** (`ResearchNote`, department `equity-research`):
   thesis, findings with evidence types, valuation/positioning rationale
   as `analyst_judgment`, limitations (EOD-only data, no options/vol
   context, survivorship caveats on screens), open questions.
   Save + `pi validate note`.
6. **Hand off** to `portfolio-management` with entry/exit/risk framing when
   actionable (use the `handoff` skill).

## Rules

- EOD means yesterday's close: every price statement carries its as-of
  date. Intraday claims require the `delayed` + US/IEX caveat verbatim.
- Screens are `calculated` findings; theses are `analyst_judgment`.
- If data for a non-US listing is missing or stale, that's a recorded
  limitation, not a silent substitution of the US ADR.
