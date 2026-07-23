import { afterEach, describe, expect, it, vi } from 'vitest'

import { OnchainService } from '@/services/OnchainService'
import { ensureJsonTreeString } from '@/utils/Lang'

const TEST_API_KEY = 'test-coingecko-onchain-key'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function makeService(apiKey = TEST_API_KEY): OnchainService {
  return new OnchainService({ apiKey })
}

function poolPayload(): unknown {
  return {
    id: 'polygon_pos_0xa374094527e1673a86de625aa59517c5de346d32',
    type: 'pool',
    attributes: {
      address: '0xa374094527e1673a86de625aa59517c5de346d32',
      name: 'WMATIC / USDC 0.05%',
      pool_created_at: '2021-12-22T02:28:32Z',
      base_token_price_usd: '0.5212',
      quote_token_price_usd: '1.0001',
      fdv_usd: '5210000000',
      market_cap_usd: null,
      reserve_in_usd: '16398854.1812',
      price_change_percentage: { m5: '0.1', h1: '-0.42', h6: '1.9', h24: '4.85' },
      volume_usd: { m5: '1200.5', h1: '90000.1', h6: '410000', h24: '2489573.9' },
      transactions: {
        m5: { buys: 3, sells: 1, buyers: 3, sellers: 1 },
        h24: { buys: 2410, sells: 1987, buyers: 811, sellers: 702 }
      }
    },
    relationships: {
      dex: { data: { id: 'uniswap_v3', type: 'dex' } },
      base_token: { data: { id: 'polygon_pos_0x0d500b1d', type: 'token' } }
    }
  }
}

