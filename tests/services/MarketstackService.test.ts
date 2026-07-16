import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MarketstackService } from '@/services/MarketstackService'
import { ensureJsonTreeString } from '@/utils/Lang'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_API_KEY = 'test-key'

const EOD_RESPONSE = {
  pagination: { limit: 100, offset: 0, count: 2, total: 2 },
  data: [
    {
      date: '2024-09-27T00:00:00+0000',
      symbol: 'AAPL',
      exchange: 'XNAS',
      name: 'Apple Inc',
      asset_type: 'Stock',
      open: 228.46,
      high: 229.52,
      low: 227.3,
      close: 227.79,
      volume: 34026000,
      adj_open: 228.46,
      adj_high: 229.52,
      adj_low: 227.3,
      adj_close: 227.79,
      adj_volume: 34026000,
      split_factor: 1,
      dividend: 0,
      exchange_code: 'NASDAQ',
      price_currency: 'usd'
    },
    {
      // Sparse row: provider omitted the adjusted/metadata fields.
      date: '2024-09-27T00:00:00+0000',
      symbol: 'MSFT',
      open: 431.3,
      high: 432.1,
      low: 428.2,
      close: 428.9,
      volume: 12345678
    }
  ]
}

const INTRADAY_RESPONSE = {
  pagination: { limit: 100, offset: 0, count: 1, total: 1 },
  data: [
    {
      date: '2024-09-27T15:00:00+0000',
      symbol: 'BRK-B',
      exchange: 'IEXG',
      open: 460.1,
      high: 461.9,
      low: 459.8,
      close: 461.2,
      volume: 250000,
      // IEX TOPS quote fields are null without entitlement.
      mid: null,
      last: null,
      bid_price: null,
      bid_size: null,
      ask_price: null,
      ask_size: null,
      last_size: null,
      marketstack_last: 461.15
    }
  ]
}

const TICKERS_LIST_RESPONSE = {
  pagination: { limit: 20, offset: 0, count: 2, total: 2 },
  data: [
    {
      name: 'Apple Inc',
      // v2 search rows use 'ticker', NOT 'symbol'.
      ticker: 'AAPL',
      has_intraday: true,
      has_eod: true,
      stock_exchange: { name: 'NASDAQ Stock Exchange', acronym: 'NASDAQ', mic: 'XNAS' }
    },
    {
      name: 'Apple Hospitality REIT Inc',
      ticker: 'APLE',
      has_eod: true
    }
  ]
}

