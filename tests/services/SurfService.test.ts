import { afterEach, describe, expect, it, vi } from 'vitest'

import { SurfService } from '@/services/SurfService'

const API_KEY = 'sk-surfai-test'

function mockJson(body: unknown): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  )
}

function requestUrl(spy: ReturnType<typeof vi.spyOn>): URL {
  const [input] = spy.mock.calls[0] ?? []
  return new URL(String(input))
}

describe('SurfService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the mandatory /gateway prefix on the request path', async () => {
    // Without /gateway the host 404s. It is not a base-URL nicety.
    const spy = mockJson({ data: [], meta: { credits_used: 1 } })

    await new SurfService({ apiKey: API_KEY }).getFundingHistory({
      pair: 'BTC/USDT',
      exchange: null,
      from: null,
      limit: null
    })

    const url = requestUrl(spy)
    expect(url.origin).toBe('https://api.asksurf.ai')
    expect(url.pathname).toBe('/gateway/v1/exchange/funding-history')
  })

  it('sends the key as a capital-B bearer header', async () => {
    // A lowercase scheme, or the bare key, is rejected upstream as a malformed
    // header rather than as a bad key.
    const spy = mockJson({ data: [] })

    await new SurfService({ apiKey: API_KEY }).getFundingHistory({
      pair: 'BTC/USDT',
      exchange: null,
      from: null,
      limit: null
    })

    const [, init] = spy.mock.calls[0] ?? []
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${API_KEY}`)
  })

  it('omits unset query params instead of sending empty values', async () => {
    const spy = mockJson({ data: [] })

    await new SurfService({ apiKey: API_KEY }).getFundingHistory({
      pair: 'BTC/USDC:USDC',
      exchange: 'hyperliquid',
      from: null,
      limit: null
    })

    const url = requestUrl(spy)
    expect(url.searchParams.get('pair')).toBe('BTC/USDC:USDC')
    expect(url.searchParams.get('exchange')).toBe('hyperliquid')
    expect(url.searchParams.has('from')).toBe(false)
    expect(url.searchParams.has('limit')).toBe(false)
  })

  it('maps camelCase params onto the snake_case names the API expects', async () => {
    const spy = mockJson({ data: [] })

    await new SurfService({ apiKey: API_KEY }).getLiquidationOrders({
      symbol: 'BTC',
      exchange: 'Binance',
      minAmount: 50000,
      side: 'long',
      sortBy: 'usd_value',
      order: 'desc',
      limit: 10
    })

    const url = requestUrl(spy)
    expect(url.searchParams.get('min_amount')).toBe('50000')
    expect(url.searchParams.get('sort_by')).toBe('usd_value')
    expect(url.searchParams.has('minAmount')).toBe(false)
    expect(url.searchParams.has('sortBy')).toBe(false)
  })

  it('surfaces the credit cost the response reports', async () => {
    // meta is the ONLY place consumption appears — there is no credit header —
    // and `cached` marks a re-call inside the 3-minute free window that the
    // egress meter cannot see and bills anyway.
    mockJson({ data: [], meta: { credits_used: 2, cached: true } })

    const result = await new SurfService({ apiKey: API_KEY }).getLiquidationChart({
      symbol: 'BTC',
      interval: null,
      exchange: null,
      limit: null,
      from: null,
      to: null
    })

    expect(result.meta?.credits_used).toBe(2)
    expect(result.meta?.cached).toBe(true)
  })

  it('reads a 402 as an empty balance when the code says so', async () => {
    // Both 402 states look identical from the status line. Confirmed live: a
    // VALID key on a drained account returns PAID_BALANCE_ZERO, and calling that
    // a missing credential sends the reader hunting a proxy bug that isn't there.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":{"code":"PAID_BALANCE_ZERO","message":"insufficient credit"}}', {
        status: 402,
        statusText: 'Payment Required'
      })
    )

    const error = await new SurfService({ apiKey: API_KEY })
      .getOptions({ symbol: 'BTC', sortBy: null, order: null })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('out of credit')
      expect(error.message).toContain('NOT a misconfiguration')
      expect(error.message).not.toContain('WITHOUT a key')
    }
  })

  it('reads a 402 as a lost credential when the code says THAT', async () => {
    // The other 402: no key reached SurfAI, so it fell through to the anonymous
    // per-IP tier and drained it. This one IS the injection failure.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":{"code":"FREE_QUOTA_EXHAUSTED"}}', {
        status: 402,
        statusText: 'Payment Required'
      })
    )

    const error = await new SurfService({ apiKey: API_KEY })
      .getOptions({ symbol: 'BTC', sortBy: null, order: null })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('WITHOUT a key')
      expect(error.message).toContain('not injected')
    }
  })

  it('stays honest about an unrecognised 402 instead of guessing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not json at all', { status: 402, statusText: 'Payment Required' })
    )

    const error = await new SurfService({ apiKey: API_KEY })
      .getOptions({ symbol: 'BTC', sortBy: null, order: null })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain(
        'either the account is out of credit or the key did not arrive'
      )
    }
  })

  it('fails closed before fetch when the key is unset', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')

    await expect(
      new SurfService({ apiKey: '' }).getEtfFlows({
        symbol: 'BTC',
        sortBy: null,
        order: null,
        from: null,
        to: null
      })
    ).rejects.toThrow('SURFAI_API_KEY is not set')
    expect(spy).not.toHaveBeenCalled()
  })

  it('never echoes the key in a transport error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`echoed ${API_KEY}`, { status: 502, statusText: 'Bad Gateway' })
    )

    const error = await new SurfService({ apiKey: API_KEY })
      .getLongShortRatio({
        pair: 'BTC/USDT',
        interval: null,
        exchange: null,
        from: null,
        limit: null
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('failed: 502 Bad Gateway')
      expect(error.message).not.toContain(API_KEY)
    }
  })
})
