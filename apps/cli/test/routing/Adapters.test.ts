import type { InfoClient } from '@nktkas/hyperliquid'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type AssetServices,
  candlesContractSources,
  candlesIdSources,
  candlesPoolSources,
  candlesTickerSources,
  holdersSources,
  newListingSources,
  priceContractSources,
  priceIdSources,
  pricePerpSources,
  priceTickerSources,
  profileContractSources,
  profileIdSources,
  profileTickerSources,
  searchSources,
  trendingSources
} from '@/routing/Adapters'
import { resolveChain } from '@/routing/Chains'
import { resolveCapability } from '@/routing/Router'
import { BirdeyeService } from '@/services/BirdeyeService'
import { CoinService } from '@/services/CoinService'
import { HyperliquidService } from '@/services/HyperliquidService'
import { MarketService } from '@/services/MarketService'
import { OnchainService } from '@/services/OnchainService'
import { StocksService } from '@/services/StocksService'
import type { TransactionService } from '@/services/TransactionService'
import { AssetCandlesPayloadSchema, AssetPriceQuotePayloadSchema } from '@/types/Capability'
import { ensureJsonTreeString } from '@/utils/Lang'

const EVM_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112'
const POOL_ADDRESS = '8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj'

const ETHEREUM = resolveChain('ethereum')
const SOLANA = resolveChain('solana')

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(ensureJsonTreeString(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function errorResponse(status: number, statusText: string): Response {
  return new Response('provider error body', { status, statusText })
}

const fakeInfoClient = {
  perpDexs: async () => [],
  metaAndAssetCtxs: async () => [
    { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 40 }] },
    [
      {
        markPx: '65000',
        midPx: '65010',
        oraclePx: '64990',
        prevDayPx: '62500',
        dayNtlVlm: '123456789',
        dayBaseVlm: '1900',
        funding: '0.0001',
        openInterest: '1000',
        premium: '0.0002',
        impactPxs: ['64999', '65001']
      }
    ]
  ]
} as unknown as InfoClient

function makeServices(): AssetServices {
  return {
    birdeye: new BirdeyeService({ apiKey: 'test-birdeye-key' }),
    onchain: new OnchainService({ apiKey: 'test-coingecko-key' }),
    market: new MarketService({ apiKey: 'test-coingecko-key' }),
    coin: new CoinService({ apiKey: 'test-coingecko-key' }),
    stocks: new StocksService({ apiKey: 'test-marketstack-key' }),
    hyperliquid: new HyperliquidService({
      transaction: {} as unknown as TransactionService,
      infoClient: fakeInfoClient
    })
  }
}

// --- provider fixtures -----------------------------------------------------

const BIRDEYE_PRICE_FIXTURE = {
  success: true,
  data: {
    [EVM_ADDRESS]: {
      value: 3500.5,
      updateUnixTime: 1784560000,
      priceChange24h: -2.1,
      liquidity: 45000000
    }
  }
}

const GT_SIMPLE_PRICE_FIXTURE = {
  data: {
    attributes: {
      token_prices: { [EVM_ADDRESS]: '3499.8' },
      market_cap_usd: { [EVM_ADDRESS]: '11000000000' },
      h24_volume_usd: { [EVM_ADDRESS]: '900000000' },
      h24_price_change_percentage: { [EVM_ADDRESS]: '-2.2' }
    }
  }
}

const BIRDEYE_OHLCV_FIXTURE = {
  data: {
    items: [
      { unix_time: 1784556400, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 },
      { unix_time: 1784560000, o: 1.5, h: 2.5, l: 1, c: 2, v: 150 }
    ]
  }
}

const GT_OHLCV_FIXTURE = {
  data: {
    attributes: {
      ohlcv_list: [
        [1784556400, 1, 2, 0.5, 1.5, 100],
        [1784560000, 1.5, 2.5, 1, 2, 150]
      ]
    }
  }
}

