import { afterEach, describe, expect, it, vi } from 'vitest'

import { StocksService } from '@/services/StocksService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_MARKETSTACK_KEY = 'test-marketstack-key'
const TEST_MASSIVE_KEY = 'test-massive-key'
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

function makeService(
  apiKey = TEST_MARKETSTACK_KEY,
  massiveApiKey = TEST_MASSIVE_KEY
): StocksService {
  return new StocksService({
    apiKey,
    massiveApiKey,
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

  it('shapes the market status and sends the Massive bearer key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        market: 'extended-hours',
        serverTime: '2026-07-23T08:12:00-04:00',
        earlyHours: true,
        afterHours: false,
        exchanges: { nasdaq: 'extended-hours', nyse: 'extended-hours', otc: 'closed' },
        currencies: { fx: 'open', crypto: 'open' }
      })
    )

    const result = await makeService().getMarketStatus()

    expect(result).toEqual({
      source: 'massive',
      market: 'extended-hours',
      server_time: '2026-07-23T08:12:00-04:00',
      after_hours: false,
      early_hours: true
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://api.massive.com')
    expect(requestUrl.pathname).toBe('/v1/marketstatus/now')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TEST_MASSIVE_KEY}`
    })
  })

  it('fetches both directions for movers, trims rows, and applies the limit', async () => {
    const gainer = (ticker: string, change: number) => ({
      ticker,
      todaysChange: change,
      todaysChangePerc: change / 2,
      updated: 1784560000000000000,
      day: { o: 1, h: 2, l: 0.5, c: 1.5, v: 1000 },
      lastTrade: { p: 1.6, s: 10 },
      prevDay: { c: 1.0 }
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input))
      const direction = url.pathname.endsWith('/gainers') ? 'GUP' : 'LDN'
      return Promise.resolve(
        jsonResponse({
          status: 'OK',
          tickers: [
            gainer(`${direction}1`, 4),
            gainer(`${direction}2`, 3),
            gainer(`${direction}3`, 2)
          ]
        })
      )
    })

    const result = await makeService().getMovers({ direction: 'both', limit: 2 })

    expect(result).toEqual({
      source: 'massive',
      direction: 'both',
      gainers: [
        { symbol: 'GUP1', price: 1.6, change: 4, change_pct: 2, volume: 1000 },
        { symbol: 'GUP2', price: 1.6, change: 3, change_pct: 1.5, volume: 1000 }
      ],
      losers: [
        { symbol: 'LDN1', price: 1.6, change: 4, change_pct: 2, volume: 1000 },
        { symbol: 'LDN2', price: 1.6, change: 3, change_pct: 1.5, volume: 1000 }
      ]
    })

    const paths = fetchSpy.mock.calls.map((call) => new URL(String(call[0])).pathname).sort()
    expect(paths).toEqual([
      '/v2/snapshot/locale/us/markets/stocks/gainers',
      '/v2/snapshot/locale/us/markets/stocks/losers'
    ])
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TEST_MASSIVE_KEY}`
    })
  })

  it('fetches a single direction for movers and falls back to the day close price', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        tickers: [
          { ticker: 'DOWN', todaysChange: -5.2, todaysChangePerc: -12.4, day: { c: 36.7, v: 900 } }
        ]
      })
    )

    const result = await makeService().getMovers({ direction: 'losers', limit: 10 })

    expect(result).toEqual({
      source: 'massive',
      direction: 'losers',
      gainers: null,
      losers: [{ symbol: 'DOWN', price: 36.7, change: -5.2, change_pct: -12.4, volume: 900 }]
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(new URL(String(fetchSpy.mock.calls[0]?.[0])).pathname).toBe(
      '/v2/snapshot/locale/us/markets/stocks/losers'
    )
  })

  it('throws the Massive unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(makeService(TEST_MARKETSTACK_KEY, '').getMarketStatus()).rejects.toThrow(
      'MASSIVE_API_KEY is not set — `stocks market-status` and `stocks movers` are unavailable on this box'
    )
    await expect(
      makeService(TEST_MARKETSTACK_KEY, '').getMovers({ direction: 'both', limit: 10 })
    ).rejects.toThrow('MASSIVE_API_KEY is not set')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on Massive errors without leaking the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"status":"NOT_AUTHORIZED"}', { status: 401, statusText: 'Unauthorized' })
    )

    const error = await makeService()
      .getMarketStatus()
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('Massive /v1/marketstatus/now failed: 401 Unauthorized')
      expect(error.message).not.toContain(TEST_MASSIVE_KEY)
    }
  })
})
