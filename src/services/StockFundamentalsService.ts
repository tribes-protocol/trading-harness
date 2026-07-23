import type {
  StockFundamentalsBalanceSheets,
  StockFundamentalsCashFlows,
  StockFundamentalsDividends,
  StockFundamentalsEightK,
  StockFundamentalsFilings,
  StockFundamentalsFloat,
  StockFundamentalsIncome,
  StockFundamentalsRatios,
  StockFundamentalsRiskFactors,
  StockFundamentalsShortInterest,
  StockFundamentalsShortVolume,
  StockFundamentalsSplits,
  StockFundamentalsTenKSections,
  StockFundamentalsTimeframe
} from '@/types/StockFundamentals'
import {
  Massive8KTextResponseSchema,
  Massive10KSectionsResponseSchema,
  MassiveBalanceSheetsResponseSchema,
  MassiveCashFlowsResponseSchema,
  MassiveDividendsResponseSchema,
  MassiveFilingsResponseSchema,
  MassiveFloatResponseSchema,
  MassiveIncomeStatementsResponseSchema,
  MassiveRatiosResponseSchema,
  MassiveRiskFactorsResponseSchema,
  MassiveShortInterestResponseSchema,
  MassiveShortVolumeResponseSchema,
  MassiveSplitsResponseSchema,
  StockFundamentalsBalanceSheetsSchema,
  StockFundamentalsCashFlowsSchema,
  StockFundamentalsDividendsSchema,
  StockFundamentalsEightKSchema,
  StockFundamentalsFilingsSchema,
  StockFundamentalsFloatSchema,
  StockFundamentalsIncomeSchema,
  StockFundamentalsRatiosSchema,
  StockFundamentalsRiskFactorsSchema,
  StockFundamentalsShortInterestSchema,
  StockFundamentalsShortVolumeSchema,
  StockFundamentalsSplitsSchema,
  StockFundamentalsTenKSectionsSchema
} from '@/types/StockFundamentals'
import { isNullish } from '@/utils/Lang'

type StockFundamentalsServiceParams = {
  readonly apiKey: string
}

type GetStatementsParams = {
  readonly symbol: string
  readonly timeframe: StockFundamentalsTimeframe
  readonly limit: number
}

type GetBySymbolParams = {
  readonly symbol: string
  readonly limit: number
}

type GetFilingsParams = {
  readonly symbol: string
  readonly formType: string | null | undefined
  readonly limit: number
}

type GetTenKSectionsParams = {
  readonly symbol: string
  readonly section: string
  readonly limit: number
}

// Massive is not yet in the egress catalog: inside a sandbox the
// MASSIVE_API_KEY env stays absent until the control plane adds the catalog
// entry, billing, and placeholder injection, so this group reports itself
// unavailable in-VM — that is expected, not a bug.
const MASSIVE_BASE_URL = 'https://api.massive.com/'
const ERROR_BODY_MAX_CHARS = 300

export class StockFundamentalsService {
  private readonly apiKey: string

  constructor(params: StockFundamentalsServiceParams) {
    this.apiKey = params.apiKey
  }

