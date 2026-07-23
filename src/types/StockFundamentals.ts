import { z } from 'zod'

// ---------------------------------------------------------------------------
// Raw Massive payloads (api.massive.com), SEC fundamentals + filings surface.
// Only the fields the harness surfaces are modeled; everything else is
// ignored at parse time. Numeric fields tolerate decimal-string encodings.
// ---------------------------------------------------------------------------

const MassiveNumberSchema = z.union([z.number(), z.string()])

export const MassiveIncomeStatementRowSchema = z.object({
  period_end: z.string().nullish(),
  fiscal_year: z.coerce.string().nullish(),
  fiscal_quarter: z.number().int().nullish(),
  timeframe: z.string().nullish(),
  revenues: MassiveNumberSchema.nullish(),
  cost_of_revenue: MassiveNumberSchema.nullish(),
  gross_profit: MassiveNumberSchema.nullish(),
  operating_income_loss: MassiveNumberSchema.nullish(),
  net_income_loss: MassiveNumberSchema.nullish(),
  basic_earnings_per_share: MassiveNumberSchema.nullish(),
  diluted_earnings_per_share: MassiveNumberSchema.nullish()
})
export type MassiveIncomeStatementRow = z.infer<typeof MassiveIncomeStatementRowSchema>

export const MassiveIncomeStatementsResponseSchema = z.object({
  results: z.array(MassiveIncomeStatementRowSchema).nullish()
})
export type MassiveIncomeStatementsResponse = z.infer<typeof MassiveIncomeStatementsResponseSchema>

export const MassiveBalanceSheetRowSchema = z.object({
  period_end: z.string().nullish(),
  fiscal_year: z.coerce.string().nullish(),
  fiscal_quarter: z.number().int().nullish(),
  timeframe: z.string().nullish(),
  total_assets: MassiveNumberSchema.nullish(),
  total_current_assets: MassiveNumberSchema.nullish(),
  cash_and_equivalents: MassiveNumberSchema.nullish(),
  total_liabilities: MassiveNumberSchema.nullish(),
  total_current_liabilities: MassiveNumberSchema.nullish(),
  total_equity: MassiveNumberSchema.nullish(),
  retained_earnings_deficit: MassiveNumberSchema.nullish()
})
export type MassiveBalanceSheetRow = z.infer<typeof MassiveBalanceSheetRowSchema>

export const MassiveBalanceSheetsResponseSchema = z.object({
  results: z.array(MassiveBalanceSheetRowSchema).nullish()
})
export type MassiveBalanceSheetsResponse = z.infer<typeof MassiveBalanceSheetsResponseSchema>

export const MassiveCashFlowRowSchema = z.object({
  period_end: z.string().nullish(),
  fiscal_year: z.coerce.string().nullish(),
  fiscal_quarter: z.number().int().nullish(),
  timeframe: z.string().nullish(),
  net_cash_from_operating_activities: MassiveNumberSchema.nullish(),
  net_cash_from_investing_activities: MassiveNumberSchema.nullish(),
  net_cash_from_financing_activities: MassiveNumberSchema.nullish(),
  change_in_cash_and_equivalents: MassiveNumberSchema.nullish(),
  net_income: MassiveNumberSchema.nullish()
})
export type MassiveCashFlowRow = z.infer<typeof MassiveCashFlowRowSchema>

export const MassiveCashFlowsResponseSchema = z.object({
  results: z.array(MassiveCashFlowRowSchema).nullish()
})
export type MassiveCashFlowsResponse = z.infer<typeof MassiveCashFlowsResponseSchema>

export const MassiveRatiosRowSchema = z.object({
  price_to_earnings: MassiveNumberSchema.nullish(),
  price_to_book: MassiveNumberSchema.nullish(),
  price_to_sales: MassiveNumberSchema.nullish(),
  return_on_assets: MassiveNumberSchema.nullish(),
  return_on_equity: MassiveNumberSchema.nullish(),
  earnings_per_share: MassiveNumberSchema.nullish(),
  dividend_yield: MassiveNumberSchema.nullish(),
  enterprise_value: MassiveNumberSchema.nullish(),
  ev_to_ebitda: MassiveNumberSchema.nullish(),
  current_ratio: MassiveNumberSchema.nullish(),
  quick_ratio: MassiveNumberSchema.nullish(),
  debt_to_equity: MassiveNumberSchema.nullish()
})
export type MassiveRatiosRow = z.infer<typeof MassiveRatiosRowSchema>

export const MassiveRatiosResponseSchema = z.object({
  results: z.array(MassiveRatiosRowSchema).nullish()
})
export type MassiveRatiosResponse = z.infer<typeof MassiveRatiosResponseSchema>

