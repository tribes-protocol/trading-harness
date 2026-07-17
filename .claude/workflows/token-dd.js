export const meta = {
  name: 'token-dd',
  description: 'Deep token due diligence: parallel evidence sweeps (market data, on-chain, news, web) -> adversarial verification of every material claim -> validated research note with venue recommendation routed to risk',
  whenToUse: 'Due diligence on a crypto token. Args: { chain: "solana|ethereum|...", address: "contract/mint address", coingeckoId?: "id", symbol?: "informal label" }.',
  phases: [
    { title: 'Evidence', detail: 'four parallel sweeps' },
    { title: 'Adversarial verify', detail: 'refute material claims' },
    { title: 'Note', detail: 'assemble + validate + handoffs' },
  ],
}

const ROOT = process.cwd()
if (!args || !args.chain || !(args.address || args.coingeckoId)) {
  return { error: 'token-dd requires args: { chain, address or coingeckoId, symbol? }' }
}
const token = JSON.stringify({ chain: args.chain, address: args.address, coingeckoId: args.coingeckoId, symbol: args.symbol })

const EVIDENCE_SCHEMA = {
  type: 'object',
  required: ['angle', 'claims', 'coverageGaps'],
  properties: {
    angle: { type: 'string' },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        required: ['statement', 'evidenceType', 'sources', 'confidence'],
        properties: {
          statement: { type: 'string' },
          evidenceType: { enum: ['observed', 'calculated', 'model_estimate', 'hypothesis', 'assumption', 'analyst_judgment'] },
          sources: { type: 'array', items: { type: 'string' } },
          confidence: { enum: ['high', 'medium', 'low'] },
        },
      },
    },
    coverageGaps: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
}

const common = `Working directory: ${ROOT}. Token under diligence: ${token}. Identify it by chain+address (never bare symbol). Use the platform CLI (npx tsx src/cli/index.ts ... --json); unsupported/unconfigured operations go under coverageGaps, never improvised. Every claim evidence-typed and sourced.`

phase('Evidence')
const sweeps = await parallel([
  () => agent(`${common} ANGLE market-data: price cross-checked across at least two providers via two \`pi token price\` calls (e.g. --id <coingecko-id> vs --chain/--address for Birdeye; report both values + spread), liquidity depth (liquidityUsd), volume, OHLCV drawdown/volatility context via \`pi token ohlcv\` with the actual window used, market-cap/FDV sanity.`, { label: 'ev:market', agentType: 'crypto-analyst', schema: EVIDENCE_SCHEMA }),
  () => agent(`${common} ANGLE on-chain: notable wallet flows/transfers and supply mechanics via the CLI. Holder concentration and contract security screens have NO normalized platform operation today — if you cannot source them from a documented provider capability, record them under coverageGaps rather than improvising. Helius USD values are hourly estimates — flag them. Labeled flows are model estimates, internal-only.`, { label: 'ev:onchain', agentType: 'crypto-analyst', schema: EVIDENCE_SCHEMA }),
  () => agent(`${common} ANGLE news: news flow around the token/protocol with mechanism + credibility ladder; note feed coverage window.`, { label: 'ev:news', agentType: 'news-analyst', schema: EVIDENCE_SCHEMA }),
  () => agent(`${common} ANGLE web: team/protocol documentation, audits, exploit history, unlock/vesting schedules via pi search / WebFetch — cite the actual primary source; web-derived claims start as hypothesis unless primary-sourced.`, { label: 'ev:web', schema: EVIDENCE_SCHEMA }),
])

const evidence = sweeps.filter(Boolean)
if (evidence.length === 0) return { error: 'all evidence sweeps failed' }
// Every material claim is verified — no silent caps. Low-confidence claims
// skip verification but still reach the note, labeled as unverified.
const materialClaims = evidence.flatMap((e) => e.claims.filter((c) => c.confidence !== 'low'))
const lowConfidenceClaims = evidence.flatMap((e) => e.claims.filter((c) => c.confidence === 'low'))
log(`${evidence.length}/4 sweeps done; verifying all ${materialClaims.length} material claims (${lowConfidenceClaims.length} low-confidence pass through labeled unverified)`)

phase('Adversarial verify')
const verdicts = await parallel(
  materialClaims.map((c, i) => () =>
    agent(
      `Working directory: ${ROOT}. Adversarially verify this claim about token ${token} — actively try to REFUTE it using the platform CLI and/or the cited sources: ${JSON.stringify(c)}. Default to refuted if you cannot reproduce/confirm it. Check the source actually says what is claimed.`,
      { label: `verify:${i}`, schema: {
        type: 'object',
        required: ['refuted', 'reason'],
        properties: { refuted: { type: 'boolean' }, reason: { type: 'string' }, correctedStatement: { type: 'string' } },
        additionalProperties: true,
      } },
    ).then((v) => ({ claim: c, verdict: v })),
  ),
)
// A failed verification agent must not make its claim vanish (or pass):
// such claims land in an explicit "unverified" bucket.
const checked = verdicts.map((x, i) => x ?? { claim: materialClaims[i], verdict: null })
const surviving = checked.filter((x) => x.verdict && !x.verdict.refuted)
const refuted = checked.filter((x) => x.verdict && x.verdict.refuted)
const unverified = checked.filter((x) => !x.verdict)
log(`${surviving.length} claims survived, ${refuted.length} refuted, ${unverified.length} unverified (verifier failed)`)

phase('Note')
const note = await agent(
  `Working directory: ${ROOT}. Assemble the token due-diligence note for ${token} (department crypto-onchain). Findings come ONLY from SURVIVING claims (keep their evidenceTypes/sources). The note must ALSO contain, for full transparency: a "refuted in verification" section (REFUTED), an "unverified — verification failed" section (UNVERIFIED: these claims are neither confirmed nor refuted and must never read as confirmed), and a "low-confidence unverified observations" section (LOW_CONFIDENCE). Aggregate coverage gaps; include liquidity-risk and venue-quality sections; where holder-concentration or token-security data was unavailable (no normalized platform operation), record that as a coverage gap rather than improvising. Write ResearchNote JSON to artifacts/notes/, validate (npx tsx src/cli/index.ts validate note <path>) until OK. Then create a Handoff to independent-risk (venue/counterparty recommendation + open risks) under artifacts/handoffs/, validate it too.
SURVIVING=${JSON.stringify(surviving)}
REFUTED=${JSON.stringify(refuted.map((r) => ({ statement: r.claim.statement, reason: r.verdict.reason })))}
UNVERIFIED=${JSON.stringify(unverified.map((u) => u.claim))}
LOW_CONFIDENCE=${JSON.stringify(lowConfidenceClaims)}
GAPS=${JSON.stringify(evidence.flatMap((e) => e.coverageGaps))}`,
  { label: 'assemble-note', agentType: 'crypto-analyst', schema: {
    type: 'object',
    required: ['notePath', 'noteValidated', 'handoffPath', 'handoffValidated', 'summary'],
    properties: {
      notePath: { type: 'string' },
      noteValidated: { type: 'boolean' },
      handoffPath: { type: 'string' },
      handoffValidated: { type: 'boolean' },
      summary: { type: 'string' },
    },
    additionalProperties: true,
  } },
)

return {
  summary: note?.summary,
  notePath: note?.notePath,
  handoffPath: note?.handoffPath,
  validated: (note?.noteValidated ?? false) && (note?.handoffValidated ?? false),
  claimsSurviving: surviving.length,
  claimsRefuted: refuted.length,
  claimsUnverified: unverified.length,
  lowConfidencePassedThrough: lowConfidenceClaims.length,
}
