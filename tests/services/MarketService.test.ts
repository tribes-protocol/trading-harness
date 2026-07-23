import { afterEach, describe, expect, it, vi } from 'vitest'

import { MarketService } from '@/services/MarketService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_API_KEY = 'test-coingecko-key'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_API_KEY): MarketService {
  return new MarketService({ apiKey })
}

describe('MarketService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shapes the global snapshot and sends the pro key header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          active_cryptocurrencies: 17342,
          markets: 1201,
          total_market_cap: { usd: 3210000000000, eur: 2950000000000 },
          total_volume: { usd: 112000000000 },
          market_cap_percentage: { btc: 58.4, eth: 11.2 },
          market_cap_change_percentage_24h_usd: -1.37,
          updated_at: 1784560000
        }
      })
    )

    const result = await makeService().getGlobal()

    expect(result).toEqual({
      source: 'coingecko',
      active_cryptocurrencies: 17342,
      markets: 1201,
      market_cap_usd: 3210000000000,
      volume_24h_usd: 112000000000,
      btc_dominance_pct: 58.4,
      eth_dominance_pct: 11.2,
      market_cap_change_24h_pct: -1.37,
      updated_at: 1784560000
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://pro-api.coingecko.com')
    expect(requestUrl.pathname).toBe('/api/v3/global')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-cg-pro-api-key': TEST_API_KEY
    })
  })

  it('parses the string-encoded DeFi aggregates into numbers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          defi_market_cap: '84928375029.123',
          trading_volume_24h: '5028375029.5',
          defi_dominance: '2.9634',
          top_coin_name: 'Lido Staked Ether',
          top_coin_defi_dominance: 31.44
        }
      })
    )

    const result = await makeService().getDefi()

    expect(result).toEqual({
      source: 'coingecko',
      defi_market_cap_usd: 84928375029.123,
      trading_volume_24h_usd: 5028375029.5,
      defi_dominance_pct: 2.9634,
      top_coin_name: 'Lido Staked Ether',
      top_coin_dominance_pct: 31.44
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/global/decentralized_finance_defi')
  })

  it('maps market cap chart tuples into timed points', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        market_cap_chart: {
          market_cap: [
            [1784500000000, 3180000000000],
            [1784586400000, 3210000000000]
          ],
          volume: [[1784500000000, 104000000000]]
        }
      })
    )

    const result = await makeService().getHistory({ days: '30' })

    expect(result).toEqual({
      source: 'coingecko',
      days: '30',
      market_cap: [
        { t: 1784500000000, usd: 3180000000000 },
        { t: 1784586400000, usd: 3210000000000 }
      ],
      volume: [{ t: 1784500000000, usd: 104000000000 }]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/global/market_cap_chart')
    expect(requestUrl.searchParams.get('days')).toBe('30')
  })

  it('maps ranked coins/markets rows with the three change windows', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: 'bitcoin',
          symbol: 'btc',
          name: 'Bitcoin',
          market_cap_rank: 1,
          current_price: 76975.12,
          market_cap: 1540000000000,
          total_volume: 31000000000,
          price_change_percentage_1h_in_currency: 0.21,
          price_change_percentage_24h_in_currency: -1.41,
          price_change_percentage_7d_in_currency: 3.52
        }
      ])
    )

    const result = await makeService().getTopCoins({ limit: 25 })

    expect(result.coins).toEqual([
      {
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        rank: 1,
        price_usd: 76975.12,
        market_cap_usd: 1540000000000,
        volume_24h_usd: 31000000000,
        change_1h_pct: 0.21,
        change_24h_pct: -1.41,
        change_7d_pct: 3.52
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/coins/markets')
    expect(requestUrl.searchParams.get('vs_currency')).toBe('usd')
    expect(requestUrl.searchParams.get('per_page')).toBe('25')
    expect(requestUrl.searchParams.get('price_change_percentage')).toBe('1h,24h,7d')
  })

  it('reads the duration-keyed change field for gainers and losers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        top_gainers: [
          {
            id: 'newcoin',
            symbol: 'new',
            name: 'New Coin',
            market_cap_rank: 411,
            usd: 1.23,
            usd_24h_vol: 45600000,
            usd_7d_change: 88.5
          }
        ],
        top_losers: [
          {
            id: 'oldcoin',
            symbol: 'old',
            name: 'Old Coin',
            market_cap_rank: 502,
            usd: 0.4,
            usd_24h_vol: 1200000,
            usd_7d_change: -41.2
          }
        ]
      })
    )

    const result = await makeService().getMovers({ duration: '7d' })

    expect(result.duration).toBe('7d')
    expect(result.gainers).toEqual([
      {
        id: 'newcoin',
        symbol: 'new',
        name: 'New Coin',
        rank: 411,
        price_usd: 1.23,
        volume_24h_usd: 45600000,
        change_pct: 88.5
      }
    ])
    expect(result.losers[0]?.change_pct).toBe(-41.2)

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/coins/top_gainers_losers')
    expect(requestUrl.searchParams.get('vs_currency')).toBe('usd')
    expect(requestUrl.searchParams.get('duration')).toBe('7d')
  })

  it('trims the unpaginated category table client-side and drops null top coins', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: 'layer-1',
          name: 'Layer 1',
          market_cap: 900,
          market_cap_change_24h: -1.2,
          volume_24h: 998877,
          top_3_coins_id: ['bitcoin', 'ethereum', null]
        },
        { id: 'defi', name: 'DeFi', market_cap: 500 },
        { id: 'meme', name: 'Meme', market_cap: 100 }
      ])
    )

    const result = await makeService().getCategories({ limit: 2 })

    expect(result.categories).toHaveLength(2)
    expect(result.categories[0]).toEqual({
      id: 'layer-1',
      name: 'Layer 1',
      market_cap_usd: 900,
      change_24h_pct: -1.2,
      volume_24h_usd: 998877,
      top_coins: ['bitcoin', 'ethereum']
    })
  })

  it('keeps requested price ids in order and drops unknown ids', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        bitcoin: {
          usd: 76975.12,
          usd_market_cap: 1540000000000,
          usd_24h_vol: 31000000000,
          usd_24h_change: -1.41,
          last_updated_at: 1784560000
        },
        ethereum: { usd: 2987.4, last_updated_at: 1784560010 }
      })
    )

    const result = await makeService().getPrices({ ids: ['bitcoin', 'ethereum', 'no-such-id'] })

    expect(result.prices).toEqual([
      {
        id: 'bitcoin',
        price_usd: 76975.12,
        market_cap_usd: 1540000000000,
        volume_24h_usd: 31000000000,
        change_24h_pct: -1.41,
        updated_at: 1784560000
      },
      {
        id: 'ethereum',
        price_usd: 2987.4,
        updated_at: 1784560010
      }
    ])

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/simple/price')
    expect(requestUrl.searchParams.get('ids')).toBe('bitcoin,ethereum,no-such-id')
    expect(requestUrl.searchParams.get('vs_currencies')).toBe('usd')
  })

  it('shapes trending coins from the nested item payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        coins: [
          {
            item: {
              id: 'render',
              symbol: 'rndr',
              name: 'Render',
              market_cap_rank: 32,
              data: { price: 9.87, price_change_percentage_24h: { usd: 6.5 } }
            }
          }
        ]
      })
    )

    const result = await makeService().getTrending()

    expect(result.coins).toEqual([
      {
        id: 'render',
        symbol: 'rndr',
        name: 'Render',
        rank: 32,
        price_usd: 9.87,
        change_24h_pct: 6.5
      }
    ])
  })

  it('shapes asset platforms and trims to the limit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        {
          id: 'ethereum',
          chain_identifier: 1,
          name: 'Ethereum',
          shortname: 'eth',
          native_coin_id: 'ethereum'
        },
        { id: 'polygon-pos', chain_identifier: 137, name: 'Polygon POS' },
        { id: 'solana', name: 'Solana', native_coin_id: 'solana' }
      ])
    )

    const result = await makeService().getPlatforms({ limit: 2 })

    expect(result).toEqual({
      source: 'coingecko',
      platforms: [
        {
          id: 'ethereum',
          name: 'Ethereum',
          chain_id: 1,
          shortname: 'eth',
          native_coin_id: 'ethereum'
        },
        { id: 'polygon-pos', name: 'Polygon POS', chain_id: 137 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/asset_platforms')
  })

  it('trims platform token lists to identity fields and reports the full count', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        name: 'CoinGecko',
        timestamp: '2026-07-22T00:00:00.000Z',
        version: { major: 1, minor: 2, patch: 3 },
        tokens: [
          {
            address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
            chainId: 1,
            logoURI: 'https://example.com/usdc.png'
          },
          {
            address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
            symbol: 'USDT',
            name: 'Tether',
            decimals: 6,
            chainId: 1
          }
        ]
      })
    )

    const result = await makeService().getPlatformTokens({ platform: 'ethereum', limit: 1 })

    expect(result).toEqual({
      source: 'coingecko',
      platform: 'ethereum',
      list_name: 'CoinGecko',
      updated_at: '2026-07-22T00:00:00.000Z',
      total_tokens: 2,
      tokens: [
        {
          address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/token_lists/ethereum/all.json')
  })

  it('lists supported vs currencies', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(['usd', 'eur', 'btc']))

    const result = await makeService().getSupportedCurrencies()

    expect(result).toEqual({ source: 'coingecko', currencies: ['usd', 'eur', 'btc'] })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/simple/supported_vs_currencies')
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(makeService('').getGlobal()).rejects.toThrow(
      'COIN_GECKO_PRO_API_KEY is not set — the `market` command group is unavailable on this box'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on provider errors with status and truncated body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"rate limited"}', { status: 429, statusText: 'Too Many Requests' })
    )

    const error = await makeService()
      .getGlobal()
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain('CoinGecko /api/v3/global failed: 429 Too Many Requests')
      expect(error.message).not.toContain(TEST_API_KEY)
    }
  })
})
