import { afterEach, describe, expect, it, vi } from 'vitest'

import { OptionsService } from '@/services/OptionsService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_MASSIVE_KEY = 'test-massive-key'
const TEST_API_BASE = 'https://api.tribes.test'
const TEST_BEARER_TOKEN = 'test-bearer-token'
const TEST_CONTRACT = 'O:AAPL250620C00200000'
// encodeURIComponent escapes the OCC "O:" prefix in request paths.
const TEST_CONTRACT_ENCODED = encodeURIComponent(TEST_CONTRACT)

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_MASSIVE_KEY): OptionsService {
  return new OptionsService({
    apiKey,
    apiBaseUrl: TEST_API_BASE,
    apiBearerToken: TEST_BEARER_TOKEN
  })
}

function proxyContract(): unknown {
  return {
    break_even_price: '207.35',
    day: {
      o: '7.1',
      h: '7.9',
      l: '6.8',
      c: '7.35',
      v: '1250',
      change_percent: '3.4',
      previous_close: '7.11'
    },
    details: {
      ticker: TEST_CONTRACT,
      contract_type: 'call',
      expiration_date: '2025-06-20',
      strike_price: '200',
      exercise_style: 'american',
      shares_per_contract: 100
    },
    greeks: { delta: '0.58', gamma: '0.021', theta: '-0.11', vega: '0.19' },
    implied_volatility: '0.31',
    last_quote: { bid: '7.3', ask: '7.4', midpoint: '7.35', bid_size: 12, ask_size: 9 },
    open_interest: 4521,
    underlying_asset: { ticker: 'AAPL', price: '204.2' }
  }
}

