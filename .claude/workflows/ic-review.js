export const meta = {
  name: 'ic-review',
  description:
    'Investment-committee review of one strategy proposal: sponsor case, independent risk view, and compliance view produced in parallel, assembled into a decision record with dissents preserved verbatim — the orchestrated form of the research-evaluate promotion gate',
  whenToUse:
    'When a strategy-proposal (or trade thesis) needs committee review before promotion. Args: { thesis: "the proposal in one paragraph", asset: "COIN", dex: "main|xyz|...", side: "long|short", horizon: "e.g. 72h", proposalPath?: ".tribes/org/proposals/<id>.json" }.',
  phases: [
    { title: 'Independent views', detail: 'sponsor, risk, compliance in parallel' },
    { title: 'Assembly', detail: 'decision record, dissents verbatim' },
  ],
}

if (!args || !args.thesis || !args.asset || !args.side) {
  return { error: 'ic-review requires args: { thesis, asset, side, dex?, horizon?, proposalPath? }' }
}
const framing = `ASSET=${args.asset} DEX=${args.dex || 'main'} SIDE=${args.side} HORIZON=${args.horizon || '72h'}`
const proposalPath = args.proposalPath || '(none — thesis text only)'

const VIEW_SCHEMA = {
  type: 'object',
  required: ['view', 'verdict', 'conditions', 'dissentWorthyConcerns'],
  properties: {
    view: { type: 'string', description: "the full view, in this function's own words" },
    verdict: { enum: ['support', 'support_with_conditions', 'object', 'blocked', 'no_view'] },
    conditions: { type: 'array', items: { type: 'string' }, description: 'each testable ex post' },
    dissentWorthyConcerns: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
}

const common = `Trading-org context: docs/org/ORGANIZATION.md; envelope + dissent rules: skills/org-protocol/SKILL.md. Proposal under review: ${framing}. THESIS: ${args.thesis}. Proposal artifact: ${proposalPath} (read it if it exists). Use tribes-cli only; every claim carries provider + command + as-of; evidence types per org-protocol (model output is model_estimate, never observed). Return via StructuredOutput.`

phase('Independent views')
const [sponsor, risk, compliance] = await parallel([
  () =>
    agent(
      `${common} You SPONSOR this proposal for Strategy Research (read .agents/research-evaluator.md for the evaluation standard you must meet). Strengthen the case honestly: pull the strongest current evidence (market/token data, funding via \`tribes-cli hyperliquid funding-history --coin ${args.asset} --start-time <ms>\`, news with a >=120s timeout), but acknowledge weaknesses and engine limits explicitly — a sponsor who hides weakness fails the committee. State which evidence path applies (backtest vs the charter's alternative-evidence clause).`,
      { label: 'view:sponsor', phase: 'Independent views', schema: VIEW_SCHEMA },
    ),
  () =>
    agent(
      `${common} Provide the INDEPENDENT RISK view per .agents/desk-risk.md (read it; you are that role, at committee stage). Re-derive — do not accept the sponsor's numbers: \`tribes-cli wallet list\`, \`hyperliquid list-assets --all-dexes --out /tmp/all-dexes.json\` (read the full file, ${args.asset}'s section verified), \`list-balances\`/\`list-positions\`/\`list-open-orders --all-dexes\` on the account. Check market quality (referencePx, midPx/oraclePx coherence, dayNtlVlm, openInterest, impactPxs, isDelisted, requiresIsolatedMargin), correlated exposure, margin headroom, and whether a stop would sit inside ordinary volatility. Missing data is RISK, not absence of risk. Objections plain and verbatim.`,
      { label: 'view:risk', phase: 'Independent views', schema: VIEW_SCHEMA },
    ),
  () =>
    agent(
      `${common} Provide the COMPLIANCE view per .agents/compliance-officer.md and skills/org-compliance/SKILL.md (read both; run the procedure): restricted-list screen of ${args.asset} against .tribes/org/config/restricted-list.json (create the empty structure if absent — an unmaintained list is a finding, not a crash); source audit of the proposal's evidence (single-source social claims need corroboration; fabrication marks are findings); licensing hygiene (provider data internal-use only). Findings cite the specific rule. You produce no investment view.`,
      { label: 'view:compliance', phase: 'Independent views', schema: VIEW_SCHEMA },
    ),
])

if (!sponsor || !risk || !compliance) {
  return {
    error: 'one or more views failed — decision record NOT assembled (a missing independent view is never treated as "no objections")',
    got: { sponsor: !!sponsor, risk: !!risk, compliance: !!compliance },
  }
}

phase('Assembly')
const assembly = await agent(
  `Assemble the committee decision record for ${framing}. Rules (org-protocol dissent rules apply): the risk and compliance views are quoted in their authors' own words — you may summarize the sponsor thesis but NEVER soften or omit a risk/compliance concern; every dissentWorthyConcern becomes a dissents[] entry verbatim with attribution; decision logic: any "blocked" => rejected; any "object" or "support_with_conditions" => at most approved_with_conditions carrying ALL conditions (each testable ex post); clean support all around => approved. Set review_by = the shortest horizon among the views (default 7 days out, computed from \`date -u\`). Write the record as JSON to .tribes/org/proposals/<UTC>-ic-review-${args.asset.toLowerCase()}.json per the org-protocol envelope (state stays a review record — promotion itself remains research-evaluate's write), atomic tmp-then-mv. Inputs: SPONSOR=${JSON.stringify(sponsor)} RISK=${JSON.stringify(risk)} COMPLIANCE=${JSON.stringify(compliance)}. Return via StructuredOutput.`,
  {
    label: 'assemble-record',
    phase: 'Assembly',
    schema: {
      type: 'object',
      required: ['decision', 'recordPath', 'conditions', 'dissentCount'],
      properties: {
        decision: { enum: ['approved', 'approved_with_conditions', 'rejected', 'deferred'] },
        recordPath: { type: 'string' },
        conditions: { type: 'array', items: { type: 'string' } },
        dissentCount: { type: 'number' },
        reviewBy: { type: 'string' },
      },
      additionalProperties: true,
    },
  },
)

return {
  decision: assembly?.decision,
  recordPath: assembly?.recordPath,
  conditions: assembly?.conditions ?? [],
  dissentCount: assembly?.dissentCount ?? 0,
  reviewBy: assembly?.reviewBy,
  verdicts: { sponsor: sponsor.verdict, risk: risk.verdict, compliance: compliance.verdict },
  note: 'This record informs research-evaluate; promotion to approved-strategy still runs its full contract (Review Board debate included).',
}
