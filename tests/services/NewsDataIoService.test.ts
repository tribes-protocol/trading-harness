import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NewsDataIoService } from '@/services/NewsDataIoService'
import { NewsDataIoHeadlinesCommandOptionsSchema } from '@/types/NewsDataIo'
import { ensureJsonTreeString } from '@/utils/Lang'

const API_KEY = 'test-key'

type HeadlinesParams = {
  readonly query: string | null
  readonly coins: readonly string[]
  readonly categories: readonly string[]
  readonly countries: readonly string[]
  readonly languages: readonly string[]
  readonly timeframeHours: number | null
  readonly size: number
  readonly page: string | null
}

const baseParams = (overrides: Partial<HeadlinesParams> = {}): HeadlinesParams => ({
  query: 'bitcoin',
  coins: [],
  categories: [],
  countries: [],
  languages: ['en'],
  timeframeHours: null,
  size: 10,
  page: null,
  ...overrides
})

const rawArticle = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  article_id: 'a1',
  title: 'Bitcoin rallies past resistance',
  link: 'https://example.com/btc-rallies',
  description: 'BTC broke out on strong volume.',
  pubDate: '2026-07-16 08:30:00',
  pubDateTZ: 'UTC',
  source_id: 'example_news',
  source_name: 'Example News',
  language: 'english',
  country: ['us', 'gb'],
  category: ['business'],
  sentiment: 'positive',
  ...overrides
})

const successBody = (
  results: Record<string, unknown>[],
  overrides: Record<string, unknown> = {}
): string =>
  ensureJsonTreeString({
    status: 'success',
    totalResults: results.length,
    results,
    nextPage: null,
    ...overrides
  })

const jsonResponse = (body: string, status = 200): Response =>
  new Response(body, { status, headers: { 'Content-Type': 'application/json' } })

const ensureRequestUrl = (input: unknown): URL => {
  if (!(input instanceof URL)) {
    throw new Error('expected fetch to be called with a URL')
  }
  return input
}

