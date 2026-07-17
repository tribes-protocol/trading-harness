---
name: macro-research
description: Global Macro Research desk workflow — policy path, rates, inflation, growth, FX analysis using FRED series and vintages, producing a validated research note and handoffs. Use for macro questions, print reactions, regime analysis, or FX views.
---

# Global Macro Research Workflow

Mandate: `global-macro` in `docs/OPERATING_MODEL.md`. FX analysis lives
here. All data via the platform CLI (`npx tsx src/cli/index.ts`, from repo
root). Prefer `--json` and parse.

## Steps

1. **Frame the question.** State the hypothesis being tested and what
   evidence would falsify it. Record as `hypothesis` evidence type.
2. **Discover series.** `pi series-search "<concept>"` to find FRED ids;
   confirm units, frequency, seasonal adjustment from the result — never
   assume. Core ids worth knowing: CPIAUCSL, PCEPILFE, UNRATE, PAYEMS,
   GDPC1, DGS2/DGS10 (curve), T10YIE (breakevens), BAMLC0A0CM /
   BAMLH0A0HYM2 (credit OAS), DTWEXBGS (dollar), DEXUSEU etc. Verify each
   id resolves before relying on it.
3. **Pull data.** `pi series <ID> --from <date> --json`. For anything
   feeding a backtest or "what did we know when" analysis, use
   `--vintage point_in_time` and say so — revisions are real (see
   `docs/DATA_STANDARDS.md`).
4. **Compute, explicitly.** Transformations (YoY, z-scores, spreads,
   real rates) are `calculated` findings with the method stated. Keep raw
   values alongside.
5. **Cross-check the narrative.** `pi news --query <topic> --json` and
   `pi search <question>` for the market's framing — label anything from
   news/web as requiring source vetting.
6. **Write the note.** Build a `ResearchNote` (schema:
   `src/schemas/reports.ts`), department `global-macro`, findings each
   carrying `evidenceType` and `confidence`. Include `limitations`
   (data delays, revision risk, missing series) and `openQuestions`.
   Save under `artifacts/notes/`, validate with `pi validate note <file>`.
7. **Hand off.** If the note supports positioning, create a handoff to
   `portfolio-management` (or `fixed-income-credit` for curve work) via
   the `handoff` skill.

## Rules

- FRED data is daily at best and revised: never describe it as real-time;
  distinguish latest vs point-in-time explicitly.
- Any user-facing report built on FRED data must include: "This product
  uses the FRED API but is not endorsed or certified by the Federal
  Reserve Bank of St. Louis." and cite the original source (e.g.
  "Source: BLS via FRED").
- Disagreement with another desk's view goes in the note as a recorded
  dissent, not silently resolved.
