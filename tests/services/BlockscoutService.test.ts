import { afterEach, describe, expect, it, vi } from 'vitest'

import { BlockscoutService } from '@/services/BlockscoutService'

const API_KEY = 'proapi_testkey'
const TOKEN = '0x6982508145454Ce325dDbE47a25d4ec3d2311933'

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

describe('BlockscoutService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('puts the chain id in the first path segment', async () => {
    // Blockscout's multichain gateway routes on /{chainId}/api/v2/... — the
    // chain is part of the path, not a query param.
    const spy = mockJson({ symbol: 'PEPE' })

    await new BlockscoutService({ apiKey: API_KEY }).getToken({ chainId: 8453, address: TOKEN })

    const url = requestUrl(spy)
    expect(url.origin).toBe('https://api.blockscout.com')
    expect(url.pathname).toBe(`/8453/api/v2/tokens/${TOKEN}`)
  })

  it('sends the key BARE, with no auth scheme', async () => {
    // Every other keyed provider here frames the value. Blockscout does not, and
    // prepending `Bearer ` makes the request 401.
    const spy = mockJson({})

    await new BlockscoutService({ apiKey: API_KEY }).getToken({ chainId: 1, address: TOKEN })

    const [, init] = spy.mock.calls[0] ?? []
    expect(new Headers(init?.headers).get('Authorization')).toBe(API_KEY)
  })

  it('reads the risk fields off an address', async () => {
    mockJson({
      hash: TOKEN,
      is_contract: true,
      is_verified: true,
      is_scam: false,
      proxy_type: 'eip1967',
      creator_address_hash: '0xdeadbeef'
    })

    const address = await new BlockscoutService({ apiKey: API_KEY }).getAddress({
      chainId: 1,
      address: TOKEN
    })

    expect(address.is_contract).toBe(true)
    expect(address.is_scam).toBe(false)
    expect(address.proxy_type).toBe('eip1967')
    expect(address.creator_address_hash).toBe('0xdeadbeef')
  })

  it('distinguishes full from partial contract verification', async () => {
    // `is_verified` alone only means source was published; the finer flags are
    // what separate a real match from a partial one.
    mockJson({ is_verified: true, is_fully_verified: false, is_partially_verified: true })

    const contract = await new BlockscoutService({ apiKey: API_KEY }).getContract({
      chainId: 1,
      address: TOKEN
    })

    expect(contract.is_verified).toBe(true)
    expect(contract.is_fully_verified).toBe(false)
    expect(contract.is_partially_verified).toBe(true)
  })

  it('parses holder balances as raw strings, not numbers', async () => {
    // Supplies exceed Number.MAX_SAFE_INTEGER routinely — PEPE's is ~4.2e32 —
    // so these must stay strings or the concentration maths silently rounds.
    mockJson({
      items: [{ address: { hash: '0xabc' }, value: '360000000000000000000000000000' }],
      next_page_params: null
    })

    const holders = await new BlockscoutService({ apiKey: API_KEY }).getTokenHolders({
      chainId: 1,
      address: TOKEN,
      limit: 50
    })

    expect(holders.items?.[0]?.value).toBe('360000000000000000000000000000')
    expect(typeof holders.items?.[0]?.value).toBe('string')
  })

  it('passes the row limit through as items_count', async () => {
    const spy = mockJson({ items: [], next_page_params: null })

    await new BlockscoutService({ apiKey: API_KEY }).getAddressTransactions({
      chainId: 1,
      address: TOKEN,
      limit: 25
    })

    expect(requestUrl(spy).searchParams.get('items_count')).toBe('25')
  })

  it('explains a 402 as a lost credential, not a spent balance', async () => {
    // This host is x402-gated, so an unkeyed request is asked to PAY rather than
    // rejected as unauthorized. Read literally, 402 points at the wrong problem.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 402, statusText: 'Payment Required' })
    )

    const error = await new BlockscoutService({ apiKey: API_KEY })
      .getToken({ chainId: 1, address: TOKEN })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('without a key')
      expect(error.message).toContain('not a spent balance')
    }
  })

  it('points a 404 at the chain id, which is the usual cause', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 404, statusText: 'Not Found' })
    )

    const error = await new BlockscoutService({ apiKey: API_KEY })
      .getToken({ chainId: 99999999, address: TOKEN })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('chain id 99999999')
    }
  })

  it('fails closed before fetch when the key is unset', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')

    await expect(
      new BlockscoutService({ apiKey: '' }).getToken({ chainId: 1, address: TOKEN })
    ).rejects.toThrow('BLOCKSCOUT_API_KEY is not set')
    expect(spy).not.toHaveBeenCalled()
  })

  it('never echoes the key in a transport error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`echoed ${API_KEY}`, { status: 502, statusText: 'Bad Gateway' })
    )

    const error = await new BlockscoutService({ apiKey: API_KEY })
      .getToken({ chainId: 1, address: TOKEN })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('failed: 502 Bad Gateway')
      expect(error.message).not.toContain(API_KEY)
    }
  })
})