describe('NewsDataIoService', () => {
  beforeEach(async () => {
    process.env.TRIBES_PROVIDER_CACHE_BASE = await mkdtemp(join(tmpdir(), 'cache-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.TRIBES_PROVIDER_CACHE_BASE
  })

  it('fetches /api/1/latest and normalizes the payload', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(successBody([rawArticle()], { nextPage: 'token-2' })))

    const service = new NewsDataIoService({ apiKey: API_KEY })
    const result = await service.getHeadlines(
      baseParams({ categories: ['business'], countries: ['us'], timeframeHours: 6 })
    )

    expect(result).toEqual({
      source: 'newsdataio',
      total_results: 1,
      next_page: 'token-2',
      items: [
        {
          article_id: 'a1',
          title: 'Bitcoin rallies past resistance',
          link: 'https://example.com/btc-rallies',
          description: 'BTC broke out on strong volume.',
          pub_date: '2026-07-16 08:30:00',
          pub_date_tz: 'UTC',
          source_id: 'example_news',
          source_name: 'Example News',
          language: 'english',
          countries: ['us', 'gb'],
          categories: ['business'],
          sentiment: 'positive'
        }
      ]
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = ensureRequestUrl(fetchSpy.mock.calls[0]?.[0])
    expect(url.origin).toBe('https://newsdata.io')
    expect(url.pathname).toBe('/api/1/latest')
    expect(url.searchParams.get('apikey')).toBe(API_KEY)
    expect(url.searchParams.get('removeduplicate')).toBe('1')
    expect(url.searchParams.get('q')).toBe('bitcoin')
    expect(url.searchParams.get('category')).toBe('business')
    expect(url.searchParams.get('country')).toBe('us')
    expect(url.searchParams.get('language')).toBe('en')
    expect(url.searchParams.get('timeframe')).toBe('6')
    expect(url.searchParams.get('size')).toBe('10')
    expect(url.searchParams.get('coin')).toBeNull()
    expect(url.searchParams.get('page')).toBeNull()
  })

  it('coerces plan-gated placeholder strings to null / empty arrays', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        successBody([
          rawArticle({
            description: 'ONLY AVAILABLE IN PAID PLANS',
            source_name: 'ONLY AVAILABLE IN PAID PLANS',
            country: 'ONLY AVAILABLE IN CORPORATE PLANS',
            category: 'ONLY AVAILABLE IN CORPORATE PLANS',
            sentiment: 'ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS'
          })
        ])
      )
    )

    const service = new NewsDataIoService({ apiKey: API_KEY })
    const result = await service.getHeadlines(baseParams())

    expect(result.items[0]).toMatchObject({
      description: null,
      source_name: null,
      countries: [],
      categories: [],
      sentiment: null
    })
  })

  it('nulls sentiment values outside positive/negative/neutral', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        successBody([
          rawArticle({ article_id: 'a1', sentiment: 'euphoric' }),
          rawArticle({ article_id: 'a2', sentiment: 'negative' })
        ])
      )
    )

    const service = new NewsDataIoService({ apiKey: API_KEY })
    const result = await service.getHeadlines(baseParams())

    expect(result.items.map((item) => item.sentiment)).toEqual([null, 'negative'])
  })

  it('routes to /api/1/crypto when coins are given and passes the page token', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(successBody([rawArticle()])))

    const service = new NewsDataIoService({ apiKey: API_KEY })
    await service.getHeadlines(
      baseParams({ query: null, coins: ['btc', 'eth'], page: 'next-token' })
    )

    const url = ensureRequestUrl(fetchSpy.mock.calls[0]?.[0])
    expect(url.pathname).toBe('/api/1/crypto')
    expect(url.searchParams.get('coin')).toBe('btc,eth')
    expect(url.searchParams.get('page')).toBe('next-token')
    expect(url.searchParams.get('category')).toBeNull()
    expect(url.searchParams.get('country')).toBeNull()
    expect(url.searchParams.get('q')).toBeNull()
  })

  it('rejects --category/--country combined with --coin without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const service = new NewsDataIoService({ apiKey: API_KEY })

    await expect(
      service.getHeadlines(baseParams({ coins: ['btc'], categories: ['business'] }))
    ).rejects.toThrow('crypto endpoint does not support them')
    await expect(
      service.getHeadlines(baseParams({ coins: ['btc'], countries: ['us'] }))
    ).rejects.toThrow('crypto endpoint does not support them')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects bare calls with none of query/coin/category', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const service = new NewsDataIoService({ apiKey: API_KEY })

    await expect(service.getHeadlines(baseParams({ query: null }))).rejects.toThrow(
      'provide at least one of --query, --coin, or --category'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('surfaces the provider error envelope on non-2xx without leaking the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        ensureJsonTreeString({
          status: 'error',
          results: {
            message: `The provided API key ${API_KEY} is not valid.`,
            code: 'Unauthorized'
          }
        }),
        401
      )
    )

    const service = new NewsDataIoService({ apiKey: API_KEY })
    const error: unknown = await service.getHeadlines(baseParams()).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('401')
      expect(error.message).toContain('Unauthorized')
      expect(error.message).not.toContain(API_KEY)
    }
  })

  it('throws on a 2xx error envelope without leaking the key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        ensureJsonTreeString({
          status: 'error',
          results: { message: `Bad key ${API_KEY}`, code: 'Unauthorized' }
        })
      )
    )

    const service = new NewsDataIoService({ apiKey: API_KEY })
    const error: unknown = await service.getHeadlines(baseParams()).catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('Unauthorized')
      expect(error.message).not.toContain(API_KEY)
    }
  })

  it('throws the env-var message without calling fetch when unconfigured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const service = new NewsDataIoService({ apiKey: '' })

    await expect(service.getHeadlines(baseParams())).rejects.toThrow(
      'NEWSDATAIO_API_KEY is not set; direct NewsData.io headlines are disabled'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('caches per full filter set: same params hit the cache, a new page token refetches', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(successBody([rawArticle()])))

    const service = new NewsDataIoService({ apiKey: API_KEY })
    await service.getHeadlines(baseParams())
    await service.getHeadlines(baseParams())
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    fetchSpy.mockResolvedValue(jsonResponse(successBody([rawArticle({ article_id: 'a2' })])))
    await service.getHeadlines(baseParams({ page: 'next-token' }))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const url = ensureRequestUrl(fetchSpy.mock.calls[1]?.[0])
    expect(url.searchParams.get('page')).toBe('next-token')
  })

  describe('NewsDataIoHeadlinesCommandOptionsSchema', () => {
    it('splits csv flags, defaults language/size, and validates categories', () => {
      const parsed = NewsDataIoHeadlinesCommandOptionsSchema.parse({
        category: 'business,technology',
        country: 'us,gb'
      })
      expect(parsed.category).toEqual(['business', 'technology'])
      expect(parsed.country).toEqual(['us', 'gb'])
      expect(parsed.language).toEqual(['en'])
      expect(parsed.size).toBe(10)
    })

    it('rejects unknown categories, uppercase coins, and more than 5 coins', () => {
      expect(() => NewsDataIoHeadlinesCommandOptionsSchema.parse({ category: 'memes' })).toThrow()
      expect(() => NewsDataIoHeadlinesCommandOptionsSchema.parse({ coin: 'BTC' })).toThrow()
      expect(() =>
        NewsDataIoHeadlinesCommandOptionsSchema.parse({ coin: 'btc,eth,sol,doge,ada,xrp' })
      ).toThrow()
    })

    it('rejects bare invocations and coin combined with category/country', () => {
      expect(() => NewsDataIoHeadlinesCommandOptionsSchema.parse({})).toThrow(
        /provide at least one of/
      )
      expect(() =>
        NewsDataIoHeadlinesCommandOptionsSchema.parse({ coin: 'btc', category: 'business' })
      ).toThrow(/--category cannot be combined with --coin/)
      expect(() =>
        NewsDataIoHeadlinesCommandOptionsSchema.parse({ coin: 'btc', country: 'us' })
      ).toThrow(/--country cannot be combined with --coin/)
    })

    it('rejects out-of-range timeframe and size', () => {
      expect(() =>
        NewsDataIoHeadlinesCommandOptionsSchema.parse({ query: 'btc', timeframe: '49' })
      ).toThrow()
      expect(() =>
        NewsDataIoHeadlinesCommandOptionsSchema.parse({ query: 'btc', size: '51' })
      ).toThrow()
    })
  })
})
