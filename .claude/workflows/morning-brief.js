export const meta = {
  name: 'morning-brief',
  description:
    'Cross-asset morning brief: parallel desk sweeps (macro, crypto, securities+commodities, news/odds) -> all-dex venue filter -> independent book-risk overlay -> strategize-template brief with dissents and coverage gaps preserved',
  whenToUse:
    'Daily "what happened / what matters" synthesis. Optional args: { focus: "topic emphasis" }. Output follows the strategize briefing template and appends the journal.',
  phases: [
    { title: 'Desk sweeps', detail: 'four desks in parallel' },
    { title: 'Venue filter', detail: 'all-dex tradability + quality on every candidate' },
    { title: 'Risk overlay', detail: 'independent book read; failure = DRAFT brief' },
    { title: 'Synthesis', detail: 'strategize template + journal append' },
  ],
}

const focus = args && args.focus ? `Special focus requested: ${args.focus}.` : ''

const DESK_SCHEMA = {
  type: 'object',
  required: ['desk', 'headline', 'items', 'coverageGaps'],
  properties: {
    desk: { type: 'string' },
    headline: { type: 'string', description: 'one sentence, the single most decision-relevant fact' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['statement', 'evidenceType', 'asOf', 'sources'],
        properties: {
          statement: { type: 'string' },
          evidenceType: {
            enum: ['observed', 'calculated', 'model_estimate', 'hypothesis', 'assumption', 'analyst_judgment'],
          },
          asOf: { type: 'string', description: 'honest as-of; EOD data reads "as of <date> close"' },
          sources: { type: 'array', items: { type: 'string' }, description: 'provider + command' },
          candidates: { type: 'array', items: { type: 'string' }, description: 'tickers/coins this item makes interesting' },
        },
      },
    },
    coverageGaps: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
}

const common = `You are a desk in the trading organization (docs/org/ORGANIZATION.md; envelope + evidence-type vocabulary per skills/org-protocol/SKILL.md). ${focus}
Use tribes-cli only (auth: run tribes-cli login once on 401 then retry once). Every item carries an evidence type, an honest as-of (stamp retrieval with date -u), and its source command. Provider model output (sentiment, smart-money labels) is model_estimate, never observed. Anything unavailable goes under coverageGaps — never improvised. 4-8 decision-relevant items. Return via StructuredOutput.`

phase('Desk sweeps')
const [macro, crypto, secCom, news] = await parallel([
  () =>
    agent(
      `${common} DESK global-macro per skills/macros/SKILL.md: run \`tribes-cli macros market\` — dollar, yields/curve, VIX, policy rate, CPI, gold, Brent. Null readings are stated plainly, never invented.`,
      { label: 'desk:macro', phase: 'Desk sweeps', schema: DESK_SCHEMA },
    ),
  () =>
    agent(
      `${common} DESK crypto per skills/intel-trending-scan/SKILL.md and skills/intel-smart-money/SKILL.md: \`tribes-cli market movers --duration 24h\`, \`market global\`, \`market categories --limit 30\`, \`smart-money netflow --limit 20\`, \`token-data trending\`. Name candidate coins in items[].candidates.`,
      { label: 'desk:crypto', phase: 'Desk sweeps', schema: DESK_SCHEMA },
    ),
  () =>
    agent(
      `${common} DESK securities+commodities per skills/stock-analyst/SKILL.md and skills/commodity-analyst/SKILL.md: securities movers derive from news context plus \`tribes-cli stocks search\`/\`stocks candles --symbol <t> --limit 30\` on candidates (freshest price is the latest daily close — label it "as of <date> close"); commodities via the commodity-analyst research path. Name candidates.`,
      { label: 'desk:securities', phase: 'Desk sweeps', schema: DESK_SCHEMA },
    ),
  () =>
    agent(
      `${common} DESK news+odds per skills/intel-news-collect/SKILL.md and skills/intel-event-catalysts/SKILL.md: \`timeout 300 tribes-cli news fetch --kind perp --coin BTC\` (mandatory >=120s bash timeout) for the market narrative; \`tribes-cli prediction search --query <relevant> --limit-per-type 10\` for event odds (odds are supporting evidence, never a standalone signal). Dated, attributable headlines only.`,
      { label: 'desk:news', phase: 'Desk sweeps', schema: DESK_SCHEMA },
    ),
])

const desks = [macro, crypto, secCom, news].filter(Boolean)
if (desks.length === 0) return { error: 'all desk agents failed — no brief produced' }
log(`${desks.length}/4 desks reported`)

