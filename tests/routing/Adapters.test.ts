import type { InfoClient } from '@nktkas/hyperliquid'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type AssetServices,
  candlesContractSources,
  candlesPoolSources,
  candlesTickerSources,
  holdersSources,
  newListingSources,
  priceContractSources,
  pricePerpSources,
  priceTickerSources,
  profileContractSources,
  profileTickerSources,
  searchSources,
  trendingSources
} from '@/routing/Adapters'
import { resolveChain } from '@/routing/Chains'
import { resolveCapability } from '@/routing/Router'
import { BirdeyeService } from '@/services/BirdeyeService'
import { HyperliquidService } from '@/services/HyperliquidService'
import { StocksService } from '@/services/StocksService'
import type { TransactionService } from '@/services/TransactionService'
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

const BIRDEYE_OHLCV_FIXTURE = {
  data: {
    items: [
      { unix_time: 1784556400, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 },
      { unix_time: 1784560000, o: 1.5, h: 2.5, l: 1, c: 2, v: 150 }
    ]
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

  it('price×contract surfaces an unsupported address as final empty', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ success: true, data: {} }))
    const sources = priceContractSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM
    })

    await expect(resolveCapability({ capability: 'price', sources })).rejects.toThrow(/empty/)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
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

  it('candles×pool calls BirdEye pair OHLCV', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(BIRDEYE_OHLCV_FIXTURE))
    const sources = candlesPoolSources({
      services: makeServices(),
      pool: POOL_ADDRESS,
      chain: SOLANA,
      timeframe: '1d'
    })

    const result = await resolveCapability({ capability: 'candles', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.origin).toBe('https://public-api.birdeye.so')
    expect(url.pathname).toBe('/defi/v3/ohlcv/pair')
    expect(url.searchParams.get('address')).toBe(POOL_ADDRESS)
    expect(url.searchParams.get('type')).toBe('1D')
    expect(result.source).toBe('birdeye')
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

  // --- profile × ticker ----------------------------------------------------

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

  it('trending calls BirdEye token_trending first', async () => {
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
    const sources = trendingSources({ services: makeServices(), chain: null, limit: 10 })

    const result = await resolveCapability({ capability: 'trending', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/defi/token_trending')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'solana' })
    expect(result.source).toBe('birdeye')
    expect(result.space).toBe('onchain')
    expect(result.items[0]).toMatchObject({ address: SOL_ADDRESS, symbol: 'SOL', rank: 1 })
  })

  // --- new listings ---------------------------------------------------------

  it('new calls BirdEye new_listing first', async () => {
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
    const sources = newListingSources({ services: makeServices(), limit: 10 })

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

  // --- search ---------------------------------------------------------------

  it('search with chain calls BirdEye search', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          items: [
            {
              type: 'token',
              result: [
                {
                  address: SOL_ADDRESS,
                  symbol: 'SOL',
                  name: 'Wrapped SOL',
                  network: 'solana',
                  price: 171.4,
                  liquidity: 45000000,
                  volume_24h_usd: 2100000000
                }
              ]
            }
          ]
        }
      })
    )
    const sources = searchSources({
      services: makeServices(),
      query: 'sol',
      chain: SOLANA,
      limit: 20
    })

    const result = await resolveCapability({ capability: 'search', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/defi/v3/search')
    expect(url.searchParams.get('keyword')).toBe('sol')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'solana' })
    expect(result.source).toBe('birdeye')
    expect(result.results[0]).toMatchObject({ address: SOL_ADDRESS, symbol: 'SOL' })
  })

  // --- holders --------------------------------------------------------------

  it('holders calls BirdEye first', async () => {
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
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'solana' })
    expect(result.source).toBe('birdeye')
    expect(result.holders[0]).toMatchObject({ address: 'Holder1', amount: 1234.5 })
  })

  it('holders routes EVM chains to BirdEye with the EVM x-chain header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: { items: [{ owner: 'Holder1', token_account: 'Acct1', ui_amount: 99 }] }
      })
    )
    const sources = holdersSources({
      services: makeServices(),
      address: EVM_ADDRESS,
      chain: ETHEREUM,
      limit: 20
    })

    expect(sources.map((source) => source.provider)).toEqual(['birdeye'])

    const result = await resolveCapability({ capability: 'holders', sources })

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/defi/v3/token/holder')
    expect(fetchSpy.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-chain': 'ethereum' })
    expect(result.source).toBe('birdeye')
  })
})
