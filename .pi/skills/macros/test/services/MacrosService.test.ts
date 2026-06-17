import { ensureJsonTreeString } from '@shared/utils/lang'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MacrosService } from '@/services/MacrosService'
import type { MacrosMarketSnapshot } from '@/types/Macros'

const API_BASE_URL = 'https://api.example.test'
const API_BEARER_TOKEN = 'test-bearer-token'

const SNAPSHOT: MacrosMarketSnapshot = {
  generated_at: '2026-05-14T15:00:00Z',
  source: 'fred',
  dxy: { value: 105.2, change_pct: 0.4, as_of: '2026-05-14' },
  yields: { us10y: 4.21, us2y: 4.88, curve_2s10s: -0.67, as_of: '2026-05-14' },
  vix: { value: 18.9, change_pct: -2.1, as_of: '2026-05-14' },
  fed_funds: { value: 5.33, as_of: '2026-05-14' },
  cpi: { value: 315.2, yoy_pct: 3.2, as_of: '2026-04-01' },
  unemployment: { value: 4.0, as_of: '2026-04-01' },
  gold: { value: 2330.1, change_pct: 0.8, as_of: '2026-05-14' },
  brent: { value: 82.4, change_pct: -0.5, as_of: '2026-05-14' },
  errors: []
}

describe('MacrosService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and parses market snapshot with bearer token auth', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(ensureJsonTreeString(SNAPSHOT), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    )

    const service = new MacrosService({
      apiBaseUrl: API_BASE_URL,
      apiBearerToken: API_BEARER_TOKEN
    })
    const result = await service.getMarketSnapshot()

    expect(result).toEqual(SNAPSHOT)
    expect(fetchSpy).toHaveBeenCalledWith(new URL('/agent/macros/market', API_BASE_URL), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${API_BEARER_TOKEN}`
      }
    })
  })

  it('throws when response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('internal error', {
        status: 500,
        statusText: 'Internal Server Error'
      })
    )

    const service = new MacrosService({
      apiBaseUrl: API_BASE_URL,
      apiBearerToken: API_BEARER_TOKEN
    })

    await expect(service.getMarketSnapshot()).rejects.toThrow(
      'Failed to fetch macros market snapshot: 500 Internal Server Error'
    )
  })
})
