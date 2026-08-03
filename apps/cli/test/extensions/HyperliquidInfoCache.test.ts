import { beforeEach, describe, expect, test } from 'vitest'

import {
  clearInfoCache,
  HyperliquidRateLimitError,
  type InfoBody,
  infoRequest,
  infoRequestWithMeta,
  staleServedSinceMs
} from '../../../../.pi/extensions/tribes/hyperliquid/InfoCache.ts'

const URL = 'https://example.invalid/info'

function jsonResponse(status: number, body: string): Response {
  return new Response(body, { status })
}

type Call = { readonly body: string }

function stubFetch(responses: readonly Response[]): {
  readonly fetchImpl: (url: string, init: RequestInit) => Promise<Response>
  readonly calls: Call[]
} {
  const calls: Call[] = []
  let index = 0
  return {
    calls,
    fetchImpl: async (_url, init) => {
      calls.push({ body: String(init.body) })
      const response = responses[index]
      index += 1
      if (response === undefined) throw new Error('unexpected extra fetch')
      return response
    }
  }
}

const CLEARINGHOUSE: InfoBody = { type: 'clearinghouseState', user: '0xabc' }

describe('Hyperliquid info cache', () => {
  beforeEach(() => {
    clearInfoCache()
  })

  test('a 200 response is returned and cached for its request body', async () => {
    const { fetchImpl, calls } = stubFetch([
      jsonResponse(200, '{"withdrawable":"12"}'),
      jsonResponse(200, '{"withdrawable":"99"}')
    ])
    let now = 1_000

    const first = await infoRequest<{ withdrawable: string }>(
      CLEARINGHOUSE,
      {},
      { fetchImpl, nowMs: () => now, url: URL }
    )
    expect(first).toEqual({ withdrawable: '12' })

    // No TTL requested, so the second call really hits the network.
    now += 10
    const second = await infoRequest<{ withdrawable: string }>(
      CLEARINGHOUSE,
      {},
      { fetchImpl, nowMs: () => now, url: URL }
    )
    expect(second).toEqual({ withdrawable: '99' })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.body).toBe('{"type":"clearinghouseState","user":"0xabc"}')
  })

  test('cacheTtlMs serves the cached 200 without fetching again', async () => {
    const { fetchImpl, calls } = stubFetch([jsonResponse(200, '{"ok":true}')])
    let now = 5_000

    await infoRequest(
      CLEARINGHOUSE,
      { cacheTtlMs: 60_000 },
      { fetchImpl, nowMs: () => now, url: URL }
    )
    now += 30_000
    const cached = await infoRequest<{ ok: boolean }>(
      CLEARINGHOUSE,
      { cacheTtlMs: 60_000 },
      { fetchImpl, nowMs: () => now, url: URL }
    )

    expect(cached).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
  })

  test('a 429 with an empty body skips and serves the last cached 200 without throwing', async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, '{"withdrawable":"12"}'),
      jsonResponse(429, '')
    ])
    let now = 1_000

    await infoRequest(CLEARINGHOUSE, {}, { fetchImpl, nowMs: () => now, url: URL })
    now += 60_000
    const skipped = await infoRequestWithMeta<{ withdrawable: string }>(
      CLEARINGHOUSE,
      {},
      { fetchImpl, nowMs: () => now, url: URL }
    )

    expect(skipped.value).toEqual({ withdrawable: '12' })
    // The reader must be able to see WHEN this value was true.
    expect(skipped.fetchedAtMs).toBe(1_000)
    expect(skipped.stale).toBe(true)
    expect(staleServedSinceMs()).toBe(1_000)
  })

  test('a 429 serves the cached value however old it is', async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, '{"withdrawable":"12"}'),
      jsonResponse(429, '')
    ])
    let now = 1_000

    await infoRequest(CLEARINGHOUSE, {}, { fetchImpl, nowMs: () => now, url: URL })
    now += 6 * 60 * 60_000

    const skipped = await infoRequestWithMeta<{ withdrawable: string }>(
      CLEARINGHOUSE,
      {},
      { fetchImpl, nowMs: () => now, url: URL }
    )
    expect(skipped.value).toEqual({ withdrawable: '12' })
    expect(skipped.stale).toBe(true)
    expect(skipped.fetchedAtMs).toBe(1_000)
  })

  test('a fresh 200 is not marked stale and clears nothing it should not', async () => {
    const { fetchImpl } = stubFetch([jsonResponse(200, '{"withdrawable":"12"}')])

    const result = await infoRequestWithMeta<{ withdrawable: string }>(
      CLEARINGHOUSE,
      {},
      { fetchImpl, nowMs: () => 7_000, url: URL }
    )
    expect(result.stale).toBe(false)
    expect(result.fetchedAtMs).toBe(7_000)
    expect(staleServedSinceMs()).toBeNull()
  })

  test('the cache is keyed per request body, so a 429 never answers with another request', async () => {
    const { fetchImpl } = stubFetch([jsonResponse(200, '{"dex":"main"}'), jsonResponse(429, '')])
    let now = 1_000

    await infoRequest(
      { type: 'clearinghouseState', user: '0xabc' },
      {},
      { fetchImpl, nowMs: () => now, url: URL }
    )
    now += 10

    await expect(
      infoRequest(
        { type: 'clearinghouseState', user: '0xabc', dex: 'xyz' },
        {},
        { fetchImpl, nowMs: () => now, url: URL }
      )
    ).rejects.toBeInstanceOf(HyperliquidRateLimitError)
  })

  // Load-bearing negative: a change that swallowed every error would still pass
  // the 429 tests above. Non-429 failures must keep failing, cache or no cache.
  test('a non-429 error still throws even when a cached 200 exists', async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, '{"withdrawable":"12"}'),
      jsonResponse(500, 'boom')
    ])
    let now = 1_000

    await infoRequest(CLEARINGHOUSE, {}, { fetchImpl, nowMs: () => now, url: URL })
    now += 10

    await expect(
      infoRequest(CLEARINGHOUSE, {}, { fetchImpl, nowMs: () => now, url: URL })
    ).rejects.toThrow('Hyperliquid info 500: boom')
  })

  test('a non-ok response with an empty body still reports its status code', async () => {
    const { fetchImpl } = stubFetch([jsonResponse(503, '')])

    await expect(
      infoRequest(CLEARINGHOUSE, {}, { fetchImpl, nowMs: () => 1_000, url: URL })
    ).rejects.toThrow('Hyperliquid info 503: <empty>')
  })

  test('a failed response never overwrites the cached 200', async () => {
    const { fetchImpl } = stubFetch([
      jsonResponse(200, '{"withdrawable":"12"}'),
      jsonResponse(500, 'boom'),
      jsonResponse(429, '')
    ])
    let now = 1_000

    await infoRequest(CLEARINGHOUSE, {}, { fetchImpl, nowMs: () => now, url: URL })
    now += 10
    await expect(
      infoRequest(CLEARINGHOUSE, {}, { fetchImpl, nowMs: () => now, url: URL })
    ).rejects.toThrow(/500/u)

    now += 10
    const skipped = await infoRequest<{ withdrawable: string }>(
      CLEARINGHOUSE,
      {},
      { fetchImpl, nowMs: () => now, url: URL }
    )
    expect(skipped).toEqual({ withdrawable: '12' })
  })
})