phase('Venue filter')
const candidates = [...new Set(desks.flatMap((d) => d.items.flatMap((i) => i.candidates || [])))]
const venue = await agent(
  `Apply the AGENTS.md all-dex tradability and quality guardrail to these candidates: ${JSON.stringify(candidates)}. Run \`tribes-cli hyperliquid list-assets --all-dexes --out /tmp/all-dexes.json\` and \`list-assets --market spot\`; read EVERY dex section from the file (xyz FIRST — never judge from an unread section). For each candidate: tradable-now (dex, coin, referencePx, dayNtlVlm, openInterest, impactPxs evidence) or watchlist (why). isDelisted or missing/zero quality data = watchlist. Return via StructuredOutput.`,
  {
    label: 'venue-filter',
    phase: 'Venue filter',
    schema: {
      type: 'object',
      required: ['tradable', 'watchlist'],
      properties: {
        tradable: { type: 'array', items: { type: 'object', required: ['ticker', 'dex', 'evidence'], properties: { ticker: { type: 'string' }, dex: { type: 'string' }, evidence: { type: 'string' } }, additionalProperties: true } },
        watchlist: { type: 'array', items: { type: 'object', required: ['ticker', 'why'], properties: { ticker: { type: 'string' }, why: { type: 'string' } }, additionalProperties: true } },
      },
      additionalProperties: true,
    },
  },
)

phase('Risk overlay')
const riskOverlay = await agent(
  `You are the INDEPENDENT book-risk overlay for today's brief, per .agents/pm-exposure.md and .agents/pm-triggers.md (read both, plus skills/portfolio-exposure/SKILL.md and skills/portfolio-triggers/SKILL.md). Read the live book: \`tribes-cli wallet list\` then \`hyperliquid list-positions --address <addr> --all-dexes\`, \`list-open-orders --address <addr> --all-dexes\`, \`list-balances\`; read .tribes/org/positions/, .tribes/org/config/thresholds.json, and any armed triggers under .tribes/org/triggers/ if present. Assess the desk items below for portfolio-risk implications, surface open breaches/armed triggers that MUST appear in today's brief, flag data-quality concerns that change how items should be read, and state your objections VERBATIM where you disagree with a desk's framing — objections are preserved, not resolved. Desk input: ${JSON.stringify(desks)}. Return via StructuredOutput.`,
  {
    label: 'risk-overlay',
    phase: 'Risk overlay',
    schema: {
      type: 'object',
      required: ['riskItems', 'openBreachesOrTriggers', 'objections'],
      properties: {
        riskItems: { type: 'array', items: { type: 'string' } },
        openBreachesOrTriggers: { type: 'array', items: { type: 'string' } },
        dataQualityConcerns: { type: 'array', items: { type: 'string' } },
        objections: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
  },
)
if (!riskOverlay) log('WARNING: independent risk overlay FAILED — the brief MUST be marked DRAFT with the missing risk view stated')

phase('Synthesis')
const riskSection = riskOverlay
  ? JSON.stringify(riskOverlay)
  : 'MISSING — the independent-risk agent FAILED. Title the brief DRAFT and state prominently that the independent risk view is missing. A failed risk review is NEVER presented as "no objections".'
const synthesis = await agent(
  `Assemble today's brief per skills/strategize/SKILL.md: use its literal briefing template (## Crypto / ## Securities / ## Commodities each split into "Tradable on Hyperliquid now" vs watchlist; header date from \`date -u +%Y-%m-%d\`, never guessed). Rules: keep every number's as-of and evidence type in the text; a dedicated "Risk overlay" section carries the overlay's objections VERBATIM (never merged into consensus); aggregate desk coverageGaps under ## Gaps. Append the journal entry to .tribes/journal/<date>.md per the strategize journal convention (mkdir -p .tribes/journal; NEVER commit it). Inputs: DESKS=${JSON.stringify(desks)} VENUE=${JSON.stringify(venue)} RISK=${riskSection}. Return via StructuredOutput: the full brief markdown in briefMarkdown, plus headline and journalPath.`,
  {
    label: 'synthesis',
    phase: 'Synthesis',
    schema: {
      type: 'object',
      required: ['headline', 'briefMarkdown', 'journalPath'],
      properties: {
        headline: { type: 'string' },
        briefMarkdown: { type: 'string' },
        journalPath: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
)

return {
  headline: synthesis?.headline,
  brief: synthesis?.briefMarkdown,
  journalPath: synthesis?.journalPath,
  desksReported: desks.map((d) => d.desk),
  tradableCount: venue?.tradable?.length ?? 0,
  riskOverlayOk: Boolean(riskOverlay),
  riskObjections: riskOverlay ? riskOverlay.objections ?? [] : ['INDEPENDENT RISK VIEW MISSING — brief is DRAFT'],
}
