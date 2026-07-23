import { afterEach, describe, expect, it, vi } from 'vitest'

import { StockFundamentalsService } from '@/services/StockFundamentalsService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_API_KEY = 'test-massive-key'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_API_KEY): StockFundamentalsService {
  return new StockFundamentalsService({ apiKey })
}

describe('StockFundamentalsService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shapes income statements and sends the bearer key with sorted params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [
          {
            cik: '0000320193',
            tickers: ['AAPL'],
            period_end: '2025-09-27',
            fiscal_year: 2025,
            fiscal_quarter: null,
            timeframe: 'annual',
            revenues: 416161000000,
            cost_of_revenue: 223546000000,
            gross_profit: 192615000000,
            operating_income_loss: 127437000000,
            net_income_loss: 112010000000,
            basic_earnings_per_share: 7.41,
            diluted_earnings_per_share: 7.38
          }
        ]
      })
    )

    const result = await makeService().getIncomeStatements({
      symbol: 'AAPL',
      timeframe: 'annual',
      limit: 4
    })

    expect(result).toEqual({
      source: 'massive',
      symbol: 'AAPL',
      statements: [
        {
          period_end: '2025-09-27',
          fiscal_year: '2025',
          fiscal_quarter: null,
          timeframe: 'annual',
          revenue: 416161000000,
          cost_of_revenue: 223546000000,
          gross_profit: 192615000000,
          operating_income: 127437000000,
          net_income: 112010000000,
          eps_basic: 7.41,
          eps_diluted: 7.38
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://api.massive.com')
    expect(requestUrl.pathname).toBe('/stocks/financials/v1/income-statements')
    expect(requestUrl.searchParams.get('tickers')).toBe('AAPL')
    expect(requestUrl.searchParams.get('timeframe')).toBe('annual')
    expect(requestUrl.searchParams.get('limit')).toBe('4')
    expect(requestUrl.searchParams.get('sort')).toBe('period_end.desc')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TEST_API_KEY}`
    })
  })

  it('shapes balance sheets, parsing string-encoded numbers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [
          {
            period_end: '2025-09-27',
            fiscal_year: '2025',
            fiscal_quarter: 4,
            timeframe: 'quarterly',
            total_assets: '364980000000',
            total_current_assets: '152987000000',
            cash_and_equivalents: '29943000000',
            total_liabilities: '308030000000',
            total_current_liabilities: '176392000000',
            total_equity: '56950000000',
            retained_earnings_deficit: '-19154000000'
          }
        ]
      })
    )

    const result = await makeService().getBalanceSheets({
      symbol: 'AAPL',
      timeframe: 'quarterly',
      limit: 1
    })

    expect(result.sheets).toEqual([
      {
        period_end: '2025-09-27',
        fiscal_year: '2025',
        fiscal_quarter: 4,
        timeframe: 'quarterly',
        total_assets: 364980000000,
        current_assets: 152987000000,
        cash_and_equivalents: 29943000000,
        total_liabilities: 308030000000,
        current_liabilities: 176392000000,
        total_equity: 56950000000,
        retained_earnings: -19154000000
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/stocks/financials/v1/balance-sheets')
    expect(requestUrl.searchParams.get('timeframe')).toBe('quarterly')
  })

  it('queries ratios with the singular ticker param', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [
          {
            ticker: 'AAPL',
            price_to_earnings: 34.2,
            price_to_book: 61.7,
            return_on_equity: 1.51,
            debt_to_equity: 1.87
          }
        ]
      })
    )

    const result = await makeService().getRatios({ symbol: 'AAPL', limit: 1 })

    expect(result.ratios[0]).toMatchObject({
      price_to_earnings: 34.2,
      price_to_book: 61.7,
      return_on_equity: 1.51,
      debt_to_equity: 1.87
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/stocks/financials/v1/ratios')
    expect(requestUrl.searchParams.get('ticker')).toBe('AAPL')
    expect(requestUrl.searchParams.get('limit')).toBe('1')
  })

  it('shapes short interest rows sorted by settlement date', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [
          {
            ticker: 'AAPL',
            settlement_date: '2026-07-15',
            short_interest: 120500000,
            days_to_cover: 2.4,
            avg_daily_volume: 50200000
          }
        ]
      })
    )

    const result = await makeService().getShortInterest({ symbol: 'AAPL', limit: 5 })

    expect(result.rows).toEqual([
      {
        settlement_date: '2026-07-15',
        short_interest: 120500000,
        days_to_cover: 2.4,
        avg_daily_volume: 50200000
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/stocks/v1/short-interest')
    expect(requestUrl.searchParams.get('sort')).toBe('settlement_date.desc')
  })

  it('passes the form-type filter to the filings index only when set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse({
        status: 'OK',
        results: [
          {
            accession_number: '0000320193-25-000123',
            cik: '0000320193',
            ticker: 'AAPL',
            issuer_name: 'Apple Inc.',
            form_type: '10-K',
            filing_date: '2025-11-01',
            filing_url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000123.htm'
          }
        ]
      })
    )

    const result = await makeService().getFilings({ symbol: 'AAPL', formType: '10-K', limit: 10 })

    expect(result.filings).toEqual([
      {
        filing_date: '2025-11-01',
        form_type: '10-K',
        issuer_name: 'Apple Inc.',
        accession_number: '0000320193-25-000123',
        filing_url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000123.htm'
      }
    ])

    const withFilter = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(withFilter.pathname).toBe('/stocks/filings/vX/index')
    expect(withFilter.searchParams.get('form_type')).toBe('10-K')
    expect(withFilter.searchParams.get('sort')).toBe('filing_date.desc')

    await makeService().getFilings({ symbol: 'AAPL', formType: null, limit: 10 })
    const withoutFilter = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(withoutFilter.searchParams.has('form_type')).toBe(false)
  })

  it('returns 10-K section text with the section filter applied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [
          {
            ticker: 'AAPL',
            filing_date: '2025-11-01',
            period_end: '2025-09-27',
            section: 'risk_factors',
            filing_url: 'https://www.sec.gov/example',
            text: 'The Company faces intense competition...'
          }
        ]
      })
    )

    const result = await makeService().getTenKSections({
      symbol: 'AAPL',
      section: 'risk_factors',
      limit: 1
    })

    expect(result.sections[0]).toMatchObject({
      section: 'risk_factors',
      text: 'The Company faces intense competition...'
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/stocks/filings/10-K/vX/sections')
    expect(requestUrl.searchParams.get('section')).toBe('risk_factors')
  })

  it('maps 8-K items_text into the text field', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [
          {
            ticker: 'AAPL',
            filing_date: '2026-07-01',
            form_type: '8-K',
            filing_url: 'https://www.sec.gov/example-8k',
            items_text: 'Item 2.02 Results of Operations...'
          }
        ]
      })
    )

    const result = await makeService().getEightK({ symbol: 'AAPL', limit: 1 })

    expect(result.filings).toEqual([
      {
        filing_date: '2026-07-01',
        form_type: '8-K',
        filing_url: 'https://www.sec.gov/example-8k',
        text: 'Item 2.02 Results of Operations...'
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/stocks/filings/8-K/vX/text')
    expect(requestUrl.searchParams.get('sort')).toBe('filing_date.desc')
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      makeService('').getIncomeStatements({ symbol: 'AAPL', timeframe: 'annual', limit: 4 })
    ).rejects.toThrow(
      'MASSIVE_API_KEY is not set — the `stock-fundamentals` command group is unavailable on this box'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on Massive errors without leaking the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"unauthorized"}', { status: 401, statusText: 'Unauthorized' })
    )

    const error = await makeService()
      .getRiskFactors({ symbol: 'AAPL', limit: 10 })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain(
        'Massive /stocks/filings/vX/risk-factors failed: 401 Unauthorized'
      )
      expect(error.message).not.toContain(TEST_API_KEY)
    }
  })
})