const TICKER_PROFILE_RESPONSE = {
  name: 'Apple Inc',
  ticker: 'AAPL',
  cik: 320193,
  isin: 'US0378331005',
  cusip: '037833100',
  sector: 'Technology',
  industry: 'Consumer Electronics',
  stock_exchange: {
    name: 'NASDAQ Stock Exchange',
    acronym: 'NASDAQ',
    mic: 'XNAS',
    country: 'USA',
    city: 'New York',
    website: 'www.nasdaq.com'
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function requestUrl(input: unknown): URL {
  if (input instanceof URL) {
    return input
  }
  throw new Error('expected fetch to be called with a URL instance')
}

function buildService(): MarketstackService {
  return new MarketstackService({ apiKey: TEST_API_KEY })
}

describe('MarketstackService', () => {
  beforeEach(async () => {
    process.env.TRIBES_PROVIDER_CACHE_BASE = await mkdtemp(join(tmpdir(), 'cache-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.TRIBES_PROVIDER_CACHE_BASE
  })

  it('fetches EOD bars, normalizes rows, and passes dates through as strings', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(EOD_RESPONSE))

    const result = await buildService().getEodBars({
      symbols: 'aapl, msft',
      dateFrom: '2024-09-01',
      dateTo: null,
      limit: 100,
      latest: false
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = requestUrl(fetchSpy.mock.calls[0]?.[0])
    expect(url.origin).toBe('https://api.marketstack.com')
    expect(url.pathname).toBe('/v2/eod')
    expect(url.searchParams.get('symbols')).toBe('AAPL,MSFT')
    expect(url.searchParams.get('date_from')).toBe('2024-09-01')
    expect(url.searchParams.get('date_to')).toBeNull()
    expect(url.searchParams.get('limit')).toBe('100')
    expect(url.searchParams.get('access_key')).toBe(TEST_API_KEY)

    expect(result).toEqual({
      source: 'marketstack',
      pagination: { limit: 100, offset: 0, count: 2, total: 2 },
      bars: [
        {
          symbol: 'AAPL',
          date: '2024-09-27T00:00:00+0000',
          open: 228.46,
          high: 229.52,
          low: 227.3,
          close: 227.79,
          volume: 34026000,
          adj_close: 227.79,
          split_factor: 1,
          dividend: 0,
          exchange_code: 'NASDAQ',
          price_currency: 'usd'
        },
        {
          symbol: 'MSFT',
          date: '2024-09-27T00:00:00+0000',
          open: 431.3,
          high: 432.1,
          low: 428.2,
          close: 428.9,
          volume: 12345678,
          adj_close: null,
          split_factor: null,
          dividend: null,
          exchange_code: null,
          price_currency: null
        }
      ]
    })
  })

  it('routes --latest EOD to /v2/eod/latest and drops the date range', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(EOD_RESPONSE))

    await buildService().getEodBars({
      symbols: 'AAPL',
      dateFrom: '2024-09-01',
      dateTo: '2024-09-27',
      limit: 5,
      latest: true
    })

    const url = requestUrl(fetchSpy.mock.calls[0]?.[0])
    expect(url.pathname).toBe('/v2/eod/latest')
    expect(url.searchParams.get('date_from')).toBeNull()
    expect(url.searchParams.get('date_to')).toBeNull()
    expect(url.searchParams.get('limit')).toBe('5')
  })

  it('normalizes intraday bars with null IEX quote fields and maps BRK.B to BRK-B', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(INTRADAY_RESPONSE))

    const result = await buildService().getIntradayBars({
      symbols: 'brk.b',
      interval: '5min',
      dateFrom: null,
      dateTo: null,
      limit: 100,
      latest: false
    })

    const url = requestUrl(fetchSpy.mock.calls[0]?.[0])
    expect(url.pathname).toBe('/v2/intraday')
    expect(url.searchParams.get('symbols')).toBe('BRK-B')
    expect(url.searchParams.get('interval')).toBe('5min')

    expect(result).toEqual({
      source: 'marketstack',
      pagination: { limit: 100, offset: 0, count: 1, total: 1 },
      bars: [
        {
          symbol: 'BRK-B',
          date: '2024-09-27T15:00:00+0000',
          open: 460.1,
          high: 461.9,
          low: 459.8,
          close: 461.2,
          volume: 250000,
          last: null,
          marketstack_last: 461.15
        }
      ]
    })
  })

  it('surfaces intraday plan-gate errors without leaking the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(
        {
          error: {
            code: 'function_access_restricted',
            message: `intraday is not on your plan (access_key ${TEST_API_KEY})`
          }
        },
        403
      )
    )

    const error: unknown = await buildService()
      .getIntradayBars({
        symbols: 'AAPL',
        interval: '1hour',
        dateFrom: null,
        dateTo: null,
        limit: 100,
        latest: true
      })
      .catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('403')
      expect(error.message).toContain('function_access_restricted')
      expect(error.message).not.toContain(TEST_API_KEY)
      expect(error.message).toContain('***')
    }
  })

  it('searches tickers via /v2/tickerslist and reads the ticker (not symbol) field', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(TICKERS_LIST_RESPONSE))

    const result = await buildService().searchTickers({ query: 'apple', limit: 20 })

    const url = requestUrl(fetchSpy.mock.calls[0]?.[0])
    expect(url.pathname).toBe('/v2/tickerslist')
    expect(url.searchParams.get('search')).toBe('apple')
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('access_key')).toBe(TEST_API_KEY)

    expect(result).toEqual({
      source: 'marketstack',
      results: [
        {
          name: 'Apple Inc',
          ticker: 'AAPL',
          has_intraday: true,
          has_eod: true,
          exchange: { name: 'NASDAQ Stock Exchange', acronym: 'NASDAQ', mic: 'XNAS' }
        },
        {
          name: 'Apple Hospitality REIT Inc',
          ticker: 'APLE',
          has_intraday: null,
          has_eod: true,
          exchange: null
        }
      ]
    })
  })

  it('caches ticker search results so repeat lookups do not refetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(TICKERS_LIST_RESPONSE))

    const service = buildService()
    const first = await service.searchTickers({ query: 'apple', limit: 20 })
    const second = await service.searchTickers({ query: 'apple', limit: 20 })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it('fetches a bare ticker profile from /v2/tickers/{symbol}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(TICKER_PROFILE_RESPONSE))

    const result = await buildService().getTickerProfile({ symbol: 'aapl' })

    const url = requestUrl(fetchSpy.mock.calls[0]?.[0])
    expect(url.pathname).toBe('/v2/tickers/AAPL')
    expect(url.searchParams.get('access_key')).toBe(TEST_API_KEY)

    expect(result).toEqual({
      source: 'marketstack',
      name: 'Apple Inc',
      ticker: 'AAPL',
      cik: '320193',
      isin: 'US0378331005',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      exchange: { name: 'NASDAQ Stock Exchange', acronym: 'NASDAQ', mic: 'XNAS', country: 'USA' }
    })
  })

  it('redacts the key from 429 rate-limit errors', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const body = {
        error: {
          code: 'too_many_requests',
          message: `usage limit reached for access_key ${TEST_API_KEY}`
        }
      }
      return new Response(ensureJsonTreeString(body), {
        status: 429,
        statusText: 'Too Many Requests',
        // Tiny retry-after keeps the retry/backoff path fast in tests.
        headers: { 'Content-Type': 'application/json', 'Retry-After': '0.001' }
      })
    })

    const error: unknown = await buildService()
      .getEodBars({ symbols: 'AAPL', dateFrom: null, dateTo: null, limit: 100, latest: false })
      .catch((thrown: unknown) => thrown)

    // providerFetchJson retries 429s before giving up.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1)
    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('429')
      expect(error.message).toContain('too_many_requests')
      expect(error.message).not.toContain(TEST_API_KEY)
      expect(error.message).toContain('***')
    }
  })

  it('throws the env-var message without calling fetch when unconfigured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const service = new MarketstackService({ apiKey: '' })

    await expect(
      service.getEodBars({
        symbols: 'AAPL',
        dateFrom: null,
        dateTo: null,
        limit: 100,
        latest: false
      })
    ).rejects.toThrow('MARKETSTACK_API_KEY is not set; direct Marketstack stock data is disabled')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
