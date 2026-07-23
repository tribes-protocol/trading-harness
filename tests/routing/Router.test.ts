import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { type AssetSource, EmptyPayloadError, NotFoundError } from '@/routing/Capabilities'
import { resolveCapability } from '@/routing/Router'

type StubPayload = { value: number }

function okSource(value: number): AssetSource<StubPayload> {
  return { provider: 'geckoterminal', fetch: vi.fn(async () => ({ value })) }
}

function failingSource(error: unknown, authoritative = false): AssetSource<StubPayload> {
  return {
    provider: 'birdeye',
    authoritative,
    fetch: vi.fn(async () => {
      throw error
    })
  }
}

function makeZodError(): z.ZodError {
  const result = z.object({ price: z.number() }).safeParse({ price: 'oops' })
  if (result.success) {
    throw new Error('expected a zod failure')
  }
  return result.error
}

describe('resolveCapability', () => {
  it('returns the first successful payload with the envelope', async () => {
    const first: AssetSource<StubPayload> = {
      provider: 'birdeye',
      fetch: async () => ({ value: 42 })
    }
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'price', sources: [first, second] })

    expect(result).toEqual({
      value: 42,
      source: 'birdeye',
      attempted: [{ provider: 'birdeye', outcome: 'ok' }]
    })
    expect(second.fetch).not.toHaveBeenCalled()
  })

  it('falls back on key_unset and records both attempts', async () => {
    const first = failingSource(
      new Error('BIRDEYE_API_KEY is not set — the `token-data` group is unavailable on this box')
    )
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'price', sources: [first, second] })

    expect(result.value).toBe(7)
    expect(result.source).toBe('geckoterminal')
    expect(result.attempted).toHaveLength(2)
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'key_unset' })
    expect(result.attempted[1]).toEqual({ provider: 'geckoterminal', outcome: 'ok' })
  })

  it('falls back on 401 (tier gate)', async () => {
    const first = failingSource(new Error('BirdEye /defi/multi_price failed: 401 Unauthorized'))
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'price', sources: [first, second] })

    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'http_401' })
  })

  it('falls back on 429', async () => {
    const first = failingSource(new Error('BirdEye /defi/v3/ohlcv failed: 429 Too Many Requests'))
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'candles', sources: [first, second] })

    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'http_429' })
  })

  it('falls back on 5xx', async () => {
    const first = failingSource(
      new Error('BirdEye /defi/token_overview failed: 500 Internal Server Error')
    )
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'profile', sources: [first, second] })

    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'http_500' })
  })

  it('falls back on network timeout', async () => {
    const first = failingSource(new TypeError('fetch failed'))
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'price', sources: [first, second] })

    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'timeout' })
  })

  it('falls back on empty payload', async () => {
    const first = failingSource(new EmptyPayloadError('BirdEye has no price for 0xdead'))
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'price', sources: [first, second] })

    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'empty' })
  })

  it('falls back on schema-parse failure', async () => {
    const first = failingSource(makeZodError())
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'price', sources: [first, second] })

    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'parse_error' })
  })

  it('falls back on not_found from a non-authoritative source (contract space)', async () => {
    const first = failingSource(new NotFoundError('provider does not index the token'))
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'price', sources: [first, second] })

    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'not_found' })
  })

  it('surfaces not_found from an authoritative source without falling back', async () => {
    const first = failingSource(new NotFoundError("CoinGecko has no coin id 'nope'"), true)
    const second = okSource(7)

    await expect(
      resolveCapability({ capability: 'price', sources: [first, second] })
    ).rejects.toThrow(/not_found.*CoinGecko has no coin id 'nope'/)
    expect(second.fetch).not.toHaveBeenCalled()
  })

  it('treats a 404 message as not_found', async () => {
    const first = failingSource(new Error('CoinGecko /api/v3/coins/nope failed: 404 Not Found'))
    const second = okSource(7)

    const result = await resolveCapability({ capability: 'profile', sources: [first, second] })

    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'not_found' })
  })

  it('is final on non-retriable HTTP statuses like 400', async () => {
    const first = failingSource(new Error('BirdEye /defi/multi_price failed: 400 Bad Request'))
    const second = okSource(7)

    await expect(
      resolveCapability({ capability: 'price', sources: [first, second] })
    ).rejects.toThrow(/birdeye: http_400/)
    expect(second.fetch).not.toHaveBeenCalled()
  })

  it('throws with the full attempted trail when every provider fails', async () => {
    const first = failingSource(new Error('BIRDEYE_API_KEY is not set — unavailable'))
    const second: AssetSource<StubPayload> = {
      provider: 'coingecko',
      fetch: async () => {
        throw new Error('CoinGecko /api/v3/simple/price failed: 429 Too Many Requests')
      }
    }

    await expect(
      resolveCapability({ capability: 'price', sources: [first, second] })
    ).rejects.toThrow(/all providers failed.*birdeye: key_unset.*coingecko: http_429/)
  })

  it('rethrows unclassifiable errors as-is', async () => {
    const bug = new Error('unexpected internal failure')
    const first = failingSource(bug)
    const second = okSource(7)

    await expect(
      resolveCapability({ capability: 'price', sources: [first, second] })
    ).rejects.toThrow('unexpected internal failure')
    expect(second.fetch).not.toHaveBeenCalled()
  })
})
