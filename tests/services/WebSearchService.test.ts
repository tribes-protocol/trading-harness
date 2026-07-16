import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebSearchService } from '@/services/WebSearchService'
import { ensureJsonTreeString } from '@/utils/Lang'

const API_BASE_URL = 'https://api.example.test'
const TAVILY_KEY = 'tvly-test-key'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('WebSearchService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the proxy when it succeeds', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        query: 'q',
        results: [{ title: 't', url: 'https://a.test', content: 'snippet' }]
      })
    )

    const service = new WebSearchService({
      apiBaseUrl: API_BASE_URL,
      apiBearerToken: 'bearer',
      tavilyApiKey: TAVILY_KEY
    })
    const result = await service.search('q')

    expect(result.results).toHaveLength(1)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(API_BASE_URL)
  })

  it('falls back to direct Tavily when the proxy fails', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('proxy down', { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse({
          query: 'q',
          results: [
            { title: 'direct', url: 'https://b.test', content: 'text', published_date: null }
          ]
        })
      )

    const service = new WebSearchService({
      apiBaseUrl: API_BASE_URL,
      apiBearerToken: 'bearer',
      tavilyApiKey: TAVILY_KEY
    })
    const result = await service.search('q')

    expect(result.results[0]?.title).toBe('direct')
    const tavilyCall = fetchSpy.mock.calls[1]
    expect(String(tavilyCall?.[0])).toBe('https://api.tavily.com/search')
    const headers = tavilyCall?.[1]?.headers
    expect(ensureJsonTreeString(headers)).toContain(`Bearer ${TAVILY_KEY}`)
  })

  it('rethrows the proxy error when Tavily is not configured', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('proxy down', { status: 503 }))

    const service = new WebSearchService({
      apiBaseUrl: API_BASE_URL,
      apiBearerToken: 'bearer',
      tavilyApiKey: ''
    })

    await expect(service.search('q')).rejects.toThrow('Web request failed: 503')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('maps direct Tavily extract results into the proxy shape', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('proxy down', { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ url: 'https://page.test', raw_content: 'full text' }],
          failed_results: []
        })
      )

    const service = new WebSearchService({
      apiBaseUrl: API_BASE_URL,
      apiBearerToken: 'bearer',
      tavilyApiKey: TAVILY_KEY
    })
    const result = await service.extract('https://page.test')

    expect(result).toEqual({
      url: 'https://page.test',
      results: [{ url: 'https://page.test', title: null, rawContent: 'full text' }]
    })
  })
})