describe('OptionsService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the chain through the proxy with bearer auth and shapes contracts', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse([proxyContract()]))

    const result = await makeService().getChain({
      symbol: 'AAPL',
      expiry: '2025-06-20',
      strikeGte: 180,
      strikeLte: 220,
      limit: 50
    })

    expect(result).toEqual({
      source: 'massive',
      symbol: 'AAPL',
      underlying_price: 204.2,
      contracts: [
        {
          contract: TEST_CONTRACT,
          type: 'call',
          strike: 200,
          expiry: '2025-06-20',
          bid: 7.3,
          ask: 7.4,
          mid: 7.35,
          iv: 0.31,
          delta: 0.58,
          gamma: 0.021,
          theta: -0.11,
          vega: 0.19,
          open_interest: 4521,
          day_volume: 1250,
          break_even: 207.35
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe(TEST_API_BASE)
    expect(requestUrl.pathname).toBe('/stocks/options/AAPL')
    expect(requestUrl.searchParams.get('expiration_date')).toBe('2025-06-20')
    expect(requestUrl.searchParams.get('strike_gte')).toBe('180')
    expect(requestUrl.searchParams.get('strike_lte')).toBe('220')
    expect(requestUrl.searchParams.get('limit')).toBe('50')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TEST_BEARER_TOKEN}`
    })
  })

  it('derives the underlying from the OCC ticker for the proxy contract route', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(proxyContract()))

    const result = await makeService().getContract({ contract: TEST_CONTRACT })

    expect(result).toMatchObject({
      source: 'massive',
      contract: TEST_CONTRACT,
      underlying: 'AAPL',
      underlying_price: 204.2,
      type: 'call',
      strike: 200,
      expiry: '2025-06-20',
      day_close: 7.35,
      day_change_pct: 3.4,
      prev_close: 7.11,
      break_even: 207.35
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(`/stocks/options/AAPL/contract/${TEST_CONTRACT_ENCODED}`)
  })

  it('serves proxy chain and contract even when the Massive key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]))

    const result = await makeService('').getChain({
      symbol: 'AAPL',
      expiry: null,
      strikeGte: null,
      strikeLte: null,
      limit: null
    })

    expect(result.contracts).toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects a contract ticker that does not match the OCC format without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(makeService().getContract({ contract: 'AAPL' })).rejects.toThrow(
      'Cannot derive the underlying ticker'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('lists reference contracts from Massive with filters and the bearer key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [
          {
            ticker: TEST_CONTRACT,
            underlying_ticker: 'AAPL',
            contract_type: 'call',
            strike_price: 200,
            expiration_date: '2025-06-20',
            exercise_style: 'american',
            shares_per_contract: 100
          }
        ]
      })
    )

    const result = await makeService().getContracts({
      symbol: 'AAPL',
      expiry: '2025-06-20',
      type: 'call',
      limit: 100
    })

    expect(result.contracts).toEqual([
      {
        contract: TEST_CONTRACT,
        type: 'call',
        strike: 200,
        expiry: '2025-06-20',
        exercise_style: 'american',
        shares_per_contract: 100
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://api.massive.com')
    expect(requestUrl.pathname).toBe('/v3/reference/options/contracts')
    expect(requestUrl.searchParams.get('underlying_ticker')).toBe('AAPL')
    expect(requestUrl.searchParams.get('contract_type')).toBe('call')
    expect(requestUrl.searchParams.get('expiration_date')).toBe('2025-06-20')
    expect(requestUrl.searchParams.get('limit')).toBe('100')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${TEST_MASSIVE_KEY}`
    })
  })

  it('converts trade sip timestamps from nanoseconds to epoch ms', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [{ price: 7.35, size: 4, sip_timestamp: 1784560000000000000, exchange: 316 }]
      })
    )

    const result = await makeService().getTrades({ contract: TEST_CONTRACT, limit: 50 })

    expect(result.trades).toEqual([{ t: 1784560000000, price: 7.35, size: 4, exchange: 316 }])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(`/v3/trades/${TEST_CONTRACT_ENCODED}`)
    expect(requestUrl.searchParams.get('order')).toBe('desc')
    expect(requestUrl.searchParams.get('sort')).toBe('timestamp')
    expect(requestUrl.searchParams.get('limit')).toBe('50')
  })

  it('shapes quotes with bid/ask sides', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: [
          {
            bid_price: 7.3,
            ask_price: 7.4,
            bid_size: 12,
            ask_size: 9,
            sip_timestamp: 1784560000000000000
          }
        ]
      })
    )

    const result = await makeService().getQuotes({ contract: TEST_CONTRACT, limit: 50 })

    expect(result.quotes).toEqual([
      { t: 1784560000000, bid: 7.3, bid_size: 12, ask: 7.4, ask_size: 9 }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(`/v3/quotes/${TEST_CONTRACT_ENCODED}`)
  })

  it('shapes the last trade from the v2 payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        results: { p: 7.35, s: 4, t: 1784560000000000000, x: 316 }
      })
    )

    const result = await makeService().getLastTrade({ contract: TEST_CONTRACT })

    expect(result).toEqual({
      source: 'massive',
      contract: TEST_CONTRACT,
      price: 7.35,
      size: 4,
      t: 1784560000000,
      exchange: 316
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(`/v2/last/trade/${TEST_CONTRACT_ENCODED}`)
  })

  it('emits the shared candle contract from daily agg bars', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        ticker: TEST_CONTRACT,
        results: [
          { t: 1784505600000, o: 7.0, h: 7.6, l: 6.9, c: 7.5, v: 980 },
          { t: 1784592000000, o: 7.5, h: 7.9, l: 7.2, c: 7.35, v: 1250 }
        ]
      })
    )

    const result = await makeService().getCandles({
      contract: TEST_CONTRACT,
      from: '2026-06-01',
      to: '2026-07-21',
      limit: 100
    })

    expect(result).toEqual({
      source: 'massive',
      contract: TEST_CONTRACT,
      candles: [
        { t: 1784505600000, o: 7.0, h: 7.6, l: 6.9, c: 7.5, v: 980 },
        { t: 1784592000000, o: 7.5, h: 7.9, l: 7.2, c: 7.35, v: 1250 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(
      `/v2/aggs/ticker/${TEST_CONTRACT_ENCODED}/range/1/day/2026-06-01/2026-07-21`
    )
    expect(requestUrl.searchParams.get('adjusted')).toBe('true')
    expect(requestUrl.searchParams.get('sort')).toBe('asc')
    expect(requestUrl.searchParams.get('limit')).toBe('100')
  })

  it('defaults the candle range to a 180-day window ending today', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ status: 'OK', results: [] }))

    await makeService().getCandles({ contract: TEST_CONTRACT, from: null, to: null, limit: 100 })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    const match = requestUrl.pathname.match(
      /\/range\/1\/day\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/
    )
    expect(match).not.toBeNull()
    if (match !== null) {
      const [, from, to] = match
      expect(Date.parse(String(to)) - Date.parse(String(from))).toBe(180 * 86_400_000)
    }
  })

  it('shapes the previous-day bar', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'OK',
        ticker: TEST_CONTRACT,
        results: [{ t: 1784505600000, o: 7.0, h: 7.6, l: 6.9, c: 7.5, v: 980 }]
      })
    )

    const result = await makeService().getPrevDay({ contract: TEST_CONTRACT })

    expect(result).toEqual({
      source: 'massive',
      contract: TEST_CONTRACT,
      t: 1784505600000,
      o: 7.0,
      h: 7.6,
      l: 6.9,
      c: 7.5,
      v: 980
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(`/v2/aggs/ticker/${TEST_CONTRACT_ENCODED}/prev`)
    expect(requestUrl.searchParams.get('adjusted')).toBe('true')
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(makeService('').getTrades({ contract: TEST_CONTRACT, limit: 50 })).rejects.toThrow(
      'MASSIVE_API_KEY is not set — the `options` command group is unavailable on this box'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on Massive errors without leaking the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"unauthorized"}', { status: 401, statusText: 'Unauthorized' })
    )

    const error = await makeService()
      .getQuotes({ contract: TEST_CONTRACT, limit: 50 })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain(
        `Massive /v3/quotes/${TEST_CONTRACT_ENCODED} failed: 401 Unauthorized`
      )
      expect(error.message).not.toContain(TEST_MASSIVE_KEY)
    }
  })

  it('throws on proxy errors without leaking the bearer token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"Option contract not found"}', {
        status: 404,
        statusText: 'Not Found'
      })
    )

    const error = await makeService()
      .getContract({ contract: TEST_CONTRACT })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain(
        `Options proxy /stocks/options/AAPL/contract/${TEST_CONTRACT_ENCODED} failed: 404 Not Found`
      )
      expect(error.message).not.toContain(TEST_BEARER_TOKEN)
    }
  })
})