  async getIncomeStatements(params: GetStatementsParams): Promise<StockFundamentalsIncome> {
    const raw = await this.fetch('stocks/financials/v1/income-statements', {
      tickers: params.symbol,
      timeframe: params.timeframe,
      limit: String(params.limit),
      sort: 'period_end.desc'
    })
    const parsed = MassiveIncomeStatementsResponseSchema.parse(raw)
    return StockFundamentalsIncomeSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      statements: (parsed.results ?? []).map((row) => ({
        period_end: row.period_end,
        fiscal_year: row.fiscal_year,
        fiscal_quarter: row.fiscal_quarter,
        timeframe: row.timeframe,
        revenue: this.asFiniteNumber(row.revenues),
        cost_of_revenue: this.asFiniteNumber(row.cost_of_revenue),
        gross_profit: this.asFiniteNumber(row.gross_profit),
        operating_income: this.asFiniteNumber(row.operating_income_loss),
        net_income: this.asFiniteNumber(row.net_income_loss),
        eps_basic: this.asFiniteNumber(row.basic_earnings_per_share),
        eps_diluted: this.asFiniteNumber(row.diluted_earnings_per_share)
      }))
    })
  }

  async getBalanceSheets(params: GetStatementsParams): Promise<StockFundamentalsBalanceSheets> {
    const raw = await this.fetch('stocks/financials/v1/balance-sheets', {
      tickers: params.symbol,
      timeframe: params.timeframe,
      limit: String(params.limit),
      sort: 'period_end.desc'
    })
    const parsed = MassiveBalanceSheetsResponseSchema.parse(raw)
    return StockFundamentalsBalanceSheetsSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      sheets: (parsed.results ?? []).map((row) => ({
        period_end: row.period_end,
        fiscal_year: row.fiscal_year,
        fiscal_quarter: row.fiscal_quarter,
        timeframe: row.timeframe,
        total_assets: this.asFiniteNumber(row.total_assets),
        current_assets: this.asFiniteNumber(row.total_current_assets),
        cash_and_equivalents: this.asFiniteNumber(row.cash_and_equivalents),
        total_liabilities: this.asFiniteNumber(row.total_liabilities),
        current_liabilities: this.asFiniteNumber(row.total_current_liabilities),
        total_equity: this.asFiniteNumber(row.total_equity),
        retained_earnings: this.asFiniteNumber(row.retained_earnings_deficit)
      }))
    })
  }

  async getCashFlowStatements(params: GetStatementsParams): Promise<StockFundamentalsCashFlows> {
    const raw = await this.fetch('stocks/financials/v1/cash-flow-statements', {
      tickers: params.symbol,
      timeframe: params.timeframe,
      limit: String(params.limit),
      sort: 'period_end.desc'
    })
    const parsed = MassiveCashFlowsResponseSchema.parse(raw)
    return StockFundamentalsCashFlowsSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      statements: (parsed.results ?? []).map((row) => ({
        period_end: row.period_end,
        fiscal_year: row.fiscal_year,
        fiscal_quarter: row.fiscal_quarter,
        timeframe: row.timeframe,
        operating_cash_flow: this.asFiniteNumber(row.net_cash_from_operating_activities),
        investing_cash_flow: this.asFiniteNumber(row.net_cash_from_investing_activities),
        financing_cash_flow: this.asFiniteNumber(row.net_cash_from_financing_activities),
        change_in_cash: this.asFiniteNumber(row.change_in_cash_and_equivalents),
        net_income: this.asFiniteNumber(row.net_income)
      }))
    })
  }

  async getRatios(params: GetBySymbolParams): Promise<StockFundamentalsRatios> {
    const raw = await this.fetch('stocks/financials/v1/ratios', {
      ticker: params.symbol,
      limit: String(params.limit)
    })
    const parsed = MassiveRatiosResponseSchema.parse(raw)
    return StockFundamentalsRatiosSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      ratios: (parsed.results ?? []).map((row) => ({
        price_to_earnings: this.asFiniteNumber(row.price_to_earnings),
        price_to_book: this.asFiniteNumber(row.price_to_book),
        price_to_sales: this.asFiniteNumber(row.price_to_sales),
        return_on_assets: this.asFiniteNumber(row.return_on_assets),
        return_on_equity: this.asFiniteNumber(row.return_on_equity),
        earnings_per_share: this.asFiniteNumber(row.earnings_per_share),
        dividend_yield: this.asFiniteNumber(row.dividend_yield),
        enterprise_value: this.asFiniteNumber(row.enterprise_value),
        ev_to_ebitda: this.asFiniteNumber(row.ev_to_ebitda),
        current_ratio: this.asFiniteNumber(row.current_ratio),
        quick_ratio: this.asFiniteNumber(row.quick_ratio),
        debt_to_equity: this.asFiniteNumber(row.debt_to_equity)
      }))
    })
  }

  async getFloat(params: GetBySymbolParams): Promise<StockFundamentalsFloat> {
    const raw = await this.fetch('stocks/vX/float', {
      ticker: params.symbol,
      limit: String(params.limit)
    })
    const parsed = MassiveFloatResponseSchema.parse(raw)
    return StockFundamentalsFloatSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      rows: (parsed.results ?? []).map((row) => ({
        effective_date: row.effective_date,
        free_float: this.asFiniteNumber(row.free_float),
        free_float_pct: this.asFiniteNumber(row.free_float_percent)
      }))
    })
  }

  async getShortInterest(params: GetBySymbolParams): Promise<StockFundamentalsShortInterest> {
    const raw = await this.fetch('stocks/v1/short-interest', {
      ticker: params.symbol,
      limit: String(params.limit),
      sort: 'settlement_date.desc'
    })
    const parsed = MassiveShortInterestResponseSchema.parse(raw)
    return StockFundamentalsShortInterestSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      rows: (parsed.results ?? []).map((row) => ({
        settlement_date: row.settlement_date,
        short_interest: this.asFiniteNumber(row.short_interest),
        days_to_cover: this.asFiniteNumber(row.days_to_cover),
        avg_daily_volume: this.asFiniteNumber(row.avg_daily_volume)
      }))
    })
  }

  async getShortVolume(params: GetBySymbolParams): Promise<StockFundamentalsShortVolume> {
    const raw = await this.fetch('stocks/v1/short-volume', {
      ticker: params.symbol,
      limit: String(params.limit),
      sort: 'date.desc'
    })
    const parsed = MassiveShortVolumeResponseSchema.parse(raw)
    return StockFundamentalsShortVolumeSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      rows: (parsed.results ?? []).map((row) => ({
        date: row.date,
        short_volume: this.asFiniteNumber(row.short_volume),
        short_volume_ratio: this.asFiniteNumber(row.short_volume_ratio),
        total_volume: this.asFiniteNumber(row.total_volume)
      }))
    })
  }

  async getDividends(params: GetBySymbolParams): Promise<StockFundamentalsDividends> {
    const raw = await this.fetch('stocks/v1/dividends', {
      ticker: params.symbol,
      limit: String(params.limit),
      sort: 'ex_dividend_date.desc'
    })
    const parsed = MassiveDividendsResponseSchema.parse(raw)
    return StockFundamentalsDividendsSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      dividends: (parsed.results ?? []).map((row) => ({
        ex_dividend_date: row.ex_dividend_date,
        pay_date: row.pay_date,
        cash_amount: this.asFiniteNumber(row.cash_amount),
        frequency: row.frequency,
        distribution_type: row.distribution_type
      }))
    })
  }

  async getSplits(params: GetBySymbolParams): Promise<StockFundamentalsSplits> {
    const raw = await this.fetch('stocks/v1/splits', {
      ticker: params.symbol,
      limit: String(params.limit),
      sort: 'execution_date.desc'
    })
    const parsed = MassiveSplitsResponseSchema.parse(raw)
    return StockFundamentalsSplitsSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      splits: (parsed.results ?? []).map((row) => ({
        execution_date: row.execution_date,
        split_from: row.split_from,
        split_to: row.split_to
      }))
    })
  }

  async getFilings(params: GetFilingsParams): Promise<StockFundamentalsFilings> {
    const raw = await this.fetch('stocks/filings/vX/index', {
      ticker: params.symbol,
      limit: String(params.limit),
      sort: 'filing_date.desc',
      ...(isNullish(params.formType) ? {} : { form_type: params.formType })
    })
    const parsed = MassiveFilingsResponseSchema.parse(raw)
    return StockFundamentalsFilingsSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      filings: (parsed.results ?? []).map((row) => ({
        filing_date: row.filing_date,
        form_type: row.form_type,
        issuer_name: row.issuer_name,
        accession_number: row.accession_number,
        filing_url: row.filing_url
      }))
    })
  }

  async getTenKSections(params: GetTenKSectionsParams): Promise<StockFundamentalsTenKSections> {
    const raw = await this.fetch('stocks/filings/10-K/vX/sections', {
      ticker: params.symbol,
      section: params.section,
      limit: String(params.limit)
    })
    const parsed = Massive10KSectionsResponseSchema.parse(raw)
    return StockFundamentalsTenKSectionsSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      sections: (parsed.results ?? []).map((row) => ({
        filing_date: row.filing_date,
        period_end: row.period_end,
        section: row.section,
        filing_url: row.filing_url,
        text: row.text
      }))
    })
  }

  async getEightK(params: GetBySymbolParams): Promise<StockFundamentalsEightK> {
    const raw = await this.fetch('stocks/filings/8-K/vX/text', {
      ticker: params.symbol,
      limit: String(params.limit),
      sort: 'filing_date.desc'
    })
    const parsed = Massive8KTextResponseSchema.parse(raw)
    return StockFundamentalsEightKSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      filings: (parsed.results ?? []).map((row) => ({
        filing_date: row.filing_date,
        form_type: row.form_type,
        filing_url: row.filing_url,
        text: row.items_text
      }))
    })
  }

  async getRiskFactors(params: GetBySymbolParams): Promise<StockFundamentalsRiskFactors> {
    const raw = await this.fetch('stocks/filings/vX/risk-factors', {
      ticker: params.symbol,
      limit: String(params.limit)
    })
    const parsed = MassiveRiskFactorsResponseSchema.parse(raw)
    return StockFundamentalsRiskFactorsSchema.parse({
      source: 'massive',
      symbol: params.symbol,
      risk_factors: (parsed.results ?? []).map((row) => ({
        filing_date: row.filing_date,
        primary_category: row.primary_category,
        secondary_category: row.secondary_category,
        tertiary_category: row.tertiary_category,
        text: row.supporting_text
      }))
    })
  }

  private async fetch(path: string, searchParams: Record<string, string>): Promise<unknown> {
    if (this.apiKey === '') {
      throw new Error(
        'MASSIVE_API_KEY is not set — the `stock-fundamentals` command group is unavailable on this box'
      )
    }
    const url = new URL(path, MASSIVE_BASE_URL)
    for (const [key, value] of Object.entries(searchParams)) {
      url.searchParams.set(key, value)
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      }
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Massive /${path} failed: ${response.status} ${response.statusText} ${body.slice(0, ERROR_BODY_MAX_CHARS)}`
      )
    }
    const data: unknown = await response.json()
    return data
  }

  // Massive numeric fields are numbers on the wire but decimal strings are
  // tolerated; anything non-finite collapses to null.
  private asFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }
}
