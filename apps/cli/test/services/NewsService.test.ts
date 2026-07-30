import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as newsHelper from '@/helpers/News'
import { NewsService } from '@/services/NewsService'
import type { NewsItem, NewsStateResponse } from '@/types/News'

const API_BASE_URL = 'https://api.example.test'

function completedResponse(items: NewsItem[]): NewsStateResponse {
  return { state: 'completed', items, nextCursor: null }
}

describe('NewsService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns completed news when sentiment is known', async () => {
    const response = completedResponse([
      {
        id: '0x' + 'a'.repeat(64),
        headline: 'BTC rallies',
        source: 'Example',
        timestamp: 1,
        sentiment: 'bullish',
        url: 'https://example.com/btc'
      }
    ])
    const fetchSpy = vi.spyOn(newsHelper, 'fetchNewsState').mockResolvedValue(response)

    const service = new NewsService({ apiBaseUrl: API_BASE_URL })
    const result = await service.fetchNewsUntilCompleted({
      assetIdentity: { kind: 'perp', coin: 'BTC' }
    })

    expect(result).toEqual(response)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('retries while state is analyzing then completes', async () => {
    const fetchSpy = vi
      .spyOn(newsHelper, 'fetchNewsState')
      .mockResolvedValueOnce({ state: 'analyzing', items: [], nextCursor: null })
      .mockResolvedValueOnce(
        completedResponse([
          {
            id: '0x' + 'b'.repeat(64),
            headline: 'ETH steady',
            source: 'Example',
            timestamp: 2,
            sentiment: 'neutral',
            url: 'https://example.com/eth'
          }
        ])
      )

    const service = new NewsService({ apiBaseUrl: API_BASE_URL })
    const promise = service.fetchNewsUntilCompleted({
      assetIdentity: { kind: 'perp', coin: 'ETH' }
    })

    await vi.advanceTimersByTimeAsync(30_000)
    const result = await promise

    expect(result.state).toBe('completed')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('returns latest response when unknown sentiment persists after retries', async () => {
    const unknownItem = {
      id: '0x' + 'c'.repeat(64),
      headline: 'Pending',
      source: 'Example',
      timestamp: 3,
      sentiment: 'unknown' as const,
      url: 'https://example.com/pending'
    }
    const response = completedResponse([unknownItem])
    vi.spyOn(newsHelper, 'fetchNewsState').mockResolvedValue(response)

    const service = new NewsService({ apiBaseUrl: API_BASE_URL })
    const promise = service.fetchNewsUntilCompleted({
      assetIdentity: { kind: 'stock', ticker: 'NVDA' }
    })

    for (let attempt = 0; attempt < 10; attempt++) {
      await vi.advanceTimersByTimeAsync(30_000)
    }

    const result = await promise
    expect(result.items[0]?.sentiment).toBe('unknown')
  })

  it('returns latest response when sentiment is nullish after retries', async () => {
    const pendingItem = {
      id: '0x' + 'd'.repeat(64),
      headline: 'Pending',
      source: 'Example',
      timestamp: 4,
      sentiment: null,
      url: 'https://example.com/pending-null'
    }
    const response = completedResponse([pendingItem])
    vi.spyOn(newsHelper, 'fetchNewsState').mockResolvedValue(response)
    const service = new NewsService({ apiBaseUrl: API_BASE_URL })
    const promise = service.fetchNewsUntilCompleted({
      assetIdentity: { kind: 'stock', ticker: 'NVDA' }
    })
    for (let attempt = 0; attempt < 10; attempt++) {
      await vi.advanceTimersByTimeAsync(30_000)
    }
    const result = await promise
    expect(result.items[0]?.sentiment).toBeNull()
  })
})
