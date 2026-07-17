/**
 * Machine-readable department descriptors, synthesized from the operating-
 * model research (docs/OPERATING_MODEL.md, docs/research/operating-model/).
 * Used by the CLI, skills, and workflows to validate handoff routing.
 */

export type LineOfDefense = 'first' | 'second' | 'platform';

export interface DepartmentDescriptor {
  id: string;
  name: string;
  line: LineOfDefense;
  /** Independent reporting line required (second-line functions). */
  independent: boolean;
  mandate: string;
  /** Typical artifact types produced (schema names). */
  produces: string[];
  /** Departments this one most commonly hands off to. */
  typicalHandoffsTo: string[];
}

export const DEPARTMENTS: DepartmentDescriptor[] = [
  {
    id: 'global-macro',
    name: 'Global Macro Research',
    line: 'first',
    independent: false,
    mandate:
      'Policy path, rates, inflation, growth, and FX research (FX lives here, not in commodities).',
    produces: ['ResearchNote', 'Signal', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'capital-allocation', 'fixed-income-credit'],
  },
  {
    id: 'equity-research',
    name: 'Equity Research',
    line: 'first',
    independent: false,
    mandate: 'Single names, sectors, indices, ETFs: screening, fundamentals, relative value.',
    produces: ['ResearchNote', 'Signal', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'news-events'],
  },
  {
    id: 'fixed-income-credit',
    name: 'Fixed-Income & Credit Research',
    line: 'first',
    independent: false,
    mandate: 'Curves, carry, credit spreads and cycle work (FRED curve/OAS series).',
    produces: ['ResearchNote', 'Signal', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'global-macro'],
  },
  {
    id: 'commodities',
    name: 'Commodities Research',
    line: 'first',
    independent: false,
    mandate: 'Physical-data-driven commodities research (standalone; FX excluded by design).',
    produces: ['ResearchNote', 'Signal', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'global-macro'],
  },
  {
    id: 'crypto-onchain',
    name: 'Crypto & On-Chain Research',
    line: 'first',
    independent: false,
    mandate:
      'Protocol fundamentals, on-chain flows, DeFi risk, token supply, venue quality. Recommends venues; approval authority sits with independent-risk.',
    produces: ['ResearchNote', 'Signal', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'independent-risk'],
  },
  {
    id: 'quant-research',
    name: 'Quantitative Research',
    line: 'first',
    independent: false,
    mandate:
      'Signal research, factor models, backtesting with out-of-sample discipline. Model development only — validation is a separate second-line function.',
    produces: ['Signal', 'ResearchNote', 'Handoff'],
    typicalHandoffsTo: ['model-validation', 'portfolio-management'],
  },
  {
    id: 'market-intelligence',
    name: 'Market Intelligence (Technical & Market Structure)',
    line: 'first',
    independent: false,
    mandate:
      'Shared capability (not a standalone TA desk): trend, momentum, positioning, liquidity context for all desks.',
    produces: ['ResearchNote', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'global-macro', 'equity-research'],
  },
  {
    id: 'news-events',
    name: 'News & Event Analysis',
    line: 'first',
    independent: false,
    mandate:
      'Central news monitoring, materiality triage, source-credibility assessment, event routing.',
    produces: ['ResearchNote', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'independent-risk', 'compliance'],
  },
  {
    id: 'portfolio-management',
    name: 'Portfolio Management (pod/strategy)',
    line: 'first',
    independent: false,
    mandate:
      'Position sizing, portfolio construction, rebalancing, drawdown management within mandate and limits.',
    produces: ['TradeIntent', 'Portfolio', 'Handoff'],
    typicalHandoffsTo: ['independent-risk', 'capital-allocation', 'operations'],
  },
  {
    id: 'capital-allocation',
    name: 'Capital Allocation (CIO office)',
    line: 'first',
    independent: false,
    mandate:
      'Cross-pod capital allocation, aggregate portfolio construction, strategy-level risk budgeting.',
    produces: ['IcMemo', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'independent-risk'],
  },
  {
    id: 'independent-risk',
    name: 'Independent Risk Management',
    line: 'second',
    independent: true,
    mandate:
      'Limit framework, exposures, stress/scenario/liquidity/concentration/counterparty risk, escalation with veto rights, venue/counterparty approval. Views recorded separately from PM views.',
    produces: ['RiskAssessment', 'LimitBreach', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'capital-allocation', 'compliance'],
  },
  {
    id: 'model-validation',
    name: 'Model Validation & Governance',
    line: 'second',
    independent: true,
    mandate:
      'Firmwide model inventory, tiering, independent validation, periodic review, change control (SR 11-7 adapted).',
    produces: ['ResearchNote', 'Handoff'],
    typicalHandoffsTo: ['quant-research', 'independent-risk'],
  },
  {
    id: 'compliance',
    name: 'Compliance, Controls & Auditability',
    line: 'second',
    independent: true,
    mandate:
      'Regulatory obligations, restricted lists, MNPI/alt-data diligence, record retention — including Market Surveillance as a named team inside compliance.',
    produces: ['ResearchNote', 'Handoff'],
    typicalHandoffsTo: ['portfolio-management', 'independent-risk', 'data-platform'],
  },
  {
    id: 'operations',
    name: 'Trade Operations',
    line: 'first',
    independent: false,
    mandate: 'Settlement/reconciliation lifecycle, trade breaks, position integrity.',
    produces: ['Handoff'],
    typicalHandoffsTo: ['treasury', 'performance-reporting', 'portfolio-management'],
  },
  {
    id: 'treasury',
    name: 'Treasury Analytics',
    line: 'first',
    independent: false,
    mandate: 'Cash, collateral, margin, financing, counterparty exposure management.',
    produces: ['ResearchNote', 'Handoff'],
    typicalHandoffsTo: ['independent-risk', 'operations'],
  },
  {
    id: 'performance-reporting',
    name: 'Performance & Reporting',
    line: 'first',
    independent: false,
    mandate:
      'Performance measurement, attribution, investor/IC reporting production — independent of the decision forum.',
    produces: ['ResearchNote', 'Handoff'],
    typicalHandoffsTo: ['capital-allocation', 'compliance'],
  },
  {
    id: 'data-platform',
    name: 'Data Engineering & Research Platform',
    line: 'platform',
    independent: false,
    mandate:
      'Provider due diligence and registry ownership (vendor management) + adapters, point-in-time correctness, reproducibility, data-quality monitoring (platform engineering).',
    produces: ['ResearchNote', 'Handoff'],
    typicalHandoffsTo: ['quant-research', 'compliance', 'independent-risk'],
  },
];

export const DEPARTMENT_IDS = DEPARTMENTS.map((d) => d.id);

export function getDepartment(id: string): DepartmentDescriptor | undefined {
  return DEPARTMENTS.find((d) => d.id === id);
}

export function isKnownDepartment(id: string): boolean {
  return DEPARTMENT_IDS.includes(id);
}