const BIRDEYE_OVERVIEW_FIXTURE = {
  data: {
    address: EVM_ADDRESS,
    symbol: 'WETH',
    name: 'Wrapped Ether',
    price: 3500.5,
    marketCap: 11000000000,
    fdv: 12000000000,
    liquidity: 45000000,
    v24hUSD: 900000000,
    holder: 850000,
    priceChange24hPercent: -2.1
  }
}

const GT_TOKEN_SNAPSHOT_FIXTURE = {
  data: {
    attributes: {
      name: 'Wrapped Ether',
      symbol: 'WETH',
      price_usd: '3499.8',
      fdv_usd: '12000000000',
      market_cap_usd: '11000000000',
      volume_usd: { h24: '900000000' },
      total_reserve_in_usd: '45000000'
    }
  }
}

const GT_TOKEN_INFO_FIXTURE = {
  data: {
    attributes: {
      name: 'Wrapped Ether',
      symbol: 'WETH',
      decimals: 18,
      websites: ['https://weth.io'],
      twitter_handle: 'weth_io',
      telegram_handle: null,
      discord_url: null,
      description: 'Canonical wrapped ETH',
      gt_score: 92
    }
  }
}

const GT_POOLS_FIXTURE = {
  data: [
    {
      id: 'solana_' + POOL_ADDRESS,
      attributes: {
        address: POOL_ADDRESS,
        name: 'SOL / USDC',
        base_token_price_usd: '171.4',
        price_change_percentage: { h1: '0.4', h24: '-2.1' },
        volume_usd: { h24: '12000000' },
        reserve_in_usd: '34000000',
        fdv_usd: '81000000000',
        transactions: { h24: { buys: 100, sells: 90 } },
        pool_created_at: '2026-01-01T00:00:00Z'
      },
      relationships: { dex: { data: { id: 'raydium' } } }
    }
  ]
}

const GT_TOP_HOLDERS_FIXTURE = {
  data: {
    attributes: {
      holders: [
        {
          address: 'Holder1',
          label: 'exchange',
          amount: '1234.5',
          percentage: '1.2',
          value: '99000'
        }
      ]
    }
  }
}

const STOCKPRICE_FIXTURE = {
  data: [{ ticker: 'AAPL', price: 231.5, currency: 'USD', trade_last: '2026-07-22T19:59:00+0000' }]
}

const EOD_FIXTURE = {
  pagination: { limit: 1, offset: 0, count: 1, total: 1 },
  data: [
    {
      date: '2026-07-22T00:00:00+0000',
      symbol: 'AAPL',
      open: 229.4,
      high: 233.9,
      low: 228.7,
      close: 231.2,
      volume: 51000000
    }
  ]
}

