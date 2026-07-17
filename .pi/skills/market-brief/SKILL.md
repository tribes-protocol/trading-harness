---
name: market-brief
description: Cross-asset morning brief — macro prints, market moves, news triage, and on-chain highlights assembled from desk inputs with quality flags preserved; the flagship daily workflow. Use for "what happened / what matters today" requests.
---

# Cross-Asset Market Brief

A daily synthesis exercising the full operating model: desk inputs →
risk overlay → one brief with honest data labels. This skill is the
single-agent workflow and works on any harness. (On Claude Code only,
a fully parallel multi-agent variant exists at
`.claude/workflows/morning-brief.js`, runnable via its Workflow tool.)

## Steps

1. **Macro prints.** Recent releases relevant to the day
   (`pi series` on the majors; check `lastUpdated` to see what actually
   printed). New prints are `observed`; implications are
   `analyst_judgment`.
2. **Market moves** (all EOD-honest): index/ETF proxies via
   `pi quote`/`pi bars` (labeled "as of <date> close"); equity
   cross-checks via `pi quote <sym> --cross-check` where a second equity
   provider exists. Crypto majors via `pi token price` (timestamped);
   cross-check tokens with a chain+address by pulling two providers
   (`--id <coingecko-id>` vs `--chain/--address`) — native BTC has only
   one reference source on this platform, so say that rather than
   fabricating a cross-check.
3. **News triage.** Top material items via the news-triage discipline —
   mechanism + credibility per item, not headline soup.
4. **On-chain highlights.** Notable labeled-flow moves (model estimates,
   internal-only) and any venue/stablecoin anomalies.
5. **Risk overlay.** Read open `LimitBreach` artifacts and yesterday's
   risk notes; the brief surfaces open breaches and conditions falling
   due — a brief that hides risk state is defective.
6. **Assemble.** One `ResearchNote` (department `news-events` or the
   requesting desk) with sections per asset class, every number carrying
   as-of + quality context, dissents/disagreements preserved, and a
   "coverage gaps today" line (what we could not observe and why).
7. **Route.** Handoffs for anything actionable (desk follow-ups, risk
   escalations).

## Rules

- The brief's honesty bar: a reader can reconstruct every number's
  source, time, and quality from the artifact.
- No "markets are up" without which market, which close, which currency.
- Gaps are stated ("no options/vol data on this platform") — never
  papered over.
