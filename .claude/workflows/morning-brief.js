export const meta = {
  name: 'morning-brief',
  description: 'Cross-asset morning brief: parallel desk sweeps (macro, equities, crypto, news) -> independent risk overlay -> synthesized brief with quality flags and dissents preserved',
  whenToUse: 'Daily "what happened / what matters" synthesis across asset classes. Optional args: { date: "YYYY-MM-DD", focus: "optional topic emphasis" }.',
  phases: [
    { title: 'Desk sweeps', detail: 'four desks in parallel' },
    { title: 'Risk overlay', detail: 'independent risk reads desk output' },
    { title: 'Synthesis', detail: 'brief assembly, dissents preserved' },
  ],
}

const ROOT = process.cwd()
const date = (args && args.date) || 'today (state the actual as-of dates you observe in the data)'
const focus = (args && args.focus) ? `Special focus requested: ${args.focus}.` : ''

const DESK_SCHEMA = {
  type: 'object',
  required: ['department', 'headline', 'items', 'dataQualityNotes', 'coverageGaps'],
  properties: {
    department: { type: 'string' },
    headline: { type: 'string', description: 'one sentence, the single most decision-relevant fact' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['statement', 'evidenceType', 'asOf', 'sources'],
        properties: {
          statement: { type: 'string' },
          evidenceType: { enum: ['observed', 'calculated', 'model_estimate', 'hypothesis', 'assumption', 'analyst_judgment'] },
          asOf: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          qualityFlags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    dataQualityNotes: { type: 'array', items: { type: 'string' } },
    coverageGaps: { type: 'array', items: { type: 'string' } },
    routingSuggestions: { type: 'array', items: { type: 'string' }, description: '"to-department: why" for anything actionable' },
  },
  additionalProperties: true,
}

const deskPrompt = (dept, brief) => `Working directory: ${ROOT}. Produce your department's contribution to the ${date} cross-asset morning brief. ${focus}
${brief}
Use the platform CLI (npx tsx src/cli/index.ts ... --json) for ALL data; every item carries evidenceType, honest asOf, and quality flags (eod/delayed/estimated as applicable — never imply real-time). If a provider is not configured or an operation unsupported, record it under coverageGaps rather than improvising. Return via StructuredOutput; 4-8 items, decision-relevant only.`

phase('Desk sweeps')
const [macro, equities, crypto, news] = await parallel([
  () => agent(deskPrompt('global-macro', 'Cover: recent/imminent macro prints (check lastUpdated on major FRED series), rates/curve moves, FX context.'), { label: 'desk:macro', agentType: 'macro-analyst', schema: DESK_SCHEMA }),
  () => agent(deskPrompt('equity-research', 'Cover: index/ETF proxy moves at latest EOD close (label the close date), notable single-name news-flow with mechanism.'), { label: 'desk:equities', agentType: 'equity-analyst', schema: DESK_SCHEMA }),
  () => agent(deskPrompt('crypto-onchain', 'Cover: crypto majors (timestamped prices via pi token price). Cross-check tokens that have a chain+address by pulling pi token price from two providers (--id <coingecko-id> vs --chain/--address) and comparing. Native BTC has only ONE reference source on this platform (CoinGecko) — state that in dataQualityNotes instead of fabricating a cross-check. Also: notable on-chain/labeled-flow moves (model estimates, internal-only), venue/stablecoin anomalies.'), { label: 'desk:crypto', agentType: 'crypto-analyst', schema: DESK_SCHEMA }),
  () => agent(deskPrompt('news-events', 'Cover: top material items across asset classes with mechanism + credibility label; note the actual coverage window of the feed.'), { label: 'desk:news', agentType: 'news-analyst', schema: DESK_SCHEMA }),
])

const deskResults = [macro, equities, crypto, news].filter(Boolean)
if (deskResults.length === 0) return { error: 'all desk agents failed — no brief produced' }
log(`${deskResults.length}/4 desks reported`)

phase('Risk overlay')
const riskOverlay = await agent(
  `Working directory: ${ROOT}. You are reviewing the desks' morning-brief input below as INDEPENDENT RISK. Read any open artifacts under artifacts/ (limit breaches, risk notes, memos with reviewDate due). Then assess: (1) which desk items have portfolio-risk implications and why, (2) open breaches/conditions that must surface in today's brief, (3) data-quality concerns that change how items should be read, (4) your objections, verbatim, where you disagree with a desk's framing. Desk input: ${JSON.stringify(deskResults)}`,
  { label: 'risk-overlay', agentType: 'risk-officer', schema: {
    type: 'object',
    required: ['riskItems', 'openBreachesOrConditions', 'objections'],
    properties: {
      riskItems: { type: 'array', items: { type: 'string' } },
      openBreachesOrConditions: { type: 'array', items: { type: 'string' } },
      dataQualityConcerns: { type: 'array', items: { type: 'string' } },
      objections: { type: 'array', items: { type: 'string' }, description: 'verbatim disagreements with desk framing — preserved, not resolved' },
    },
    additionalProperties: true,
  } },
)

if (!riskOverlay) {
  log('WARNING: independent risk overlay FAILED — brief will be marked DRAFT with the missing risk view stated')
}

phase('Synthesis')
const riskSection = riskOverlay
  ? JSON.stringify(riskOverlay)
  : 'MISSING — the independent-risk agent FAILED. The brief MUST be titled DRAFT and state prominently that the independent risk view is missing. A failed risk review is NEVER presented as "no objections".'
const synthesis = await agent(
  `Working directory: ${ROOT}. Assemble the ${date} cross-asset morning brief from the inputs below. Rules: keep every number's as-of date and quality flag in the text; preserve the risk overlay's objections VERBATIM in a dedicated section (never merge them into consensus); include a "coverage gaps today" section aggregating desk gaps; end with routing suggestions. Then: (1) write the brief as markdown to artifacts/briefs/<date>-morning-brief.md, (2) build a ResearchNote JSON (department news-events, findings = the brief's key items with their evidenceTypes) at artifacts/notes/<date>-morning-brief.json, (3) validate it with: npx tsx src/cli/index.ts validate note <path> and fix until OK. Inputs: DESKS=${JSON.stringify(deskResults)} RISK=${riskSection}`,
  { label: 'synthesis', schema: {
    type: 'object',
    required: ['briefPath', 'notePath', 'noteValidated', 'headline'],
    properties: {
      briefPath: { type: 'string' },
      notePath: { type: 'string' },
      noteValidated: { type: 'boolean' },
      headline: { type: 'string' },
    },
    additionalProperties: true,
  } },
)

return {
  headline: synthesis?.headline,
  briefPath: synthesis?.briefPath,
  notePath: synthesis?.notePath,
  noteValidated: synthesis?.noteValidated ?? false,
  desksReported: deskResults.map((d) => d.department),
  riskOverlayOk: Boolean(riskOverlay),
  riskObjections: riskOverlay
    ? (riskOverlay.objections ?? [])
    : ['INDEPENDENT RISK VIEW MISSING — overlay agent failed; brief is DRAFT'],
}
