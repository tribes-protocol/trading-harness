import { afterEach, describe, expect, it, vi } from 'vitest'

import { HeuristService } from '@/services/HeuristService'

const API_KEY = 'user123#secret'

function mockJson(body: unknown): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  )
}

function requestBody(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const [, init] = spy.mock.calls[0] ?? []
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

describe('HeuristService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls one tool directly rather than the LLM-routed query mode', async () => {
    const spy = mockJson({ data: { rates: [['BTC', 0.0001, '8h', '0.11%']], format: ['symbol'] } })

    await new HeuristService({ apiKey: API_KEY }).getAllFundingRates()

    const body = requestBody(spy)
    expect(body.agent_id).toBe('FundingRateAgent')
    // `tool` selects the direct path; a `query` key would hand routing to an LLM,
    // which is slower and nondeterministic.
    expect(body.input).toEqual({ tool: 'get_all_funding_rates', tool_arguments: {} })
    expect(body).not.toHaveProperty('query')
    // The key must never ride the body: that is the slot the egress proxy cannot
    // rewrite, so a key there would leave the sandbox as a raw placeholder.
    expect(body).not.toHaveProperty('api_key')
  })

  it('sends the key as a bearer header', async () => {
    const spy = mockJson({ data: { rates: [], format: [] } })

    await new HeuristService({ apiKey: API_KEY }).getAllFundingRates()

    const [, init] = spy.mock.calls[0] ?? []
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${API_KEY}`)
  })

  it('switches tools when open interest is requested, keeping the same symbol', async () => {
    const spy = mockJson({ data: { status: 'success', data: { symbol: 'BTCUSDT' } } })

    await new HeuristService({ apiKey: API_KEY }).getSymbolFunding({
      symbol: 'BTC',
      includeOpenInterest: true
    })

    expect(requestBody(spy).input).toEqual({
      tool: 'get_symbol_oi_and_funding',
      tool_arguments: { symbol: 'BTC' }
    })
  })

  it('reads a funding block off the success payload', async () => {
    mockJson({
      data: {
        status: 'success',
        data: {
          symbol: 'BTCUSDT',
          funding: { latest_rate: 0.0001, interval_hours: 8, apr: 0.1095 }
        }
      }
    })

    const funding = await new HeuristService({ apiKey: API_KEY }).getSymbolFunding({
      symbol: 'BTC',
      includeOpenInterest: false
    })

    expect(funding.status).toBe('success')
    expect(funding.data?.funding?.latest_rate).toBe(0.0001)
    // interval_hours is load-bearing: funding is not universally 8h, and an APR
    // recomputed against a hardcoded interval would be wrong for 4h markets.
    expect(funding.data?.funding?.interval_hours).toBe(8)
  })

  it('throws when a tool reports failure inside a 200 response', async () => {
    // The trap this API sets: a failed tool answers 200 with the failure in the
    // body, and the credit is spent anyway. Parsing it as a result would report
    // "no data" for what was really an upstream error.
    mockJson({
      data: { status: 'error', error: "Tool 'get_all_funding_rates' timed out after 30s" }
    })

    await expect(new HeuristService({ apiKey: API_KEY }).getAllFundingRates()).rejects.toThrow(
      /timed out after 30s/
    )
  })

  it('throws on a bare error field with no status', async () => {
    mockJson({ data: { error: 'upstream unavailable' } })

    await expect(new HeuristService({ apiKey: API_KEY }).getAllFundingRates()).rejects.toThrow(
      /upstream unavailable/
    )
  })

  it('treats an unlisted market as data, not as an error', async () => {
    // 'no_data' means the symbol has no market — a real answer the desk needs to
    // tell apart from a failed call, so it must not throw.
    mockJson({ data: { status: 'no_data', message: 'no market for FAKEUSDT' } })

    const funding = await new HeuristService({ apiKey: API_KEY }).getSymbolFunding({
      symbol: 'FAKE',
      includeOpenInterest: false
    })

    expect(funding.status).toBe('no_data')
  })

  it('omits absent optional arguments instead of sending nulls', async () => {
    // DefiLlama reads an empty array as "match nothing" rather than "no filter",
    // so an unset repeatable option must not reach it at all.
    const spy = mockJson({ data: { status: 'success', data: {} } })

    await new HeuristService({ apiKey: API_KEY }).searchYieldPools({
      chains: ['ethereum'],
      projects: null,
      symbols: null,
      stablecoin: null,
      limit: 20
    })

    expect(requestBody(spy).input).toEqual({
      tool: 'search_yield_pools',
      tool_arguments: { chains: ['ethereum'], limit: 20 }
    })
  })

  it('fails closed before fetch when the key is unset', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')

    await expect(new HeuristService({ apiKey: '' }).getAllFundingRates()).rejects.toThrow(
      'HEURIST_API_KEY is not set'
    )
    expect(spy).not.toHaveBeenCalled()
  })

  it('never echoes the key in a transport error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`echoed ${API_KEY}`, { status: 502, statusText: 'Bad Gateway' })
    )

    const error = await new HeuristService({ apiKey: API_KEY })
      .getAllFundingRates()
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('failed: 502 Bad Gateway')
      expect(error.message).not.toContain(API_KEY)
    }
  })
})