export const MassiveFloatRowSchema = z.object({
  effective_date: z.string().nullish(),
  free_float: MassiveNumberSchema.nullish(),
  free_float_percent: MassiveNumberSchema.nullish()
})
export type MassiveFloatRow = z.infer<typeof MassiveFloatRowSchema>

export const MassiveFloatResponseSchema = z.object({
  results: z.array(MassiveFloatRowSchema).nullish()
})
export type MassiveFloatResponse = z.infer<typeof MassiveFloatResponseSchema>

export const MassiveShortInterestRowSchema = z.object({
  settlement_date: z.string().nullish(),
  short_interest: MassiveNumberSchema.nullish(),
  days_to_cover: MassiveNumberSchema.nullish(),
  avg_daily_volume: MassiveNumberSchema.nullish()
})
export type MassiveShortInterestRow = z.infer<typeof MassiveShortInterestRowSchema>

export const MassiveShortInterestResponseSchema = z.object({
  results: z.array(MassiveShortInterestRowSchema).nullish()
})
export type MassiveShortInterestResponse = z.infer<typeof MassiveShortInterestResponseSchema>

export const MassiveShortVolumeRowSchema = z.object({
  date: z.string().nullish(),
  short_volume: MassiveNumberSchema.nullish(),
  short_volume_ratio: MassiveNumberSchema.nullish(),
  total_volume: MassiveNumberSchema.nullish()
})
export type MassiveShortVolumeRow = z.infer<typeof MassiveShortVolumeRowSchema>

export const MassiveShortVolumeResponseSchema = z.object({
  results: z.array(MassiveShortVolumeRowSchema).nullish()
})
export type MassiveShortVolumeResponse = z.infer<typeof MassiveShortVolumeResponseSchema>

export const MassiveDividendRowSchema = z.object({
  ex_dividend_date: z.string().nullish(),
  pay_date: z.string().nullish(),
  cash_amount: MassiveNumberSchema.nullish(),
  frequency: z.number().int().nullish(),
  distribution_type: z.string().nullish()
})
export type MassiveDividendRow = z.infer<typeof MassiveDividendRowSchema>

export const MassiveDividendsResponseSchema = z.object({
  results: z.array(MassiveDividendRowSchema).nullish()
})
export type MassiveDividendsResponse = z.infer<typeof MassiveDividendsResponseSchema>

export const MassiveSplitRowSchema = z.object({
  execution_date: z.string().nullish(),
  split_from: z.number().nullish(),
  split_to: z.number().nullish()
})
export type MassiveSplitRow = z.infer<typeof MassiveSplitRowSchema>

export const MassiveSplitsResponseSchema = z.object({
  results: z.array(MassiveSplitRowSchema).nullish()
})
export type MassiveSplitsResponse = z.infer<typeof MassiveSplitsResponseSchema>

export const MassiveFilingRowSchema = z.object({
  accession_number: z.string().nullish(),
  form_type: z.string().nullish(),
  filing_date: z.string().nullish(),
  issuer_name: z.string().nullish(),
  filing_url: z.string().nullish()
})
export type MassiveFilingRow = z.infer<typeof MassiveFilingRowSchema>

export const MassiveFilingsResponseSchema = z.object({
  results: z.array(MassiveFilingRowSchema).nullish()
})
export type MassiveFilingsResponse = z.infer<typeof MassiveFilingsResponseSchema>

export const Massive10KSectionRowSchema = z.object({
  filing_date: z.string().nullish(),
  period_end: z.string().nullish(),
  section: z.string().nullish(),
  filing_url: z.string().nullish(),
  text: z.string().nullish()
})
export type Massive10KSectionRow = z.infer<typeof Massive10KSectionRowSchema>

export const Massive10KSectionsResponseSchema = z.object({
  results: z.array(Massive10KSectionRowSchema).nullish()
})
export type Massive10KSectionsResponse = z.infer<typeof Massive10KSectionsResponseSchema>

export const Massive8KTextRowSchema = z.object({
  filing_date: z.string().nullish(),
  form_type: z.string().nullish(),
  filing_url: z.string().nullish(),
  items_text: z.string().nullish()
})
export type Massive8KTextRow = z.infer<typeof Massive8KTextRowSchema>

export const Massive8KTextResponseSchema = z.object({
  results: z.array(Massive8KTextRowSchema).nullish()
})
export type Massive8KTextResponse = z.infer<typeof Massive8KTextResponseSchema>

export const MassiveRiskFactorRowSchema = z.object({
  filing_date: z.string().nullish(),
  primary_category: z.string().nullish(),
  secondary_category: z.string().nullish(),
  tertiary_category: z.string().nullish(),
  supporting_text: z.string().nullish()
})
export type MassiveRiskFactorRow = z.infer<typeof MassiveRiskFactorRowSchema>