describe('OnchainService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('flattens networks and sends the pro key header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'eth',
            type: 'network',
            attributes: { name: 'Ethereum', coingecko_asset_platform_id: 'ethereum' }
          },
          { id: 'solana', type: 'network', attributes: { name: 'Solana' } }
        ]
      })
    )

    const result = await makeService().getNetworks({ limit: 50 })

    expect(result).toEqual({
      source: 'geckoterminal',
      networks: [
        { id: 'eth', name: 'Ethereum', coingecko_id: 'ethereum' },
        { id: 'solana', name: 'Solana' }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.origin).toBe('https://pro-api.coingecko.com')
    expect(requestUrl.pathname).toBe('/api/v3/onchain/networks')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-cg-pro-api-key': TEST_API_KEY
    })
  })

  it('trims networks client-side to the limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'eth', attributes: { name: 'Ethereum' } },
          { id: 'base', attributes: { name: 'Base' } },
          { id: 'solana', attributes: { name: 'Solana' } }
        ]
      })
    )

    const result = await makeService().getNetworks({ limit: 2 })

    expect(result.networks.map((network) => network.id)).toEqual(['eth', 'base'])
  })

  it('shapes dexes for a network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'uniswap_v3', type: 'dex', attributes: { name: 'Uniswap V3' } },
          { id: 'sushiswap', type: 'dex', attributes: { name: 'SushiSwap' } }
        ]
      })
    )

    const result = await makeService().getDexes({ network: 'eth', limit: 50 })

    expect(result).toEqual({
      source: 'geckoterminal',
      network: 'eth',
      dexes: [
        { id: 'uniswap_v3', name: 'Uniswap V3' },
        { id: 'sushiswap', name: 'SushiSwap' }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/networks/eth/dexes')
  })

  it('flattens JSON:API pool rows with decimal strings and a network parsed off the id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: [poolPayload()] }))

    const result = await makeService().getTrendingPools({ network: null, limit: 20 })

    expect(result).toEqual({
      source: 'geckoterminal',
      pools: [
        {
          network: 'polygon_pos',
          address: '0xa374094527e1673a86de625aa59517c5de346d32',
          name: 'WMATIC / USDC 0.05%',
          dex: 'uniswap_v3',
          price_usd: 0.5212,
          change_1h_pct: -0.42,
          change_24h_pct: 4.85,
          volume_24h_usd: 2489573.9,
          reserve_usd: 16398854.1812,
          fdv_usd: 5210000000,
          buys_24h: 2410,
          sells_24h: 1987,
          created_at: '2021-12-22T02:28:32Z'
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/networks/trending_pools')
  })

  it('routes trending pools to the network-scoped path when a network is given', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: [] }))

    await makeService().getTrendingPools({ network: 'solana', limit: 20 })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/networks/solana/trending_pools')
  })

  it('routes top pools through the dex path when a dex is given', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse({ data: [] }))

    await makeService().getTopPools({ network: 'eth', dex: 'uniswap_v3', limit: 20 })
    await makeService().getTopPools({ network: 'eth', dex: null, limit: 20 })

    const dexUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(dexUrl.pathname).toBe('/api/v3/onchain/networks/eth/dexes/uniswap_v3/pools')
    const networkUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(networkUrl.pathname).toBe('/api/v3/onchain/networks/eth/pools')
  })

  it('routes new pools to the all-networks path when no network is given', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse({ data: [] }))

    await makeService().getNewPools({ network: null, limit: 20 })
    await makeService().getNewPools({ network: 'base', limit: 20 })

    const allUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(allUrl.pathname).toBe('/api/v3/onchain/networks/new_pools')
    const scopedUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(scopedUrl.pathname).toBe('/api/v3/onchain/networks/base/new_pools')
  })

  it('shapes the single-pool snapshot with windowed changes, volumes, and tx counts', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: poolPayload() }))

    const result = await makeService().getPool({
      network: 'polygon_pos',
      address: '0xa374094527e1673a86de625aa59517c5de346d32'
    })

    expect(result).toEqual({
      source: 'geckoterminal',
      network: 'polygon_pos',
      address: '0xa374094527e1673a86de625aa59517c5de346d32',
      name: 'WMATIC / USDC 0.05%',
      dex: 'uniswap_v3',
      price_usd: 0.5212,
      quote_token_price_usd: 1.0001,
      reserve_usd: 16398854.1812,
      fdv_usd: 5210000000,
      market_cap_usd: null,
      change_pct: { m5: 0.1, h1: -0.42, h6: 1.9, h24: 4.85 },
      volume_usd: { m5: 1200.5, h1: 90000.1, h6: 410000, h24: 2489573.9 },
      tx_24h: { buys: 2410, sells: 1987, buyers: 811, sellers: 702 },
      created_at: '2021-12-22T02:28:32Z'
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(
      '/api/v3/onchain/networks/polygon_pos/pools/0xa374094527e1673a86de625aa59517c5de346d32'
    )
  })

  it('maps ohlcv rows into the shared candle contract with epoch-ms timestamps', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          id: 'ohlcv',
          type: 'ohlcv_request_response',
          attributes: {
            ohlcv_list: [
              [1712880000, 3454.61, 3660.85, 3417.91, 3660.85, 306823.277],
              [1712793600, 3401.12, 3470.0, 3388.5, 3454.61, 281004.9]
            ]
          }
        }
      })
    )

    const result = await makeService().getPoolOhlcv({
      network: 'eth',
      address: '0xpool',
      timeframe: 'day',
      aggregate: 1,
      limit: 2
    })

    expect(result).toEqual({
      source: 'geckoterminal',
      candles: [
        { t: 1712880000000, o: 3454.61, h: 3660.85, l: 3417.91, c: 3660.85, v: 306823.277 },
        { t: 1712793600000, o: 3401.12, h: 3470.0, l: 3388.5, c: 3454.61, v: 281004.9 }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/networks/eth/pools/0xpool/ohlcv/day')
    expect(requestUrl.searchParams.get('limit')).toBe('2')
    expect(requestUrl.searchParams.get('aggregate')).toBe('1')
  })

  it('omits the aggregate param when not provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: { attributes: { ohlcv_list: [] } } }))

    await makeService().getPoolOhlcv({
      network: 'eth',
      address: '0xpool',
      timeframe: 'hour',
      aggregate: null,
      limit: 100
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/networks/eth/pools/0xpool/ohlcv/hour')
    expect(requestUrl.searchParams.has('aggregate')).toBe(false)
  })

  it('shapes trades with epoch-ms timestamps and trims to the limit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'trade-1',
            type: 'trade',
            attributes: {
              block_timestamp: '2024-04-08T16:52:35Z',
              tx_hash: '0xabc',
              kind: 'buy',
              volume_in_usd: '9153.28',
              price_from_in_usd: '1.0001',
              price_to_in_usd: '3454.61',
              from_token_amount: '9152.36',
              to_token_amount: '2.65'
            }
          },
          {
            id: 'trade-2',
            type: 'trade',
            attributes: {
              block_timestamp: '2024-04-08T16:52:10Z',
              tx_hash: '0xdef',
              kind: 'sell',
              volume_in_usd: '120.5'
            }
          }
        ]
      })
    )

    const result = await makeService().getPoolTrades({
      network: 'eth',
      address: '0xpool',
      limit: 1
    })

    expect(result).toEqual({
      source: 'geckoterminal',
      network: 'eth',
      address: '0xpool',
      trades: [
        {
          t: Date.parse('2024-04-08T16:52:35Z'),
          tx_hash: '0xabc',
          side: 'buy',
          volume_usd: 9153.28,
          price_from_usd: 1.0001,
          price_to_usd: 3454.61,
          from_amount: 9152.36,
          to_amount: 2.65
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/networks/eth/pools/0xpool/trades')
  })

  it('passes query and optional network to pool search', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: [poolPayload()] }))

    const result = await makeService().searchPools({ query: 'wmatic', network: 'polygon_pos' })

    expect(result.query).toBe('wmatic')
    expect(result.pools[0]?.address).toBe('0xa374094527e1673a86de625aa59517c5de346d32')

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/search/pools')
    expect(requestUrl.searchParams.get('query')).toBe('wmatic')
    expect(requestUrl.searchParams.get('network')).toBe('polygon_pos')
  })

  it('maps megafilter floors to CoinGecko param names and shapes pools', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: [poolPayload()] }))

    const result = await makeService().getMegafilterPools({
      networks: 'eth,base',
      dexes: 'uniswap_v3',
      minFdv: 1000000,
      minLiquidity: 500000,
      minVolume: 250000,
      sort: 'h24_volume_usd_desc',
      limit: 20
    })

    expect(result.source).toBe('geckoterminal')
    expect(result.pools[0]?.address).toBe('0xa374094527e1673a86de625aa59517c5de346d32')

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/pools/megafilter')
    expect(requestUrl.searchParams.get('networks')).toBe('eth,base')
    expect(requestUrl.searchParams.get('dexes')).toBe('uniswap_v3')
    expect(requestUrl.searchParams.get('fdv_usd_min')).toBe('1000000')
    expect(requestUrl.searchParams.get('reserve_in_usd_min')).toBe('500000')
    expect(requestUrl.searchParams.get('h24_volume_usd_min')).toBe('250000')
    expect(requestUrl.searchParams.get('sort')).toBe('h24_volume_usd_desc')
  })

  it('omits unset megafilter params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: [] }))

    await makeService().getMegafilterPools({
      networks: null,
      dexes: null,
      minFdv: null,
      minLiquidity: null,
      minVolume: null,
      sort: null,
      limit: 20
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect([...requestUrl.searchParams.keys()]).toEqual([])
  })

  it('shapes onchain categories with decimal-string metrics', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'meme',
            type: 'category',
            attributes: {
              name: 'Meme',
              h24_volume_usd: '1200000.5',
              reserve_in_usd: '890000000.25',
              fdv_usd: '31000000000',
              h24_tx_count: 145230
            }
          },
          { id: 'ai', type: 'category', attributes: { name: 'AI' } }
        ]
      })
    )

    const result = await makeService().getCategories({ limit: 1 })

    expect(result).toEqual({
      source: 'geckoterminal',
      categories: [
        {
          id: 'meme',
          name: 'Meme',
          volume_24h_usd: 1200000.5,
          reserve_usd: 890000000.25,
          fdv_usd: 31000000000,
          tx_24h: 145230
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/categories')
  })

  it('routes pools-by-category and echoes the category', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: [poolPayload()] }))

    const result = await makeService().getPoolsByCategory({ category: 'meme', limit: 20 })

    expect(result.category).toBe('meme')
    expect(result.pools[0]?.dex).toBe('uniswap_v3')

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/categories/meme/pools')
  })

  it('requests trending-search pools with the pools count param', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: [poolPayload()] }))

    const result = await makeService().getTrendingSearchPools({ limit: 5 })

    expect(result.pools).toHaveLength(1)

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/pools/trending_search')
    expect(requestUrl.searchParams.get('pools')).toBe('5')
  })

  it('prices pair-ohlcv in the quote token and emits the shared candle contract', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          id: 'ohlcv',
          type: 'ohlcv_request_response',
          attributes: {
            ohlcv_list: [[1712880000, 0.021, 0.023, 0.0205, 0.0225, 152000.4]]
          }
        }
      })
    )

    const result = await makeService().getPairOhlcv({
      network: 'eth',
      pool: '0xpool',
      base: '0xbase',
      quote: '0xquote',
      timeframe: 'hour',
      aggregate: 4,
      limit: 100
    })

    expect(result).toEqual({
      source: 'geckoterminal',
      candles: [{ t: 1712880000000, o: 0.021, h: 0.023, l: 0.0205, c: 0.0225, v: 152000.4 }]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/networks/eth/pools/0xpool/ohlcv/hour')
    expect(requestUrl.searchParams.get('token')).toBe('0xbase')
    expect(requestUrl.searchParams.get('currency')).toBe('token')
    expect(requestUrl.searchParams.get('aggregate')).toBe('4')
    expect(requestUrl.searchParams.get('limit')).toBe('100')
  })

  it('shapes recently updated tokens with a network parsed off the id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: 'polygon_pos_0xtoken',
            type: 'token',
            attributes: {
              address: '0xtoken',
              name: 'Example',
              symbol: 'EXM',
              coingecko_coin_id: 'example',
              gt_score: 71.5,
              metadata_updated_at: '2026-07-22T10:00:00Z'
            }
          },
          { id: 'eth_0xother', type: 'token', attributes: { symbol: 'OTH' } }
        ]
      })
    )

    const result = await makeService().getRecentlyUpdatedTokens({ limit: 1 })

    expect(result).toEqual({
      source: 'geckoterminal',
      tokens: [
        {
          network: 'polygon_pos',
          address: '0xtoken',
          name: 'Example',
          symbol: 'EXM',
          coingecko_id: 'example',
          gt_score: 71.5,
          updated_at: '2026-07-22T10:00:00Z'
        }
      ]
    })

    const requestUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v3/onchain/tokens/info_recently_updated')
  })

  it('throws the unavailable message without calling fetch when the key is unset', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(makeService('').getNetworks({ limit: 50 })).rejects.toThrow(
      'COIN_GECKO_PRO_API_KEY is not set — the `onchain` command group is unavailable on this box'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws on provider errors with status and truncated body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"rate limited"}', { status: 429, statusText: 'Too Many Requests' })
    )

    const error = await makeService()
      .getNetworks({ limit: 50 })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    if (error instanceof Error) {
      expect(error.message).toContain(
        'CoinGecko /api/v3/onchain/networks failed: 429 Too Many Requests'
      )
      expect(error.message).not.toContain(TEST_API_KEY)
    }
  })
})
