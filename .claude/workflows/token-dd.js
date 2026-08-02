export const meta = {
  name: 'token-dd',
  description:
    'Deep token due diligence: four parallel evidence sweeps (market, on-chain security/flows, news, web) -> adversarial verification of every material claim -> evidence-typed dossier with a Hyperliquid venue check, written as an org observation set',
  whenToUse:
    'Due diligence on one crypto token. Args: { chain: "solana|ethereum|base|...", address: "contract/mint", symbol?: "label", coingeckoId?: "id" }.',
  phases: [
    { title: 'Evidence', detail: 'four parallel sweeps' },
    { title: 'Adversarial verify', detail: 'refute every material claim' },
    { title: 'Dossier', detail: 'assemble, venue check, write observations' },
  ],
}

if (!args || !args.chain || !args.address) {
  return { error: 'token-dd requires args: { chain, address, symbol?, coingeckoId? }' }
}
const token = JSON.stringify({ chain: args.chain, address: args.address, symbol: args.symbol, coingeckoId: args.coingeckoId })

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
          sources: { type: 'array', items: { type: 'string' }, description: 'provider + command, or primary URL' },
          confidence: { enum: ['high', 'medium', 'low'] },
        },
      },
    },
    coverageGaps: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
}

const common = `Token under diligence: ${token}. Identify it by chain+address, never bare symbol. Trading-org evidence rules per skills/org-protocol/SKILL.md: every claim evidence-typed and sourced (provider model output = model_estimate, never observed; web claims start as hypothesis unless primary-sourced); unsupported operations go under coverageGaps, never improvised. Use tribes-cli; stamp retrieval with date -u. Return via StructuredOutput.`

phase('Evidence')
const sweeps = await parallel([
  () =>
    agent(
      `${common} ANGLE market-data per skills/validate-cross-check/SKILL.md: price from TWO independent paths — \`tribes-cli asset price --address ${args.address} --chain ${args.chain}\` (note which provider answered in its envelope) and a second source (\`tribes-cli token-data price --addresses ${args.address} --chain ${args.chain}\`${args.coingeckoId ? ` or \`market price --ids ${args.coingeckoId}\`` : ''}); report both values + spread. Liquidity, volume via \`token-data trade-data\`; OHLCV drawdown/volatility context via \`asset candles\` with the actual window stated; market-cap/FDV sanity.`,
      { label: 'ev:market', phase: 'Evidence', schema: EVIDENCE_SCHEMA },
    ),
  () =>
    agent(
      `${common} ANGLE on-chain per skills/token-analyst/SKILL.md and skills/intel-smart-money/SKILL.md: security/rug screen via \`tribes-cli token-data security --address ${args.address} --chain ${args.chain}\` (owner/creator, mint/freeze authority, concentration); holder table via \`token-data holders\`; smart-money read via \`smart-money who-bought-sold --token ${args.address} --chain ${args.chain}\` and \`flow-intelligence\` (labels are model_estimate); recent trades via \`token-data trades\`. Wash-trade smell: volume dwarfing liquidity is a finding.`,
      { label: 'ev:onchain', phase: 'Evidence', schema: EVIDENCE_SCHEMA },
    ),
  () =>
    agent(
      `${common} ANGLE news per skills/intel-news-collect/SKILL.md: \`timeout 300 tribes-cli news fetch --kind token --chain-id <id> --token-id ${args.address}\` (mandatory >=120s bash timeout; resolve the numeric chain id first) — catalysts, sentiment (model_estimate), credibility per source; note the feed's actual coverage window.`,
      { label: 'ev:news', phase: 'Evidence', schema: EVIDENCE_SCHEMA },
    ),
  () =>
    agent(
      `${common} ANGLE web per skills/research-analyst/SKILL.md and skills/web-search/SKILL.md: team/protocol documentation, audits, exploit history, unlock/vesting schedules via \`tribes-cli web-search search\` + \`web-search extract\` on primary sources — cite the actual URL; anything not primary-sourced stays hypothesis.`,
      { label: 'ev:web', phase: 'Evidence', schema: EVIDENCE_SCHEMA },
    ),
])

