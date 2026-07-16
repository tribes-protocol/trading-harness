import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CoinGeckoService } from '@/services/CoinGeckoService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_API_KEY = 'test-key'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_API_KEY): CoinGeckoService {
  return new CoinGeckoService({ apiKey })
}

describe('CoinGeckoService', () => {
  beforeEach(async () => {
    process.env.TRIBES_PROVIDER_CACHE_BASE = await mkdtemp(join(tmpdir(), 'cache-'))
  })

  afterEach(() => {
    delete process.env.TRIBES_PROVIDER_CACHE_BASE
    vi.restoreAllMocks()
  })

  it('normalizes the keyed simple/price object into a flat prices array', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        bitcoin: {
          usd: 76975.12,
          usd_market_cap: 1540000000000,
          usd_24h_vol: 31000000000,
          usd_24h_change: -1.409,
          last_updated_at: 1779092258
        },
        ethereum: {
          usd: 2987.4,
          last_updated_at: 1779092260
        }
      })
    )

    const result = await makeService().getPrices({ ids: ['bitcoin', 'ethereum'], vs: 'usd' })

    expect(result).toEqual({
      source: 'coingecko',
      prices: [
        {
          id: 'bitcoin',
          vs: 'usd',
          price: 76975.12,
          market_cap: 1540000000000,
          volume_24h: 31000000000,
          change_24h_pct: -1.409,
          last_updated_at: 1779092258
        },
        {
          id: 'ethereum',
          vs: 'usd',
          price: 2987.4,
          market_cap: null,
          volume_24h: null,
          change_24h_pct: null,
          last_updated_at: 1779092260
        }
      ]
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://pro-api.coingecko.com')
    expect(requestUrl.pathname).toBe('/api/v3/simple/price')
    expect(requestUrl.searchParams.get('ids')).toBe('bitcoin,ethereum')
    expect(requestUrl.searchParams.get('vs_currencies')).toBe('usd')
    expect(requestUrl.searchParams.get('include_market_cap')).toBe('true')
    expect(requestUrl.searchParams.get('include_24hr_vol')).toBe('true')
    expect(requestUrl.searchParams.get('include_24hr_change')).toBe('true')
    expect(requestUrl.searchParams.get('include_last_updated_at')).toBe('true')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-cg-pro-api-key': TEST_API_KEY
    })
  })

  it('drops requested ids that are missing from the simple/price response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ bitcoin: { usd: 76975.12, last_updated_at: 1779092258 } })
    )

    const result = await makeService().getPrices({ ids: ['bitcoin', 'no-such-coin'], vs: 'usd' })

    expect(result.prices).toHaveLength(1)
    expect(result.prices[0]?.id).toBe('bitcoin')
  })

  it('maps coins/markets rows and requested change windows to compact rows', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: 'bitcoin',
          symbol: 'btc',
          name: 'Bitcoin',
          image: 'https://example.test/btc.png',
          current_price: 76975.12,
          market_cap: 1540000000000,
          market_cap_rank: 1,
          total_volume: 31000000000,
          high_24h: 78000,
          low_24h: 76000,
          price_change_percentage_24h: -1.4,
          circulating_supply: 19700000,
          price_change_percentage_1h_in_currency: 0.2,
          price_change_percentage_24h_in_currency: -1.41,
          price_change_percentage_7d_in_currency: 3.5
        },
        {
          id: 'illiquid-coin',
          symbol: null,
          name: null,
          current_price: null,
          market_cap: null,
          market_cap_rank: null,
          total_volume: null,
          high_24h: null,
          low_24h: null,
          price_change_percentage_24h: null,
          circulating_supply: null
        }
      ])
    )

    const result = await makeService().getTop({
      vs: 'usd',
      limit: 2,
      page: 1,
      category: null,
      change: ['1h', '24h', '7d'],
      order: 'market_cap_desc'
    })

    expect(result).toEqual({
      source: 'coingecko',
      vs: 'usd',
      coins: [
        {
          id: 'bitcoin',
          symbol: 'btc',
          name: 'Bitcoin',
          current_price: 76975.12,
          market_cap: 1540000000000,
          market_cap_rank: 1,
          total_volume: 31000000000,
          high_24h: 78000,
          low_24h: 76000,
          price_change_percentage_24h: -1.4,
          circulating_supply: 19700000,
          change_1h_pct: 0.2,
          change_24h_pct: -1.41,
          change_7d_pct: 3.5
        },
        {
          id: 'illiquid-coin',
          symbol: null,
          name: null,
          current_price: null,
          market_cap: null,
          market_cap_rank: null,
          total_volume: null,
          high_24h: null,
          low_24h: null,
          price_change_percentage_24h: null,
          circulating_supply: null,
          change_1h_pct: null,
          change_24h_pct: null,
          change_7d_pct: null
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/coins/markets')
    expect(requestUrl.searchParams.get('vs_currency')).toBe('usd')
    expect(requestUrl.searchParams.get('order')).toBe('market_cap_desc')
    expect(requestUrl.searchParams.get('per_page')).toBe('2')
    expect(requestUrl.searchParams.get('page')).toBe('1')
    expect(requestUrl.searchParams.get('price_change_percentage')).toBe('1h,24h,7d')
    expect(requestUrl.searchParams.get('category')).toBeNull()
  })

  it('unwraps the {data} envelope from /global', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          active_cryptocurrencies: 17468,
          upcoming_icos: 0,
          markets: 1234,
          total_market_cap: { usd: 3100000000000, btc: 40260000 },
          total_volume: { usd: 120000000000 },
          market_cap_percentage: { btc: 58.3, eth: 11.2 },
          market_cap_change_percentage_24h_usd: -0.8,
          updated_at: 1779092258
        }
      })
    )

    const result = await makeService().getGlobal()

    expect(result).toEqual({
      source: 'coingecko',
      active_cryptocurrencies: 17468,
      markets: 1234,
      total_market_cap_usd: 3100000000000,
      total_volume_usd: 120000000000,
      btc_dominance_pct: 58.3,
      eth_dominance_pct: 11.2,
      market_cap_change_percentage_24h_usd: -0.8,
      updated_at: 1779092258
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/global')
  })

  it('flattens trending coins[].item and nulls formatted-string metrics', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        coins: [
          {
            item: {
              id: 'moodeng',
              coin_id: 33093,
              name: 'Moo Deng',
              symbol: 'MOODENG',
              market_cap_rank: 341,
              price_btc: 2.9e-7,
              score: 0,
              data: {
                price: 0.0607,
                price_btc: '0.000000290710809',
                price_change_percentage_24h: { usd: 30.9, btc: 30.5 },
                market_cap: '$205,847,196',
                total_volume: '$233,246,528',
                sparkline: 'https://example.test/sparkline.svg'
              }
            }
          },
          {
            item: {
              id: 'stringly-coin',
              name: 'Stringly',
              symbol: 'STR',
              market_cap_rank: null,
              data: {
                price: '$0.0042',
                price_change_percentage_24h: { usd: '12%' }
              }
            }
          }
        ],
        nfts: [],
        categories: []
      })
    )

    const result = await makeService().getTrending()

    expect(result).toEqual({
      source: 'coingecko',
      coins: [
        {
          id: 'moodeng',
          symbol: 'MOODENG',
          name: 'Moo Deng',
          market_cap_rank: 341,
          price_usd: 0.0607,
          change_24h_usd_pct: 30.9
        },
        {
          id: 'stringly-coin',
          symbol: 'STR',
          name: 'Stringly',
          market_cap_rank: null,
          price_usd: null,
          change_24h_usd_pct: null
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/search/trending')
  })

  it('normalizes the coin profile, truncating descriptions and cleaning platforms', async () => {
    const longDescription = 'a'.repeat(1500)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        description: { en: longDescription },
        links: { homepage: ['', 'https://bitcoin.org', 'https://mirror.example'] },
        categories: ['Cryptocurrency', null, 'Layer 1 (L1)'],
        market_cap_rank: 1,
        platforms: { '': '' },
        market_data: {
          current_price: { usd: 76975.12 },
          market_cap: { usd: 1540000000000 },
          fully_diluted_valuation: { usd: 1610000000000 },
          total_volume: { usd: 31000000000 },
          price_change_percentage_24h: -1.4,
          price_change_percentage_7d: 3.5,
          price_change_percentage_30d: 10.2,
          ath: { usd: 126000 },
          ath_date: { usd: '2025-10-06T04:45:35.491Z' },
          atl: { usd: 67.81 },
          atl_date: { usd: '2013-07-06T00:00:00.000Z' },
          circulating_supply: 19700000,
          total_supply: 21000000,
          max_supply: 21000000
        },
        sentiment_votes_up_percentage: 84.5,
        sentiment_votes_down_percentage: 15.5,
        genesis_date: '2009-01-03'
      })
    )

    const result = await makeService().getCoin({ id: 'bitcoin' })

    expect(result.description).toHaveLength(1200)
    expect(result).toMatchObject({
      source: 'coingecko',
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      homepage: 'https://bitcoin.org',
      categories: ['Cryptocurrency', 'Layer 1 (L1)'],
      market_cap_rank: 1,
      platforms: {},
      market: {
        price_usd: 76975.12,
        market_cap_usd: 1540000000000,
        fdv_usd: 1610000000000,
        volume_24h_usd: 31000000000,
        change_24h_pct: -1.4,
        change_7d_pct: 3.5,
        change_30d_pct: 10.2,
        ath_usd: 126000,
        ath_date: '2025-10-06T04:45:35.491Z',
        atl_usd: 67.81,
        atl_date: '2013-07-06T00:00:00.000Z',
        circulating_supply: 19700000,
        total_supply: 21000000,
        max_supply: 21000000
      },
      sentiment_votes_up_percentage: 84.5,
      genesis_date: '2009-01-03'
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/coins/bitcoin')
    expect(requestUrl.searchParams.get('localization')).toBe('false')
    expect(requestUrl.searchParams.get('tickers')).toBe('false')
    expect(requestUrl.searchParams.get('market_data')).toBe('true')
    expect(requestUrl.searchParams.get('community_data')).toBe('false')
    expect(requestUrl.searchParams.get('developer_data')).toBe('false')
    expect(requestUrl.searchParams.get('sparkline')).toBe('false')
  })

  it('normalizes ohlc tuple arrays into candles and omits the interval param', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        [1779000000000, 100.1, 105.2, 99.5, 104.3],
        [1779014400000, 104.3, 106.0, 103.2, 105.5]
      ])
    )

    const result = await makeService().getOhlc({ id: 'bitcoin', days: '7', vs: 'usd' })

    expect(result).toEqual({
      source: 'coingecko',
      id: 'bitcoin',
      vs: 'usd',
      days: '7',
      candles: [
        { time_ms: 1779000000000, open: 100.1, high: 105.2, low: 99.5, close: 104.3 },
        { time_ms: 1779014400000, open: 104.3, high: 106.0, low: 103.2, close: 105.5 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/coins/bitcoin/ohlc')
    expect(requestUrl.searchParams.get('vs_currency')).toBe('usd')
    expect(requestUrl.searchParams.get('days')).toBe('7')
    expect(requestUrl.searchParams.get('interval')).toBeNull()
  })

  it('normalizes search results to the coins block only', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        coins: [
          {
            id: 'solana',
            name: 'Solana',
            api_symbol: 'solana',
            symbol: 'SOL',
            market_cap_rank: 6,
            thumb: 'https://example.test/sol-thumb.png',
            large: 'https://example.test/sol-large.png'
          }
        ],
        exchanges: [{ id: 'binance', name: 'Binance' }],
        icos: [],
        categories: [{ id: 1, name: 'Layer 1' }],
        nfts: []
      })
    )

    const result = await makeService().search({ query: 'solana' })

    expect(result).toEqual({
      source: 'coingecko',
      query: 'solana',
      coins: [{ id: 'solana', symbol: 'SOL', name: 'Solana', market_cap_rank: 6 }]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/search')
    expect(requestUrl.searchParams.get('query')).toBe('solana')
  })

  it('serves repeat lookups from the file cache without refetching', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        jsonResponse({ data: { active_cryptocurrencies: 17468, updated_at: 1779092258 } })
      )

    const service = makeService()
    const first = await service.getGlobal()
    const second = await service.getGlobal()

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
  })

  it('throws on provider errors without leaking the API key', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        `{"status":{"error_code":10011,"error_message":"invalid key ${TEST_API_KEY}"}}`,
        { status: 400, statusText: 'Bad Request' }
      )
    )

    const error = await makeService()
      .getGlobal()
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('coingecko request to /api/v3/global failed')
      expect(error.message).toContain('400')
      expect(error.message).not.toContain(TEST_API_KEY)
    }
  })

  it('throws the env-var message without calling fetch when unconfigured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const service = makeService('')

    await expect(service.getPrices({ ids: ['bitcoin'], vs: 'usd' })).rejects.toThrow(
      'COIN_GECKO_PRO_API_KEY is not set; direct CoinGecko market data is disabled'
    )
    expect(service.isConfigured()).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
