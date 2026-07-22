import { afterEach, describe, expect, it, vi } from 'vitest'

import { StocksService } from '@/services/StocksService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_MARKETSTACK_KEY = 'test-marketstack-key'
const TEST_API_BASE = 'https://api.tribes.test'
const TEST_BEARER_TOKEN = 'test-bearer-token'

const T_JUL_20 = Date.parse('2026-07-20T00:00:00+0000')
const T_JUL_21 = Date.parse('2026-07-21T00:00:00+0000')

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_MARKETSTACK_KEY): StocksService {
  return new StocksService({
    apiKey,
    apiBaseUrl: TEST_API_BASE,
    apiBearerToken: TEST_BEARER_TOKEN
  })
}

describe('StocksService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shapes eod rows into ascending epoch-ms candles and sends the access key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        pagination: { limit: 100, offset: 0, count: 2, total: 2 },
        data: [
          {
            date: '2026-07-21T00:00:00+0000',
            symbol: 'AAPL',
            open: 231.1,
            high: 234.5,
            low: 229.8,
            close: 233.2,
            volume: 51000000
          },
          {
            date: '2026-07-20T00:00:00+0000',
            symbol: 'AAPL',
            open: 228.4,
            high: 232.0,
            low: 227.9,
            close: 231.0,
            volume: 48000000
          }
        ]
      })
    )

    const result = await makeService().getCandles({
      symbol: 'AAPL',
      from: '2026-07-20',
      to: '2026-07-21',
      limit: 100
    })

    expect(result).toEqual({
      source: 'marketstack',
      symbol: 'AAPL',
      candles: [
        { t: T_JUL_20, o: 228.4, h: 232.0, l: 227.9, c: 231.0, v: 48000000 },
        { t: T_JUL_21, o: 231.1, h: 234.5, l: 229.8, c: 233.2, v: 51000000 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://api.marketstack.com')
    expect(requestUrl.pathname).toBe('/v2/eod')
    expect(requestUrl.searchParams.get('access_key')).toBe(TEST_MARKETSTACK_KEY)
    expect(requestUrl.searchParams.get('symbols')).toBe('AAPL')
    expect(requestUrl.searchParams.get('date_from')).toBe('2026-07-20')
    expect(requestUrl.searchParams.get('date_to')).toBe('2026-07-21')
    expect(requestUrl.searchParams.get('limit')).toBe('100')
  })

  it('shapes the ticker detail with the exchange fields flattened', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        symbol: 'AAPL',
        name: 'Apple Inc',
        sector: 'Technology',
        industry: 'Consumer Electronics',
        stock_exchange: {
          name: 'NASDAQ Stock Exchange',
          acronym: 'NASDAQ',
          mic: 'XNAS',
          country: 'USA'
        }
      })
    )

    const result = await makeService().getDetail({ symbol: 'AAPL' })

    expect(result).toEqual({
      source: 'marketstack',
      symbol: 'AAPL',
      name: 'Apple Inc',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      exchange: 'NASDAQ',
      mic: 'XNAS',
      country: 'USA'
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/v2/tickers/AAPL')
    expect(requestUrl.searchParams.get('access_key')).toBe(TEST_MARKETSTACK_KEY)
  })

  it('maps ticker search rows and passes search/limit params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        pagination: { limit: 20, offset: 0, count: 1, total: 1 },
        data: [
          {
            symbol: 'MSFT',
            name: 'Microsoft Corporation',
            stock_exchange: { name: 'NASDAQ Stock Exchange', acronym: 'NASDAQ', country: 'USA' }
          }
        ]
      })
    )

    const result = await makeService().search({ query: 'microsoft', limit: 20 })

    expect(result).toEqual({
      source: 'marketstack',
      query: 'microsoft',
      results: [
        {
          symbol: 'MSFT',
          name: 'Microsoft Corporation',
          exchange: 'NASDAQ',
          country: 'USA'
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/v2/tickers')
    expect(requestUrl.searchParams.get('search')).toBe('microsoft')
    expect(requestUrl.searchParams.get('limit')).toBe('20')
  })

  it('shapes the proxy snapshot quote, parsing string-encoded numbers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        ticker: 'AAPL',
        name: 'Apple Inc.',
        price: '233.2',
        change: '2.2',
        changePercent: '0.95',
        volume: '51000000',
        dayOpen: '231.1',
        dayHigh: '234.5',
        dayLow: '229.8',
        prevClose: '231.0',
        marketCap: '3540000000000',
        primaryExchange: 'XNAS',
        updated: 1784560000000000000
      })
    )

    const result = await makeService().getQuote({ symbol: 'AAPL' })

    expect(result).toEqual({
      source: 'massive',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      price: 233.2,
      change: 2.2,
      change_pct: 0.95,
      volume: 51000000,
      day_open: 231.1,
      day_high: 234.5,
      day_low: 229.8,
      prev_close: 231.0,
      market_cap: 3540000000000,
      exchange: 'XNAS',
      updated_at: 1784560000000000000
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe(TEST_API_BASE)
    expect(requestUrl.pathname).toBe('/stocks/snapshot/AAPL')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TEST_BEARER_TOKEN}`
    })
  })

  it('serves proxy quotes even when the Marketstack key is unset', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ticker: 'AAPL', price: 233.2 }))

    const result = await makeService('').getQuote({ symbol: 'AAPL' })

    expect(result.symbol).toBe('AAPL')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(
      makeService('').getCandles({ symbol: 'AAPL', from: null, to: null, limit: 100 })
    ).rejects.toThrow(
      'MARKETSTACK_API_KEY is not set — the `stocks` command group is unavailable on this box'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on Marketstack errors without echoing the URL or access key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":{"code":"invalid_access_key"}}', {
        status: 401,
        statusText: 'Unauthorized'
      })
    )

    const error = await makeService()
      .getCandles({ symbol: 'AAPL', from: null, to: null, limit: 100 })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('Marketstack /v2/eod failed: 401 Unauthorized')
      expect(error.message).not.toContain(TEST_MARKETSTACK_KEY)
      expect(error.message).not.toContain('access_key=')
    }
  })

  it('throws on proxy errors without leaking the bearer token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"Ticker not found"}', { status: 404, statusText: 'Not Found' })
    )

    const error = await makeService()
      .getQuote({ symbol: 'NOPE' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('Stocks proxy /stocks/snapshot/NOPE failed: 404 Not Found')
      expect(error.message).not.toContain(TEST_BEARER_TOKEN)
    }
  })
})
