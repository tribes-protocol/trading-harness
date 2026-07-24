import { afterEach, describe, expect, it, vi } from 'vitest'

import { StocksService } from '@/services/StocksService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_MARKETSTACK_KEY = 'test-marketstack-key'

const T_JUL_20 = Date.parse('2026-07-20T00:00:00+0000')
const T_JUL_21 = Date.parse('2026-07-21T00:00:00+0000')

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_MARKETSTACK_KEY): StocksService {
  return new StocksService({ apiKey })
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

  it('shapes the real-time stock price and coerces the numeric-string price', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            exchange_code: 'NASDAQ',
            exchange_name: 'Nasdaq Stock Market',
            country: 'United States',
            ticker: 'AAPL',
            price: '244.07',
            currency: 'USD',
            trade_last: '2026-07-22 15:03:45'
          }
        ]
      })
    )

    const result = await makeService().getStockPrice({ symbol: 'AAPL' })

    expect(result).toEqual({
      source: 'marketstack',
      symbol: 'AAPL',
      price: 244.07,
      currency: 'USD',
      trade_last: '2026-07-22 15:03:45'
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/v2/stockprice')
    expect(requestUrl.searchParams.get('ticker')).toBe('AAPL')
    expect(requestUrl.searchParams.get('access_key')).toBe(TEST_MARKETSTACK_KEY)
  })

  it('throws the 1-call-per-minute message on stockprice 429 without echoing the access key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":{"code":"rate_limit_reached"}}', {
        status: 429,
        statusText: 'Too Many Requests'
      })
    )

    const error = await makeService()
      .getStockPrice({ symbol: 'AAPL' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain(
        'Marketstack /v2/stockprice failed: 429 Too Many Requests — the endpoint is rate-limited to 1 call per minute'
      )
      expect(error.message).not.toContain(TEST_MARKETSTACK_KEY)
      expect(error.message).not.toContain('access_key=')
    }
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

  it('maps tickerslist search rows and passes search/limit params', async () => {
    // Fixture mirrors the real GET /v2/tickerslist?search=nvidia payload: rows
    // carry `ticker` (not `symbol`) and a stock_exchange with no `country`.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        pagination: { limit: 20, offset: 0, count: 2, total: 16 },
        data: [
          {
            name: 'NVIDIA Corp',
            ticker: 'NVDA',
            has_intraday: false,
            has_eod: true,
            stock_exchange: { name: 'NASDAQ - ALL MARKETS', acronym: 'NASDAQ', mic: 'XNAS' }
          },
          {
            name: 'NVIDIA CORP',
            ticker: 'NVDA.XBUE',
            has_intraday: false,
            has_eod: true,
            stock_exchange: {
              name: 'BOLSA DE COMERCIO DE BUENOS AIRES',
              acronym: 'BCBA',
              mic: 'XBUE'
            }
          }
        ]
      })
    )

    const result = await makeService().search({ query: 'nvidia', limit: 20 })

    expect(result).toEqual({
      source: 'marketstack',
      query: 'nvidia',
      results: [
        { symbol: 'NVDA', name: 'NVIDIA Corp', exchange: 'NASDAQ', mic: 'XNAS' },
        { symbol: 'NVDA.XBUE', name: 'NVIDIA CORP', exchange: 'BCBA', mic: 'XBUE' }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/v2/tickerslist')
    expect(requestUrl.searchParams.get('search')).toBe('nvidia')
    expect(requestUrl.searchParams.get('limit')).toBe('20')
    expect(requestUrl.searchParams.get('access_key')).toBe(TEST_MARKETSTACK_KEY)
  })

  it('throws on a tickerslist error without echoing the URL or access key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":{"code":"not_found_error","message":"Route not found"}}', {
        status: 404,
        statusText: 'Not Found'
      })
    )

    const error = await makeService()
      .search({ query: 'nvidia', limit: 20 })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('Marketstack /v2/tickerslist failed: 404 Not Found')
      expect(error.message).not.toContain(TEST_MARKETSTACK_KEY)
      expect(error.message).not.toContain('access_key=')
      expect(error.message).not.toContain('https://')
    }
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
})