describe('asset adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- price × contract ----------------------------------------------------

  it('price×contract calls BirdEye multi_price first with the right shape', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(BIRDEYE_PRICE_FIXTURE))
    const sources = priceContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM
    })

    const result = await resolveCapability({ capability: 'price', sources })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.origin).toBe('https://public-api.birdeye.so')
    expect(url.pathname).toBe('/defi/multi_price')
    expect(url.searchParams.get('list_address')).toBe(EVM_ADDRESS)
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'ethereum' })
    expect(result).toMatchObject({
      source: 'birdeye',
      attempted: [{ provider: 'birdeye', outcome: 'ok' }],
      price_usd: 3500.5,
      change_24h_pct: -2.1,
      liquidity_usd: 45000000,
      updated_at: 1784560000
    })
  })

  it('price×contract falls back to GeckoTerminal on BirdEye 429', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === 'public-api.birdeye.so') {
        return errorResponse(429, 'Too Many Requests')
      }
      return jsonResponse(GT_SIMPLE_PRICE_FIXTURE)
    })
    const sources = priceContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM
    })

    const result = await resolveCapability({ capability: 'price', sources })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const secondUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(secondUrl.origin).toBe('https://pro-api.coingecko.com')
    expect(secondUrl.pathname).toBe(
      `/api/v3/onchain/simple/networks/eth/token_price/${EVM_ADDRESS}`
    )
    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'http_429' })
    expect(result.attempted[1]).toEqual({ provider: 'geckoterminal', outcome: 'ok' })
    expect(result.price_usd).toBe(3499.8)
  })

  it('price×contract: both providers parse against the same quote schema', async () => {
    const sources = priceContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(BIRDEYE_PRICE_FIXTURE))
    const birdeyePayload = await sources[0].fetch()
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(GT_SIMPLE_PRICE_FIXTURE))
    const geckoPayload = await sources[1].fetch()

    expect(() => AssetPriceQuotePayloadSchema.parse(birdeyePayload)).not.toThrow()
    expect(() => AssetPriceQuotePayloadSchema.parse(geckoPayload)).not.toThrow()
  })

  // --- price × id ----------------------------------------------------------

  it('price×id calls CoinGecko simple/price and is authoritative on not-found', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        bitcoin: {
          usd: 65000,
          usd_market_cap: 1280000000000,
          usd_24h_vol: 31000000000,
          usd_24h_change: -1.4,
          last_updated_at: 1784560000
        }
      })
    )
    const sources = priceIdSources({ services: makeServices(), id: 'bitcoin' })

    const result = await resolveCapability({ capability: 'price', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/v3/simple/price')
    expect(url.searchParams.get('ids')).toBe('bitcoin')
    expect(result).toMatchObject({ source: 'coingecko', price_usd: 65000 })
  })

  it('price×id surfaces an unknown id as final not_found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}))
    const sources = priceIdSources({ services: makeServices(), id: 'no-such-coin' })

    await expect(resolveCapability({ capability: 'price', sources })).rejects.toThrow(/not_found/)
  })

  // --- price × ticker ------------------------------------------------------

  it('price×ticker calls Marketstack stockprice first', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(STOCKPRICE_FIXTURE))
    const sources = priceTickerSources({ services: makeServices(), ticker: 'AAPL' })

    const result = await resolveCapability({ capability: 'price', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.origin).toBe('https://api.marketstack.com')
    expect(url.pathname).toBe('/v2/stockprice')
    expect(url.searchParams.get('ticker')).toBe('AAPL')
    expect(result).toMatchObject({ source: 'marketstack', symbol: 'AAPL', price_usd: 231.5 })
    expect(result.stale).toBeUndefined()
  })

  it('price×ticker falls back to the latest EOD close labeled stale on 429', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/v2/stockprice') {
        return errorResponse(429, 'Too Many Requests')
      }
      return jsonResponse(EOD_FIXTURE)
    })
    const sources = priceTickerSources({ services: makeServices(), ticker: 'AAPL' })

    const result = await resolveCapability({ capability: 'price', sources })

    const secondUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(secondUrl.pathname).toBe('/v2/eod')
    expect(result).toMatchObject({
      source: 'marketstack',
      price_usd: 231.2,
      stale: true
    })
    expect(result.attempted[0]).toMatchObject({ provider: 'marketstack', outcome: 'http_429' })
    expect(result.attempted[1]).toEqual({ provider: 'marketstack', outcome: 'ok' })
  })

  // --- price × perp --------------------------------------------------------

  it('price×perp reads the Hyperliquid mark price from the asset listing', async () => {
    const sources = pricePerpSources({ services: makeServices(), perp: 'btc' })

    const result = await resolveCapability({ capability: 'price', sources })

    expect(result).toMatchObject({
      source: 'hyperliquid',
      symbol: 'BTC',
      price_usd: 65000,
      volume_24h_usd: 123456789
    })
    expect(result.change_24h_pct).toBeCloseTo(4, 5)
  })

  it('price×perp surfaces an unknown coin as final not_found', async () => {
    const sources = pricePerpSources({ services: makeServices(), perp: 'NOPE' })

    await expect(resolveCapability({ capability: 'price', sources })).rejects.toThrow(/not_found/)
  })

  // --- candles × contract --------------------------------------------------

  it('candles×contract calls BirdEye v3/ohlcv first with the mapped timeframe', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(BIRDEYE_OHLCV_FIXTURE))
    const sources = candlesContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM,
      timeframe: '4h'
    })

    const result = await resolveCapability({ capability: 'candles', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/defi/v3/ohlcv')
    expect(url.searchParams.get('address')).toBe(EVM_ADDRESS)
    expect(url.searchParams.get('type')).toBe('4H')
    expect(result.source).toBe('birdeye')
    expect(result.candles[0]).toEqual({ t: 1784556400000, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 })
  })

  it('candles×contract falls back to GeckoTerminal token OHLCV on 500', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === 'public-api.birdeye.so') {
        return errorResponse(500, 'Internal Server Error')
      }
      return jsonResponse(GT_OHLCV_FIXTURE)
    })
    const sources = candlesContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM,
      timeframe: '4h'
    })

    const result = await resolveCapability({ capability: 'candles', sources })

    const secondUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(secondUrl.pathname).toBe(`/api/v3/onchain/networks/eth/tokens/${EVM_ADDRESS}/ohlcv/hour`)
    expect(secondUrl.searchParams.get('aggregate')).toBe('4')
    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'http_500' })
    expect(result.candles).toHaveLength(2)
  })

  it('candles×contract: both providers parse against the same candles schema', async () => {
    const sources = candlesContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM,
      timeframe: '1h'
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(BIRDEYE_OHLCV_FIXTURE))
    const birdeyePayload = await sources[0].fetch()
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(GT_OHLCV_FIXTURE))
    const geckoPayload = await sources[1].fetch()

    expect(() => AssetCandlesPayloadSchema.parse(birdeyePayload)).not.toThrow()
    expect(() => AssetCandlesPayloadSchema.parse(geckoPayload)).not.toThrow()
    expect(birdeyePayload.candles[0]?.t).toBe(geckoPayload.candles[0]?.t)
  })

  it('candles×contract has no GeckoTerminal fallback for 1w (unsupported there)', () => {
    const sources = candlesContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM,
      timeframe: '1w'
    })

    expect(sources.map((source) => source.provider)).toEqual(['birdeye'])
  })

  // --- candles × id --------------------------------------------------------

  it('candles×id calls CoinGecko coin OHLC with days', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse([
        [1784556400000, 65000, 65500, 64800, 65200],
        [1784560000000, 65200, 65600, 65000, 65400]
      ])
    )
    const sources = candlesIdSources({ services: makeServices(), id: 'bitcoin', days: '30' })

    const result = await resolveCapability({ capability: 'candles', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/v3/coins/bitcoin/ohlc')
    expect(url.searchParams.get('days')).toBe('30')
    expect(result.source).toBe('coingecko')
    expect(result.candles[0]).toEqual({
      t: 1784556400000,
      o: 65000,
      h: 65500,
      l: 64800,
      c: 65200,
      v: null
    })
  })

  // --- candles × ticker ----------------------------------------------------

  it('candles×ticker calls Marketstack EOD', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(EOD_FIXTURE))
    const sources = candlesTickerSources({ services: makeServices(), ticker: 'AAPL' })

    const result = await resolveCapability({ capability: 'candles', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v2/eod')
    expect(url.searchParams.get('symbols')).toBe('AAPL')
    expect(result.source).toBe('marketstack')
    expect(result.candles).toHaveLength(1)
  })

  // --- candles × pool ------------------------------------------------------

  it('candles×pool calls GeckoTerminal pool OHLCV first', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(GT_OHLCV_FIXTURE))
    const sources = candlesPoolSources({
      services: makeServices(),
      pool: POOL_ADDRESS,
      chain: SOLANA,
      timeframe: '1d'
    })

    const result = await resolveCapability({ capability: 'candles', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe(`/api/v3/onchain/networks/solana/pools/${POOL_ADDRESS}/ohlcv/day`)
    expect(result.source).toBe('geckoterminal')
  })

  it('candles×pool falls back to BirdEye pair OHLCV on 429', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === 'pro-api.coingecko.com') {
        return errorResponse(429, 'Too Many Requests')
      }
      return jsonResponse(BIRDEYE_OHLCV_FIXTURE)
    })
    const sources = candlesPoolSources({
      services: makeServices(),
      pool: POOL_ADDRESS,
      chain: SOLANA,
      timeframe: '1d'
    })

    const result = await resolveCapability({ capability: 'candles', sources })

    const secondUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(secondUrl.origin).toBe('https://public-api.birdeye.so')
    expect(secondUrl.pathname).toBe('/defi/v3/ohlcv/pair')
    expect(secondUrl.searchParams.get('address')).toBe(POOL_ADDRESS)
    expect(secondUrl.searchParams.get('type')).toBe('1D')
    expect(result.source).toBe('birdeye')
    expect(result.attempted[0]).toMatchObject({ provider: 'geckoterminal', outcome: 'http_429' })
  })

  // --- profile × contract --------------------------------------------------

  it('profile×contract calls BirdEye token_overview first', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(BIRDEYE_OVERVIEW_FIXTURE))
    const sources = profileContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM
    })

    const result = await resolveCapability({ capability: 'profile', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/defi/token_overview')
    expect(result).toMatchObject({
      source: 'birdeye',
      symbol: 'WETH',
      chain: 'ethereum',
      price_usd: 3500.5,
      holders: 850000
    })
  })

  it('profile×contract falls back to the composed GeckoTerminal snapshot+info on 401', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === 'public-api.birdeye.so') {
        return errorResponse(401, 'Unauthorized')
      }
      if (url.pathname.endsWith('/info')) {
        return jsonResponse(GT_TOKEN_INFO_FIXTURE)
      }
      return jsonResponse(GT_TOKEN_SNAPSHOT_FIXTURE)
    })
    const sources = profileContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM
    })

    const result = await resolveCapability({ capability: 'profile', sources })

    expect(fetchSpy).toHaveBeenCalledTimes(3)
    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'http_401' })
    expect(result).toMatchObject({
      symbol: 'WETH',
      price_usd: 3499.8,
      liquidity_usd: 45000000,
      description: 'Canonical wrapped ETH'
    })
    expect(result.links).toMatchObject({ homepage: 'https://weth.io', twitter: 'weth_io' })
  })

  // --- profile × id / ticker ----------------------------------------------

  it('profile×id calls the CoinGecko coin profile', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 'bitcoin',
        symbol: 'btc',
        name: 'Bitcoin',
        market_cap_rank: 1,
        description: { en: 'Digital gold' },
        links: { homepage: ['https://bitcoin.org'], twitter_screen_name: 'bitcoin' },
        market_data: {
          current_price: { usd: 65000 },
          market_cap: { usd: 1280000000000 },
          fully_diluted_valuation: { usd: 1365000000000 },
          total_volume: { usd: 31000000000 },
          price_change_percentage_24h: -1.4
        }
      })
    )
    const sources = profileIdSources({ services: makeServices(), id: 'bitcoin' })

    const result = await resolveCapability({ capability: 'profile', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/v3/coins/bitcoin')
    expect(result).toMatchObject({
      source: 'coingecko',
      id: 'bitcoin',
      rank: 1,
      price_usd: 65000,
      description: 'Digital gold'
    })
  })

  it('profile×ticker calls the Marketstack ticker detail', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        symbol: 'AAPL',
        name: 'Apple Inc',
        sector: 'Technology',
        industry: 'Consumer Electronics',
        stock_exchange: { acronym: 'NASDAQ', mic: 'XNAS', country: 'USA' }
      })
    )
    const sources = profileTickerSources({ services: makeServices(), ticker: 'AAPL' })

    const result = await resolveCapability({ capability: 'profile', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v2/tickers/AAPL')
    expect(result).toMatchObject({
      source: 'marketstack',
      symbol: 'AAPL',
      sector: 'Technology',
      exchange: 'NASDAQ'
    })
  })

  // --- trending ------------------------------------------------------------

  it('trending onchain calls BirdEye token_trending first', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          tokens: [
            {
              address: SOL_ADDRESS,
              symbol: 'SOL',
              name: 'Wrapped SOL',
              rank: 1,
              price: 171.4,
              price24hChangePercent: -2.1,
              volume24hUSD: 2100000000,
              liquidity: 45000000,
              marketcap: 81000000000
            }
          ]
        }
      })
    )
    const sources = trendingSources({
      services: makeServices(),
      space: 'onchain',
      chain: null,
      limit: 10
    })

    const result = await resolveCapability({ capability: 'trending', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/defi/token_trending')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'solana' })
    expect(result.source).toBe('birdeye')
    expect(result.space).toBe('onchain')
    expect(result.items[0]).toMatchObject({ address: SOL_ADDRESS, symbol: 'SOL', rank: 1 })
  })

  it('trending onchain falls back to GeckoTerminal trending pools on 429', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === 'public-api.birdeye.so') {
        return errorResponse(429, 'Too Many Requests')
      }
      return jsonResponse(GT_POOLS_FIXTURE)
    })
    const sources = trendingSources({
      services: makeServices(),
      space: 'onchain',
      chain: null,
      limit: 10
    })

    const result = await resolveCapability({ capability: 'trending', sources })

    const secondUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(secondUrl.pathname).toBe('/api/v3/onchain/networks/trending_pools')
    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'http_429' })
    expect(result.items[0]).toMatchObject({ address: POOL_ADDRESS, liquidity_usd: 34000000 })
  })

  it('trending coins calls CoinGecko search/trending', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        coins: [
          {
            item: {
              id: 'bitcoin',
              symbol: 'btc',
              name: 'Bitcoin',
              market_cap_rank: 1,
              data: { price: 65000, price_change_percentage_24h: { usd: -1.4 } }
            }
          }
        ]
      })
    )
    const sources = trendingSources({
      services: makeServices(),
      space: 'coins',
      chain: null,
      limit: 10
    })

    const result = await resolveCapability({ capability: 'trending', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/v3/search/trending')
    expect(result.source).toBe('coingecko')
    expect(result.items[0]).toMatchObject({ id: 'bitcoin', price_usd: 65000 })
  })

  // --- new listings ---------------------------------------------------------

  it('new onchain calls BirdEye new_listing first', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          items: [
            {
              address: SOL_ADDRESS,
              symbol: 'NEW',
              name: 'New Token',
              liquidity: 12345,
              liquidityAddedAt: '2026-07-22T00:00:00Z',
              source: 'raydium'
            }
          ]
        }
      })
    )
    const sources = newListingSources({ services: makeServices(), space: 'onchain', limit: 10 })

    const result = await resolveCapability({ capability: 'new', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/defi/v2/tokens/new_listing')
    expect(result.source).toBe('birdeye')
    expect(result.items[0]).toMatchObject({
      address: SOL_ADDRESS,
      listed_at: '2026-07-22T00:00:00Z',
      dex: 'raydium'
    })
  })

  it('new onchain falls back to GeckoTerminal new pools on 500', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === 'public-api.birdeye.so') {
        return errorResponse(500, 'Internal Server Error')
      }
      return jsonResponse(GT_POOLS_FIXTURE)
    })
    const sources = newListingSources({ services: makeServices(), space: 'onchain', limit: 10 })

    const result = await resolveCapability({ capability: 'new', sources })

    const secondUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(secondUrl.pathname).toBe('/api/v3/onchain/networks/new_pools')
    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'http_500' })
  })

  it('new coins calls CoinGecko coins/list/new', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse([{ id: 'newcoin', symbol: 'new', name: 'New Coin', activated_at: 1784560000 }])
      )
    const sources = newListingSources({ services: makeServices(), space: 'coins', limit: 10 })

    const result = await resolveCapability({ capability: 'new', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/v3/coins/list/new')
    expect(result.source).toBe('coingecko')
    expect(result.items[0]).toMatchObject({ id: 'newcoin', listed_at: 1784560000 })
  })

  // --- search ---------------------------------------------------------------

  it('search without chain calls CoinGecko search', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        coins: [{ id: 'render-token', symbol: 'render', name: 'Render', market_cap_rank: 40 }]
      })
    )
    const sources = searchSources({
      services: makeServices(),
      query: 'render',
      chain: null,
      limit: 20
    })

    const result = await resolveCapability({ capability: 'search', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/v3/search')
    expect(url.searchParams.get('query')).toBe('render')
    expect(result.source).toBe('coingecko')
    expect(result.results[0]).toMatchObject({ id: 'render-token', rank: 40 })
  })

  it('search with chain calls BirdEye first and falls back to GeckoTerminal on empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === 'public-api.birdeye.so') {
        return jsonResponse({ data: { items: [] } })
      }
      return jsonResponse(GT_POOLS_FIXTURE)
    })
    const sources = searchSources({
      services: makeServices(),
      query: 'sol',
      chain: SOLANA,
      limit: 20
    })

    const result = await resolveCapability({ capability: 'search', sources })

    const firstUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(firstUrl.pathname).toBe('/defi/v3/search')
    expect(firstUrl.searchParams.get('keyword')).toBe('sol')
    const secondUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(secondUrl.pathname).toBe('/api/v3/onchain/search/pools')
    expect(secondUrl.searchParams.get('network')).toBe('solana')
    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'empty' })
  })

  // --- holders --------------------------------------------------------------

  it('holders on solana calls BirdEye first', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: { items: [{ owner: 'Holder1', token_account: 'Acct1', ui_amount: 1234.5 }] }
      })
    )
    const sources = holdersSources({
      services: makeServices(),
      address: SOL_ADDRESS,
      chain: SOLANA,
      limit: 20
    })

    const result = await resolveCapability({ capability: 'holders', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/defi/v3/token/holder')
    expect(url.searchParams.get('address')).toBe(SOL_ADDRESS)
    expect(result.source).toBe('birdeye')
    expect(result.holders[0]).toMatchObject({ address: 'Holder1', amount: 1234.5 })
  })

  it('holders on solana falls back to GeckoTerminal top holders on 500', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === 'public-api.birdeye.so') {
        return errorResponse(500, 'Internal Server Error')
      }
      return jsonResponse(GT_TOP_HOLDERS_FIXTURE)
    })
    const sources = holdersSources({
      services: makeServices(),
      address: SOL_ADDRESS,
      chain: SOLANA,
      limit: 20
    })

    const result = await resolveCapability({ capability: 'holders', sources })

    const secondUrl = new URL(String(fetchSpy.mock.calls[1]?.[0]))
    expect(secondUrl.pathname).toBe(
      `/api/v3/onchain/networks/solana/tokens/${SOL_ADDRESS}/top_holders`
    )
    expect(result.source).toBe('geckoterminal')
    expect(result.attempted[0]).toMatchObject({ provider: 'birdeye', outcome: 'http_500' })
    expect(result.holders[0]).toMatchObject({ address: 'Holder1', pct_supply: 1.2 })
  })

  it('holders on EVM chains route only to GeckoTerminal', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(GT_TOP_HOLDERS_FIXTURE))
    const sources = holdersSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM,
      limit: 20
    })

    expect(sources.map((source) => source.provider)).toEqual(['geckoterminal'])

    const result = await resolveCapability({ capability: 'holders', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe(`/api/v3/onchain/networks/eth/tokens/${EVM_ADDRESS}/top_holders`)
    expect(result.source).toBe('geckoterminal')
  })
})
