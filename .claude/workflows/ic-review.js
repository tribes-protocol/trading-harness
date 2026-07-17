export const meta = {
  name: 'ic-review',
  description: 'Investment Committee review: sponsor memo + independent risk view + compliance view produced in parallel by separate agents, assembled into a validated IcMemo with dissents preserved',
  whenToUse: 'When a trade idea or allocation needs committee review. Args: { thesis: "the proposal", sponsorDepartment: "e.g. equity-research", instruments: ["..."], sponsorArtifacts: ["paths to supporting notes"] }.',
  phases: [
    { title: 'Independent views', detail: 'sponsor, risk, compliance in parallel' },
    { title: 'Assembly', detail: 'memo build + validation, dissents verbatim' },
  ],
}

const ROOT = process.cwd()
if (!args || !args.thesis) {
  return { error: 'ic-review requires args: { thesis, sponsorDepartment, instruments?, sponsorArtifacts? }' }
}
const thesis = args.thesis
const sponsorDept = args.sponsorDepartment || 'equity-research'
const instruments = JSON.stringify(args.instruments || [])
const artifacts = JSON.stringify(args.sponsorArtifacts || [])

const VIEW_SCHEMA = {
  type: 'object',
  required: ['view', 'verdict', 'conditions', 'dissentWorthyConcerns'],
  properties: {
    view: { type: 'string', description: 'the full view, in this function\'s own words' },
    verdict: { enum: ['support', 'support_with_conditions', 'object', 'blocked', 'no_view'] },
    conditions: { type: 'array', items: { type: 'string' }, description: 'testable ex post' },
    dissentWorthyConcerns: { type: 'array', items: { type: 'string' } },
    artifactPath: { type: 'string' },
  },
  additionalProperties: true,
}

phase('Independent views')
const [sponsor, risk, compliance] = await parallel([
  () => agent(
    `Working directory: ${ROOT}. You SPONSOR this proposal for IC review on behalf of ${sponsorDept}. Thesis: ${thesis}. Instruments: ${instruments}. Existing supporting artifacts: ${artifacts}. Strengthen the case with platform data (CLI, --json), but keep evidence honest: every claim evidence-typed, data quality flags preserved, weaknesses acknowledged in limitations. Produce/refresh a ResearchNote under artifacts/notes/ supporting the thesis, validate it (npx tsx src/cli/index.ts validate note <path>), and return your sponsor view.`,
    { label: 'view:sponsor', schema: VIEW_SCHEMA },
  ),
  () => agent(
    `Working directory: ${ROOT}. Provide the INDEPENDENT RISK view on this IC proposal. Thesis: ${thesis}. Instruments: ${instruments}. Sponsor artifacts (read them, then re-derive independently — do not accept their numbers): ${artifacts}. Follow the risk-review skill: re-derive exposures from platform data, test limits, stress it, interrogate data quality. Save a RiskAssessment-based note under artifacts/notes/ and return your view. Objections plain and verbatim; missing data is risk, not absence of risk.`,
    { label: 'view:risk', agentType: 'risk-officer', schema: VIEW_SCHEMA },
  ),
  () => agent(
    `Working directory: ${ROOT}. Provide the COMPLIANCE view on this IC proposal. Thesis: ${thesis}. Instruments: ${instruments}. Sponsor artifacts: ${artifacts}. Follow the compliance-check skill: restricted-list screen, MNPI source audit of the sponsor artifacts, data-licensing check (FRED attribution, Nansen internal-only, delayed/EOD language), retention. Return your view with findings citing specific rules/clauses.`,
    { label: 'view:compliance', agentType: 'compliance-officer', schema: VIEW_SCHEMA },
  ),
])

if (!sponsor || !risk || !compliance) {
  return { error: 'one or more views failed — memo NOT assembled', got: { sponsor: !!sponsor, risk: !!risk, compliance: !!compliance } }
}

phase('Assembly')
const assembly = await agent(
  `Working directory: ${ROOT}. Assemble an Investment Committee memo (IcMemoSchema in src/schemas/reports.ts) from three independent views. Rules: riskView and complianceView are quoted in their authors' own words (fields below) — you may summarize the thesis but NEVER soften or omit risk/compliance concerns; every dissentWorthyConcern becomes a DissentSchema entry with attribution; decision logic: any "blocked" => decision rejected; any "object" or "support_with_conditions" => at most approved_with_conditions carrying ALL conditions; set a reviewDate ~90 days out. Write the memo JSON to artifacts/memos/<yyyy-mm-dd>-<slug>.json, validate with npx tsx src/cli/index.ts validate ic-memo <path>, fix until OK.
SPONSOR=${JSON.stringify(sponsor)}
RISK=${JSON.stringify(risk)}
COMPLIANCE=${JSON.stringify(compliance)}
THESIS=${JSON.stringify(thesis)} SPONSOR_DEPT=${JSON.stringify(sponsorDept)}`,
  { label: 'assemble-memo', schema: {
    type: 'object',
    required: ['memoPath', 'validated', 'decision', 'dissentCount'],
    properties: {
      memoPath: { type: 'string' },
      validated: { type: 'boolean' },
      decision: { type: 'string' },
      conditions: { type: 'array', items: { type: 'string' } },
      dissentCount: { type: 'number' },
    },
    additionalProperties: true,
  } },
)

return {
  decision: assembly?.decision,
  memoPath: assembly?.memoPath,
  validated: assembly?.validated ?? false,
  conditions: assembly?.conditions ?? [],
  dissentCount: assembly?.dissentCount ?? 0,
  verdicts: { sponsor: sponsor.verdict, risk: risk.verdict, compliance: compliance.verdict },
}
