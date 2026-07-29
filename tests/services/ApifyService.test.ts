import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApifyService } from '@/services/ApifyService'

const API_KEY = 'apify_api_testtoken'

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

function requestBody(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const [, init] = spy.mock.calls[0] ?? []
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

const search = {
  queries: ['$BTC'],
  handles: [],
  limit: 100,
  since: null,
  until: null,
  sort: null
}

describe('ApifyService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('addresses the actor as a single tilde path segment', async () => {
    // `owner/name` would split into two segments and 404. The tilde form is the
    // wire form.
    const spy = mockJson([])

    await new ApifyService({ apiKey: API_KEY }).searchTweets(search)

    const url = requestUrl(spy)
    expect(url.origin).toBe('https://api.apify.com')
    expect(url.pathname).toBe('/v2/acts/apidojo~tweet-scraper/run-sync-get-dataset-items')
  })

  it('always sends a hard dollar ceiling, scaled to the requested limit', async () => {
    // This is the only real cap on the run. The egress meter charges a flat
    // reserve and cannot see the result count, so if this query param is ever
    // dropped the spend becomes unbounded.
    const spy = mockJson([])

    await new ApifyService({ apiKey: API_KEY }).searchTweets({ ...search, limit: 100 })

    // 100 tweets x $0.0004 x 1.5 headroom = $0.06
    expect(requestUrl(spy).searchParams.get('maxTotalChargeUsd')).toBe('0.06')
  })

  it('never sends a zero ceiling for a tiny limit', async () => {
    // A 0 would read as "spend nothing" and return empty rather than uncapped —
    // a confusing way to fail, so the ceiling floors at a cent.
    const spy = mockJson([])

    await new ApifyService({ apiKey: API_KEY }).searchTweets({ ...search, limit: 1 })

    expect(requestUrl(spy).searchParams.get('maxTotalChargeUsd')).toBe('0.01')
  })

  it('pins maxItems in the actor input as well as the dollar cap', async () => {
    // Belt and braces: maxItems bounds what the actor returns, maxTotalChargeUsd
    // bounds what it may spend if it ignores or overshoots that.
    const spy = mockJson([])

    await new ApifyService({ apiKey: API_KEY }).searchTweets({ ...search, limit: 250 })

    const body = requestBody(spy)
    expect(body.maxItems).toBe(250)
    expect(requestUrl(spy).searchParams.get('maxTotalChargeUsd')).toBe('0.15')
  })

  it('sends the token as a bearer header, never in the body', async () => {
    // The body is the slot the egress proxy cannot rewrite.
    const spy = mockJson([])

    await new ApifyService({ apiKey: API_KEY }).searchTweets(search)

    const [, init] = spy.mock.calls[0] ?? []
    expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${API_KEY}`)
    expect(requestBody(spy)).not.toHaveProperty('token')
    expect(requestUrl(spy).searchParams.has('token')).toBe(false)
  })

  it('maps queries and handles onto the actor input fields', async () => {
    const spy = mockJson([])

    await new ApifyService({ apiKey: API_KEY }).searchTweets({
      queries: ['$ETH'],
      handles: ['elonmusk'],
      limit: 50,
      since: '2026-07-01',
      until: '2026-07-28',
      sort: 'Top'
    })

    const body = requestBody(spy)
    expect(body.searchTerms).toEqual(['$ETH'])
    expect(body.twitterHandles).toEqual(['elonmusk'])
    expect(body.start).toBe('2026-07-01')
    expect(body.end).toBe('2026-07-28')
    expect(body.sort).toBe('Top')
  })

  it('omits search terms and handles entirely when not given', async () => {
    const spy = mockJson([])

    await new ApifyService({ apiKey: API_KEY }).searchTweets({
      ...search,
      queries: [],
      handles: ['vitalikbuterin']
    })

    const body = requestBody(spy)
    expect(body).not.toHaveProperty('searchTerms')
    expect(body.twitterHandles).toEqual(['vitalikbuterin'])
  })

  it('parses the dataset array the sync run returns', async () => {
    mockJson([{ id: '1', text: 'gm', likeCount: 3, author: { userName: 'someone' } }])

    const tweets = await new ApifyService({ apiKey: API_KEY }).searchTweets(search)

    expect(tweets).toHaveLength(1)
    expect(tweets[0]?.text).toBe('gm')
    expect(tweets[0]?.author?.userName).toBe('someone')
  })

  it('tells the caller not to retry a 408, because the run is still billing', async () => {
    // Apify caps the synchronous leg at 300s, but the run is a separate object
    // that keeps executing and keeps charging. Retrying turns one timed-out
    // scrape into several concurrent paid ones.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('timeout', { status: 408, statusText: 'Request Timeout' })
    )

    const error = await new ApifyService({ apiKey: API_KEY })
      .searchTweets(search)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('still billing')
      expect(error.message).toContain('do not retry')
    }
  })

  it('fails closed before fetch when the token is unset', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')

    await expect(new ApifyService({ apiKey: '' }).searchTweets(search)).rejects.toThrow(
      'APIFY_API_KEY is not set'
    )
    expect(spy).not.toHaveBeenCalled()
  })

  it('never echoes the token in a transport error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(`echoed ${API_KEY}`, { status: 502, statusText: 'Bad Gateway' })
    )

    const error = await new ApifyService({ apiKey: API_KEY })
      .searchTweets(search)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('failed: 502 Bad Gateway')
      expect(error.message).not.toContain(API_KEY)
    }
  })
})
