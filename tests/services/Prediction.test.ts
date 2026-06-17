import { beforeEach, describe, expect, test, vi } from 'vitest'

import { PredictionService } from '@/services/PredictionService'

function toUrl(requestInfo: URL | RequestInfo): URL {
  if (requestInfo instanceof URL) {
    return requestInfo
  }

  if (typeof requestInfo === 'string') {
    return new URL(requestInfo)
  }

  return new URL(requestInfo.url)
}

describe('PredictionService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  test('listEvents shapes repeated and scalar query parameters', async () => {
    let requestedUrl: URL | undefined
    const fetchSpy = vi.fn(async (requestInfo: URL | RequestInfo): Promise<Response> => {
      requestedUrl = toUrl(requestInfo)
      return new Response('[]', {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const service = new PredictionService()
    await service.listEvents({
      id: [123, 456],
      tagId: 99,
      slug: 'crypto-election',
      tagSlug: 'politics',
      active: true,
      archived: false,
      closed: false,
      limit: 25,
      offset: 10,
      order: 'volume',
      ascending: false
    })

    expect(requestedUrl?.pathname).toBe('/events')
    expect(requestedUrl?.searchParams.getAll('id')).toEqual(['123', '456'])
    expect(requestedUrl?.searchParams.get('tag_id')).toBe('99')
    expect(requestedUrl?.searchParams.get('slug')).toBe('crypto-election')
    expect(requestedUrl?.searchParams.get('tag_slug')).toBe('politics')
    expect(requestedUrl?.searchParams.get('active')).toBe('true')
    expect(requestedUrl?.searchParams.get('archived')).toBe('false')
    expect(requestedUrl?.searchParams.get('closed')).toBe('false')
    expect(requestedUrl?.searchParams.get('limit')).toBe('25')
    expect(requestedUrl?.searchParams.get('offset')).toBe('10')
    expect(requestedUrl?.searchParams.get('order')).toBe('volume')
    expect(requestedUrl?.searchParams.get('ascending')).toBe('false')
  })

  test('search maps options into polymarket search query keys', async () => {
    let requestedUrl: URL | undefined
    const fetchSpy = vi.fn(async (requestInfo: URL | RequestInfo): Promise<Response> => {
      requestedUrl = toUrl(requestInfo)
      return new Response('{"events":[]}', {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    })
    vi.stubGlobal('fetch', fetchSpy)

    const service = new PredictionService()
    const events = await service.search({
      q: 'fed rate cut',
      limitPerType: 5,
      eventsTag: ['macro', 'rates']
    })

    expect(events).toEqual([])
    expect(requestedUrl?.pathname).toBe('/public-search')
    expect(requestedUrl?.searchParams.get('q')).toBe('fed rate cut')
    expect(requestedUrl?.searchParams.get('limit_per_type')).toBe('5')
    expect(requestedUrl?.searchParams.getAll('events_tag')).toEqual(['macro', 'rates'])
    expect(requestedUrl?.searchParams.get('events_status')).toBe('active')
    expect(requestedUrl?.searchParams.get('keep_closed_markets')).toBe('0')
    expect(requestedUrl?.searchParams.get('cache')).toBe('false')
  })
})