export const MassiveRiskFactorsResponseSchema = z.object({
  results: z.array(MassiveRiskFactorRowSchema).nullish()
})
export type MassiveRiskFactorsResponse = z.infer<typeof MassiveRiskFactorsResponseSchema>

// ---------------------------------------------------------------------------
// Agent-facing output shapes printed by `tribes-cli stock-fundamentals`.
// ---------------------------------------------------------------------------

export const StockFundamentalsTimeframeSchema = z.enum(['annual', 'quarterly'])
export type StockFundamentalsTimeframe = z.infer<typeof StockFundamentalsTimeframeSchema>

const StockFundamentalsIncomeRowSchema = z.object({
  period_end: z.string().nullish(),
  fiscal_year: z.string().nullish(),
  fiscal_quarter: z.number().nullish(),
  timeframe: z.string().nullish(),
  revenue: z.number().nullish(),
  cost_of_revenue: z.number().nullish(),
  gross_profit: z.number().nullish(),
  operating_income: z.number().nullish(),
  net_income: z.number().nullish(),
  eps_basic: z.number().nullish(),
  eps_diluted: z.number().nullish()
})

export const StockFundamentalsIncomeSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  statements: z.array(StockFundamentalsIncomeRowSchema)
})
export type StockFundamentalsIncome = z.infer<typeof StockFundamentalsIncomeSchema>

const StockFundamentalsBalanceRowSchema = z.object({
  period_end: z.string().nullish(),
  fiscal_year: z.string().nullish(),
  fiscal_quarter: z.number().nullish(),
  timeframe: z.string().nullish(),
  total_assets: z.number().nullish(),
  current_assets: z.number().nullish(),
  cash_and_equivalents: z.number().nullish(),
  total_liabilities: z.number().nullish(),
  current_liabilities: z.number().nullish(),
  total_equity: z.number().nullish(),
  retained_earnings: z.number().nullish()
})

export const StockFundamentalsBalanceSheetsSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  sheets: z.array(StockFundamentalsBalanceRowSchema)
})
export type StockFundamentalsBalanceSheets = z.infer<typeof StockFundamentalsBalanceSheetsSchema>

const StockFundamentalsCashFlowRowSchema = z.object({
  period_end: z.string().nullish(),
  fiscal_year: z.string().nullish(),
  fiscal_quarter: z.number().nullish(),
  timeframe: z.string().nullish(),
  operating_cash_flow: z.number().nullish(),
  investing_cash_flow: z.number().nullish(),
  financing_cash_flow: z.number().nullish(),
  change_in_cash: z.number().nullish(),
  net_income: z.number().nullish()
})

export const StockFundamentalsCashFlowsSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  statements: z.array(StockFundamentalsCashFlowRowSchema)
})
export type StockFundamentalsCashFlows = z.infer<typeof StockFundamentalsCashFlowsSchema>

const StockFundamentalsRatiosRowSchema = z.object({
  price_to_earnings: z.number().nullish(),
  price_to_book: z.number().nullish(),
  price_to_sales: z.number().nullish(),
  return_on_assets: z.number().nullish(),
  return_on_equity: z.number().nullish(),
  earnings_per_share: z.number().nullish(),
  dividend_yield: z.number().nullish(),
  enterprise_value: z.number().nullish(),
  ev_to_ebitda: z.number().nullish(),
  current_ratio: z.number().nullish(),
  quick_ratio: z.number().nullish(),
  debt_to_equity: z.number().nullish()
})

export const StockFundamentalsRatiosSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  ratios: z.array(StockFundamentalsRatiosRowSchema)
})
export type StockFundamentalsRatios = z.infer<typeof StockFundamentalsRatiosSchema>

const StockFundamentalsFloatRowSchema = z.object({
  effective_date: z.string().nullish(),
  free_float: z.number().nullish(),
  free_float_pct: z.number().nullish()
})

export const StockFundamentalsFloatSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  rows: z.array(StockFundamentalsFloatRowSchema)
})
export type StockFundamentalsFloat = z.infer<typeof StockFundamentalsFloatSchema>

const StockFundamentalsShortInterestRowSchema = z.object({
  settlement_date: z.string().nullish(),
  short_interest: z.number().nullish(),
  days_to_cover: z.number().nullish(),
  avg_daily_volume: z.number().nullish()
})

export const StockFundamentalsShortInterestSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  rows: z.array(StockFundamentalsShortInterestRowSchema)
})
export type StockFundamentalsShortInterest = z.infer<typeof StockFundamentalsShortInterestSchema>

const StockFundamentalsShortVolumeRowSchema = z.object({
  date: z.string().nullish(),
  short_volume: z.number().nullish(),
  short_volume_ratio: z.number().nullish(),
  total_volume: z.number().nullish()
})

export const StockFundamentalsShortVolumeSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  rows: z.array(StockFundamentalsShortVolumeRowSchema)
})
export type StockFundamentalsShortVolume = z.infer<typeof StockFundamentalsShortVolumeSchema>

const StockFundamentalsDividendRowSchema = z.object({
  ex_dividend_date: z.string().nullish(),
  pay_date: z.string().nullish(),
  cash_amount: z.number().nullish(),
  frequency: z.number().nullish(),
  distribution_type: z.string().nullish()
})

export const StockFundamentalsDividendsSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  dividends: z.array(StockFundamentalsDividendRowSchema)
})
export type StockFundamentalsDividends = z.infer<typeof StockFundamentalsDividendsSchema>

const StockFundamentalsSplitRowSchema = z.object({
  execution_date: z.string().nullish(),
  split_from: z.number().nullish(),
  split_to: z.number().nullish()
})

export const StockFundamentalsSplitsSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  splits: z.array(StockFundamentalsSplitRowSchema)
})
export type StockFundamentalsSplits = z.infer<typeof StockFundamentalsSplitsSchema>

const StockFundamentalsFilingRowSchema = z.object({
  filing_date: z.string().nullish(),
  form_type: z.string().nullish(),
  issuer_name: z.string().nullish(),
  accession_number: z.string().nullish(),
  filing_url: z.string().nullish()
})

export const StockFundamentalsFilingsSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  filings: z.array(StockFundamentalsFilingRowSchema)
})
export type StockFundamentalsFilings = z.infer<typeof StockFundamentalsFilingsSchema>

const StockFundamentalsTenKSectionRowSchema = z.object({
  filing_date: z.string().nullish(),
  period_end: z.string().nullish(),
  section: z.string().nullish(),
  filing_url: z.string().nullish(),
  text: z.string().nullish()
})

export const StockFundamentalsTenKSectionsSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  sections: z.array(StockFundamentalsTenKSectionRowSchema)
})
export type StockFundamentalsTenKSections = z.infer<typeof StockFundamentalsTenKSectionsSchema>

const StockFundamentalsEightKRowSchema = z.object({
  filing_date: z.string().nullish(),
  form_type: z.string().nullish(),
  filing_url: z.string().nullish(),
  text: z.string().nullish()
})

export const StockFundamentalsEightKSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  filings: z.array(StockFundamentalsEightKRowSchema)
})
export type StockFundamentalsEightK = z.infer<typeof StockFundamentalsEightKSchema>

const StockFundamentalsRiskFactorRowSchema = z.object({
  filing_date: z.string().nullish(),
  primary_category: z.string().nullish(),
  secondary_category: z.string().nullish(),
  tertiary_category: z.string().nullish(),
  text: z.string().nullish()
})

export const StockFundamentalsRiskFactorsSchema = z.object({
  source: z.literal('massive'),
  symbol: z.string(),
  risk_factors: z.array(StockFundamentalsRiskFactorRowSchema)
})
export type StockFundamentalsRiskFactors = z.infer<typeof StockFundamentalsRiskFactorsSchema>

// ---------------------------------------------------------------------------
// `tribes-cli stock-fundamentals` command options.
// ---------------------------------------------------------------------------

export const StockFundamentalsStatementCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  timeframe: StockFundamentalsTimeframeSchema.nullish(),
  limit: z.number().int().min(1).max(20).nullish(),
  out: z.string().nullish()
})
export type StockFundamentalsStatementCommandOptions = z.infer<
  typeof StockFundamentalsStatementCommandOptionsSchema
>

export const StockFundamentalsSymbolCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  limit: z.number().int().min(1).max(50).nullish(),
  out: z.string().nullish()
})
export type StockFundamentalsSymbolCommandOptions = z.infer<
  typeof StockFundamentalsSymbolCommandOptionsSchema
>

export const StockFundamentalsFilingsCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  formType: z.string().min(1).nullish(),
  limit: z.number().int().min(1).max(50).nullish(),
  out: z.string().nullish()
})
export type StockFundamentalsFilingsCommandOptions = z.infer<
  typeof StockFundamentalsFilingsCommandOptionsSchema
>

export const StockFundamentalsTenKSectionCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  section: z.string().min(1),
  limit: z.number().int().min(1).max(5).nullish(),
  out: z.string().nullish()
})
export type StockFundamentalsTenKSectionCommandOptions = z.infer<
  typeof StockFundamentalsTenKSectionCommandOptionsSchema
>

export const StockFundamentalsEightKCommandOptionsSchema = z.object({
  symbol: z.string().min(1),
  limit: z.number().int().min(1).max(5).nullish(),
  out: z.string().nullish()
})
export type StockFundamentalsEightKCommandOptions = z.infer<
  typeof StockFundamentalsEightKCommandOptionsSchema
>