const evidence = sweeps.filter(Boolean)
if (evidence.length === 0) return { error: 'all evidence sweeps failed' }
const material = evidence.flatMap((e) => e.claims.filter((c) => c.confidence !== 'low'))
const lowConf = evidence.flatMap((e) => e.claims.filter((c) => c.confidence === 'low'))
log(`${evidence.length}/4 sweeps done; verifying all ${material.length} material claims (${lowConf.length} low-confidence pass through labeled unverified)`)

phase('Adversarial verify')
const verdicts = await parallel(
  material.map((c) => () =>
    agent(
      `Adversarially VERIFY this token-diligence claim — your job is to REFUTE it. Token: ${token}. CLAIM: ${JSON.stringify(c)}. Re-derive it from tribes-cli commands or the cited primary source yourself; a claim you cannot reproduce is refuted (default refuted=true when uncertain). Check the source actually says what is claimed, the numbers match, and the evidence type is honest (model output claimed as observed = refuted). Return via StructuredOutput.`,
      {
        label: `verify:${(c.statement || '').slice(0, 40)}`,
        phase: 'Adversarial verify',
        schema: {
          type: 'object',
          required: ['refuted', 'reason'],
          properties: {
            refuted: { type: 'boolean' },
            reason: { type: 'string' },
            correction: { type: 'string' },
          },
          additionalProperties: true,
        },
      },
    ).then((v) => ({ claim: c, verdict: v })),
  ),
)
const checked = verdicts.filter(Boolean)
const surviving = checked.filter((x) => x.verdict && x.verdict.refuted === false).map((x) => x.claim)
const refuted = checked.filter((x) => !x.verdict || x.verdict.refuted !== false)
log(`${surviving.length}/${material.length} material claims survived adversarial verification`)

phase('Dossier')
const dossier = await agent(
  `Assemble the due-diligence dossier for ${token}. Sections: verdict summary (one paragraph); surviving claims grouped by angle, each with evidence type, sources, and as-of; REFUTED claims listed with the refutation reason (never silently dropped); low-confidence claims labeled unverified; aggregated coverage gaps; and a venue check — resolve whether the token (or its coin) trades on Hyperliquid via \`tribes-cli hyperliquid list-assets --all-dexes --out /tmp/all-dexes.json\` and \`--market spot\` read in full, with quality evidence (referencePx, dayNtlVlm, openInterest, impactPxs) or "not tradable on Hyperliquid". Write each surviving claim group as an observation artifact under .tribes/org/observations/ per the org-protocol envelope (mkdir -p first; atomic writes; hypothesis labeled), so Data Validation can score them. Inputs: SURVIVING=${JSON.stringify(surviving)} REFUTED=${JSON.stringify(refuted.map((r) => ({ claim: r.claim.statement, reason: r.verdict ? r.verdict.reason : 'verifier failed' })))} LOW_CONFIDENCE=${JSON.stringify(lowConf)} GAPS=${JSON.stringify(evidence.flatMap((e) => e.coverageGaps))}. Return via StructuredOutput: dossierMarkdown, observationIds, venueStatus.`,
  {
    label: 'dossier',
    phase: 'Dossier',
    schema: {
      type: 'object',
      required: ['dossierMarkdown', 'observationIds', 'venueStatus'],
      properties: {
        dossierMarkdown: { type: 'string' },
        observationIds: { type: 'array', items: { type: 'string' } },
        venueStatus: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
)

return {
  dossier: dossier?.dossierMarkdown,
  observationIds: dossier?.observationIds ?? [],
  venueStatus: dossier?.venueStatus,
  claims: { material: material.length, survived: surviving.length, refuted: refuted.length, unverifiedLowConfidence: lowConf.length },
  coverageGaps: evidence.flatMap((e) => e.coverageGaps),
}
