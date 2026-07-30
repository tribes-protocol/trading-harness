import type { InfoClient } from '@nktkas/hyperliquid'
import { describe, expect, test, vi } from 'vitest'

import { HyperliquidService } from '@/services/HyperliquidService'
import {
  HyperliquidCancelOrderCommandOptionsSchema,
  HyperliquidCloidSchema,
  HyperliquidListAssetsCommandOptionsSchema,
  HyperliquidPerpTradeCommandOptionsSchema,
  type HyperliquidServiceParams,
  HyperliquidSpotCancelOrderCommandOptionsSchema
} from '@/types/Hyperliquid'

const MAIN_META = {
  universe: [
    {
      name: 'BTC',
      szDecimals: 5,
      maxLeverage: 40,
      marginTableId: 1
    }
  ],
  marginTables: [],
  collateralToken: 0
}

const XYZ_META = {
  universe: [
    {
      name: 'TSLA',
      szDecimals: 2,
      maxLeverage: 20,
      marginTableId: 1,
      isDelisted: true,
      onlyIsolated: true,
      marginMode: 'strictIsolated'
    }
  ],
  marginTables: [],
  collateralToken: 0
}

const MAIN_CONTEXT = {
  prevDayPx: '103000',
  dayNtlVlm: '2400000000',
  markPx: '104500',
  midPx: '104490',
  funding: '0.00001',
  openInterest: '50000',
  premium: '0.0001',
  oraclePx: '104480',
  impactPxs: ['104510', '104470'],
  dayBaseVlm: '23000'
}

const XYZ_CONTEXT = {
  prevDayPx: '248.1',
  dayNtlVlm: '16500000',
  markPx: '251.2',
  midPx: '251.15',
  funding: '0.00002',
  openInterest: '65000',
  premium: '0.0002',
  oraclePx: '251.1',
  impactPxs: ['251.5', '250.8'],
  dayBaseVlm: '65680'
}

function createService(infoClient: Pick<InfoClient, 'metaAndAssetCtxs' | 'perpDexs'>) {
  const params: HyperliquidServiceParams = {
    transaction: {} as HyperliquidServiceParams['transaction'],
    infoClient: infoClient as InfoClient
  }
  return new HyperliquidService(params)
}

describe('HyperliquidService asset inventory', () => {
  test('preserves raw perp context fields alongside the executable reference price', async () => {
    const metaAndAssetCtxs = vi.fn().mockResolvedValue([XYZ_META, [XYZ_CONTEXT]])
    const service = createService({
      metaAndAssetCtxs,
      perpDexs: vi.fn()
    })

    const result = await service.listPerpAssets('xyz')

    expect(metaAndAssetCtxs).toHaveBeenCalledWith({ dex: 'xyz' })
    expect(result).toEqual({
      market: 'perp',
      dex: 'xyz',
      assets: [
        {
          name: 'TSLA',
          szDecimals: 2,
          maxLeverage: 20,
          isDelisted: true,
          onlyIsolated: true,
          marginMode: 'strictIsolated',
          requiresIsolatedMargin: true,
          markPx: '251.2',
          referencePx: '251.15',
          midPx: '251.15',
          oraclePx: '251.1',
          prevDayPx: '248.1',
          dayNtlVlm: '16500000',
          dayBaseVlm: '65680',
          funding: '0.00002',
          openInterest: '65000',
          premium: '0.0002',
          impactPxs: ['251.5', '250.8']
        }
      ]
    })
  })

  test('sweeps main and every HIP-3 dex into one venue-qualified inventory', async () => {
    const metaAndAssetCtxs = vi.fn((params?: { dex?: string }) => {
      return Promise.resolve(
        params?.dex === 'xyz' ? [XYZ_META, [XYZ_CONTEXT]] : [MAIN_META, [MAIN_CONTEXT]]
      )
    })
    const perpDexs = vi.fn().mockResolvedValue([
      null,
      {
        name: 'xyz',
        fullName: 'xyz',
        deployer: '0x0000000000000000000000000000000000000000',
        oracleUpdater: null,
        feeRecipient: null,
        assetToStreamingOiCap: [],
        subDeployers: [],
        deployerFeeScale: '0',
        lastDeployerFeeScaleChangeTime: '2026-01-01T00:00:00',
        assetToFundingMultiplier: [],
        assetToFundingInterestRate: []
      }
    ])
    const service = createService({ metaAndAssetCtxs, perpDexs })

    const result = await service.listAllPerpAssets()

    expect(perpDexs).toHaveBeenCalledTimes(1)
    expect(metaAndAssetCtxs).toHaveBeenCalledWith({})
    expect(metaAndAssetCtxs).toHaveBeenCalledWith({ dex: 'xyz' })
    expect(result).toMatchObject({
      market: 'perp',
      dexes: [
        {
          dex: 'main',
          assets: [
            {
              name: 'BTC',
              dayNtlVlm: '2400000000',
              isDelisted: false,
              requiresIsolatedMargin: false
            }
          ]
        },
        { dex: 'xyz', assets: [{ name: 'TSLA', openInterest: '65000' }] }
      ]
    })
  })

  test('defaults asset discovery to one perp venue unless all venues are requested', () => {
    expect(HyperliquidListAssetsCommandOptionsSchema.parse({})).toEqual({
      market: 'perp',
      allDexes: false
    })
    expect(HyperliquidListAssetsCommandOptionsSchema.parse({ allDexes: true })).toMatchObject({
      market: 'perp',
      allDexes: true
    })
  })
})

describe('HyperliquidService order book', () => {
  function createBookService(infoClient: Pick<InfoClient, 'l2Book'>) {
    const params: HyperliquidServiceParams = {
      transaction: {} as HyperliquidServiceParams['transaction'],
      infoClient: infoClient as InfoClient
    }
    return new HyperliquidService(params)
  }

  const BOOK = {
    coin: 'BTC',
    time: 1784560000000,
    levels: [
      [
        { px: '104490', sz: '1.5', n: 12 },
        { px: '104480', sz: '3.1', n: 7 },
        { px: '104470', sz: '0.4', n: 2 }
      ],
      [
        { px: '104500', sz: '2.2', n: 9 },
        { px: '104510', sz: '5.0', n: 15 },
        { px: '104520', sz: '1.1', n: 3 }
      ]
    ]
  }

  test('trims both sides of the book to the requested depth', async () => {
    const l2Book = vi.fn().mockResolvedValue(BOOK)
    const service = createBookService({ l2Book })

    const result = await service.getOrderBook({ coin: 'BTC', depth: 2, dex: null })

    expect(l2Book).toHaveBeenCalledWith({ coin: 'BTC' })
    expect(result).toEqual({
      coin: 'BTC',
      bids: [
        { px: '104490', sz: '1.5', n: 12 },
        { px: '104480', sz: '3.1', n: 7 }
      ],
      asks: [
        { px: '104500', sz: '2.2', n: 9 },
        { px: '104510', sz: '5.0', n: 15 }
      ]
    })
  })

  test('prefixes the coin with the dex for HIP-3 books', async () => {
    const l2Book = vi.fn().mockResolvedValue({ ...BOOK, coin: 'xyz:TSLA' })
    const service = createBookService({ l2Book })

    const result = await service.getOrderBook({ coin: 'TSLA', depth: 10, dex: 'xyz' })

    expect(l2Book).toHaveBeenCalledWith({ coin: 'xyz:TSLA' })
    expect(result.coin).toBe('xyz:TSLA')
    expect(result.bids).toHaveLength(3)
    expect(result.asks).toHaveLength(3)
  })

  test('throws for an unknown market', async () => {
    const l2Book = vi.fn().mockResolvedValue(null)
    const service = createBookService({ l2Book })

    await expect(service.getOrderBook({ coin: 'NOPE', depth: 10, dex: null })).rejects.toThrow(
      'unknown coin NOPE on dex main'
    )
  })
})

const ADDRESS = '0x1111111111111111111111111111111111111111'
const CLOID = '0xaabbccddeeff00112233445566778899'

function createInfoService(infoClient: Partial<InfoClient>) {
  const params: HyperliquidServiceParams = {
    transaction: {} as HyperliquidServiceParams['transaction'],
    infoClient: infoClient as InfoClient
  }
  return new HyperliquidService(params)
}

describe('HyperliquidService order status', () => {
  const FOUND_ORDER = {
    status: 'order',
    order: {
      order: {
        coin: 'BTC',
        side: 'B',
        limitPx: '104500',
        sz: '0.5',
        oid: 12345,
        timestamp: 1784560000000,
        origSz: '1.0',
        triggerCondition: 'N/A',
        isTrigger: false,
        triggerPx: '0.0',
        children: [],
        isPositionTpsl: false,
        reduceOnly: false,
        orderType: 'Limit',
        tif: 'Gtc',
        cloid: CLOID
      },
      status: 'filled',
      statusTimestamp: 1784560001000
    }
  }

  test('normalizes a found order into snake_case key fields', async () => {
    const orderStatus = vi.fn().mockResolvedValue(FOUND_ORDER)
    const service = createInfoService({ orderStatus })

    const result = await service.getOrderStatus({ address: ADDRESS, oid: 12345, cloid: null })

    expect(orderStatus).toHaveBeenCalledWith({ user: ADDRESS, oid: 12345 })
    expect(result).toEqual({
      status: 'filled',
      status_timestamp: 1784560001000,
      order: {
        coin: 'BTC',
        side: 'buy',
        size: '0.5',
        orig_size: '1.0',
        limit_px: '104500',
        oid: 12345,
        cloid: CLOID,
        timestamp: 1784560000000
      }
    })
  })

  test('looks an order up by cloid when no oid is given', async () => {
    const orderStatus = vi.fn().mockResolvedValue(FOUND_ORDER)
    const service = createInfoService({ orderStatus })

    await service.getOrderStatus({ address: ADDRESS, oid: null, cloid: CLOID })

    expect(orderStatus).toHaveBeenCalledWith({ user: ADDRESS, oid: CLOID })
  })

  test('surfaces unknownOid as an explicit status, not an error', async () => {
    const orderStatus = vi.fn().mockResolvedValue({ status: 'unknownOid' })
    const service = createInfoService({ orderStatus })

    const result = await service.getOrderStatus({ address: ADDRESS, oid: 99, cloid: null })

    expect(result).toEqual({ status: 'unknownOid', status_timestamp: null, order: null })
  })
})

describe('HyperliquidService funding history', () => {
  test('prefixes builder-dex coins and maps rows to snake_case', async () => {
    const fundingHistory = vi
      .fn()
      .mockResolvedValue([
        { coin: 'xyz:TSLA', fundingRate: '0.0000125', premium: '0.0003', time: 1784560000000 }
      ])
    const service = createInfoService({ fundingHistory })

    const result = await service.getFundingHistory({
      coin: 'TSLA',
      startTime: 1784500000000,
      endTime: 1784560000000,
      dex: 'xyz'
    })

    expect(fundingHistory).toHaveBeenCalledWith({
      coin: 'xyz:TSLA',
      startTime: 1784500000000,
      endTime: 1784560000000
    })
    expect(result).toEqual([
      { coin: 'xyz:TSLA', funding_rate: '0.0000125', premium: '0.0003', time: 1784560000000 }
    ])
  })

  test('leaves main-dex coins unprefixed and endTime open-ended', async () => {
    const fundingHistory = vi
      .fn()
      .mockResolvedValue([{ coin: 'BTC', fundingRate: '0.00001', premium: '0.0001', time: 1 }])
    const service = createInfoService({ fundingHistory })

    await service.getFundingHistory({
      coin: 'BTC',
      startTime: 1784500000000,
      endTime: null,
      dex: null
    })

    expect(fundingHistory).toHaveBeenCalledWith({
      coin: 'BTC',
      startTime: 1784500000000,
      endTime: undefined
    })
  })
})

describe('HyperliquidService predicted fundings', () => {
  test('mirrors the venue tuples per coin, keeping empty venues as nulls', async () => {
    const predictedFundings = vi.fn().mockResolvedValue([
      [
        'BTC',
        [
          ['HlPerp', { fundingRate: '0.0000125', nextFundingTime: 1784563200000 }],
          [
            'BinPerp',
            { fundingRate: '0.00001', nextFundingTime: 1784563200000, fundingIntervalHours: 8 }
          ],
          ['BybitPerp', null]
        ]
      ]
    ])
    const service = createInfoService({ predictedFundings })

    const result = await service.getPredictedFundings()

    expect(predictedFundings).toHaveBeenCalledTimes(1)
    expect(result).toEqual([
      {
        coin: 'BTC',
        venues: [
          {
            venue: 'HlPerp',
            funding_rate: '0.0000125',
            next_funding_time: 1784563200000,
            funding_interval_hours: null
          },
          {
            venue: 'BinPerp',
            funding_rate: '0.00001',
            next_funding_time: 1784563200000,
            funding_interval_hours: 8
          },
          {
            venue: 'BybitPerp',
            funding_rate: null,
            next_funding_time: null,
            funding_interval_hours: null
          }
        ]
      }
    ])
  })
})

describe('HyperliquidService candles', () => {
  const CANDLE = {
    t: 1784560000000,
    T: 1784563600000,
    s: 'BTC',
    i: '1h',
    o: '104000',
    c: '104500',
    h: '104600',
    l: '103900',
    v: '1234.5',
    n: 42
  }

  test('maps the wire candle fields onto snake_case ohlcv rows', async () => {
    const candleSnapshot = vi.fn().mockResolvedValue([CANDLE])
    const service = createInfoService({ candleSnapshot })

    const result = await service.getCandles({
      coin: 'BTC',
      interval: '1h',
      startTime: 1784500000000,
      endTime: null,
      dex: null
    })

    expect(candleSnapshot).toHaveBeenCalledWith({
      coin: 'BTC',
      interval: '1h',
      startTime: 1784500000000,
      endTime: undefined
    })
    expect(result).toEqual([
      {
        open_time: 1784560000000,
        close_time: 1784563600000,
        open: '104000',
        high: '104600',
        low: '103900',
        close: '104500',
        volume: '1234.5',
        num_trades: 42
      }
    ])
  })

  test('prefixes builder-dex coins for candle snapshots', async () => {
    const candleSnapshot = vi.fn().mockResolvedValue([])
    const service = createInfoService({ candleSnapshot })

    await service.getCandles({
      coin: 'TSLA',
      interval: '1d',
      startTime: 1784500000000,
      endTime: 1784560000000,
      dex: 'xyz'
    })

    expect(candleSnapshot).toHaveBeenCalledWith({
      coin: 'xyz:TSLA',
      interval: '1d',
      startTime: 1784500000000,
      endTime: 1784560000000
    })
  })
})

describe('HyperliquidService portfolio', () => {
  test('flattens the period tuples into lossless snake_case buckets', async () => {
    const portfolio = vi.fn().mockResolvedValue([
      [
        'day',
        {
          accountValueHistory: [[1784560000000, '1000.5']],
          pnlHistory: [[1784560000000, '-12.5']],
          vlm: '5000'
        }
      ],
      [
        'perpAllTime',
        {
          accountValueHistory: [[1784560000000, '900']],
          pnlHistory: [[1784560000000, '25']],
          vlm: '4000'
        }
      ]
    ])
    const service = createInfoService({ portfolio })

    const result = await service.getPortfolio({ address: ADDRESS })

    expect(portfolio).toHaveBeenCalledWith({ user: ADDRESS })
    expect(result).toEqual({
      address: ADDRESS,
      periods: [
        {
          period: 'day',
          account_value_history: [[1784560000000, '1000.5']],
          pnl_history: [[1784560000000, '-12.5']],
          vlm: '5000'
        },
        {
          period: 'perpAllTime',
          account_value_history: [[1784560000000, '900']],
          pnl_history: [[1784560000000, '25']],
          vlm: '4000'
        }
      ]
    })
  })
})

describe('HyperliquidService ledger', () => {
  test('flattens the delta union into {time, hash, kind, ...snake_case fields}', async () => {
    const userNonFundingLedgerUpdates = vi.fn().mockResolvedValue([
      {
        time: 1784560000000,
        hash: '0xaaa',
        delta: { type: 'deposit', usdc: '100' }
      },
      {
        time: 1784560001000,
        hash: '0xbbb',
        delta: {
          type: 'spotTransfer',
          token: 'HYPE',
          amount: '3',
          usdcValue: '120',
          user: ADDRESS,
          destination: '0x2222222222222222222222222222222222222222',
          fee: '0.1',
          nativeTokenFee: '0',
          nonce: null,
          feeToken: 'USDC'
        }
      }
    ])
    const service = createInfoService({ userNonFundingLedgerUpdates })

    const result = await service.getLedgerUpdates({
      address: ADDRESS,
      startTime: null,
      endTime: null
    })

    expect(userNonFundingLedgerUpdates).toHaveBeenCalledWith({
      user: ADDRESS,
      startTime: undefined,
      endTime: undefined
    })
    expect(result).toEqual({
      address: ADDRESS,
      updates: [
        { time: 1784560000000, hash: '0xaaa', kind: 'deposit', usdc: '100' },
        {
          time: 1784560001000,
          hash: '0xbbb',
          kind: 'spotTransfer',
          token: 'HYPE',
          amount: '3',
          usdc_value: '120',
          user: ADDRESS,
          destination: '0x2222222222222222222222222222222222222222',
          fee: '0.1',
          native_token_fee: '0',
          nonce: null,
          fee_token: 'USDC'
        }
      ]
    })
  })
})

describe('HyperliquidService user fees', () => {
  test('keeps the fee-rate essentials and 14-day volume in snake_case', async () => {
    const userFees = vi.fn().mockResolvedValue({
      dailyUserVlm: [
        { date: '2026-07-29', userCross: '1000', userAdd: '500', exchange: '1000000000' }
      ],
      userCrossRate: '0.00035',
      userAddRate: '0.0001',
      userSpotCrossRate: '0.0007',
      userSpotAddRate: '0.0004',
      activeReferralDiscount: '0.04'
    })
    const service = createInfoService({ userFees })

    const result = await service.getUserFees({ address: ADDRESS })

    expect(userFees).toHaveBeenCalledWith({ user: ADDRESS })
    expect(result).toEqual({
      address: ADDRESS,
      user_cross_rate: '0.00035',
      user_add_rate: '0.0001',
      user_spot_cross_rate: '0.0007',
      user_spot_add_rate: '0.0004',
      active_referral_discount: '0.04',
      daily_user_vlm: [
        { date: '2026-07-29', user_cross: '1000', user_add: '500', exchange: '1000000000' }
      ]
    })
  })
})

describe('HyperliquidService rate limit', () => {
  test('reports cumulative volume and request budget in snake_case', async () => {
    const userRateLimit = vi.fn().mockResolvedValue({
      cumVlm: '1234.5',
      nRequestsUsed: 100,
      nRequestsCap: 11234,
      nRequestsSurplus: 10
    })
    const service = createInfoService({ userRateLimit })

    const result = await service.getRateLimit({ address: ADDRESS })

    expect(userRateLimit).toHaveBeenCalledWith({ user: ADDRESS })
    expect(result).toEqual({
      address: ADDRESS,
      cum_vlm: '1234.5',
      n_requests_used: 100,
      n_requests_cap: 11234,
      n_requests_surplus: 10
    })
  })
})

describe('Hyperliquid cloid validation', () => {
  test('normalizes a well-formed cloid to lowercase', () => {
    expect(HyperliquidCloidSchema.parse('0xAABBCCDDEEFF00112233445566778899')).toBe(CLOID)
  })

  test('rejects malformed cloids', () => {
    expect(HyperliquidCloidSchema.safeParse('0x123').success).toBe(false)
    expect(HyperliquidCloidSchema.safeParse('aabbccddeeff00112233445566778899').success).toBe(false)
    expect(HyperliquidCloidSchema.safeParse(`${CLOID}ff`).success).toBe(false)
  })

  test('rejects a trade-perp request carrying a malformed cloid', () => {
    const result = HyperliquidPerpTradeCommandOptionsSchema.safeParse({
      from: ADDRESS,
      coin: 'BTC',
      amount: '0.5',
      side: 'long',
      walletId: 'wallet-1',
      cloid: 'not-a-cloid'
    })
    expect(result.success).toBe(false)
  })

  test('accepts a trade-perp request with a valid cloid and normalizes it', () => {
    const result = HyperliquidPerpTradeCommandOptionsSchema.parse({
      from: ADDRESS,
      coin: 'BTC',
      amount: '0.5',
      side: 'long',
      walletId: 'wallet-1',
      cloid: '0xAABBCCDDEEFF00112233445566778899'
    })
    expect(result.cloid).toBe(CLOID)
  })

  test('cancel-order requires exactly one of orderId and cloid', () => {
    const base = { from: ADDRESS, coin: 'BTC', walletId: 'wallet-1' }
    expect(HyperliquidCancelOrderCommandOptionsSchema.safeParse(base).success).toBe(false)
    expect(
      HyperliquidCancelOrderCommandOptionsSchema.safeParse({
        ...base,
        orderId: 1,
        cloid: CLOID
      }).success
    ).toBe(false)
    expect(
      HyperliquidCancelOrderCommandOptionsSchema.safeParse({ ...base, orderId: 1 }).success
    ).toBe(true)
    expect(
      HyperliquidCancelOrderCommandOptionsSchema.safeParse({ ...base, cloid: CLOID }).success
    ).toBe(true)
  })

  test('cancel-order-spot requires exactly one of orderId and cloid', () => {
    const base = { from: ADDRESS, pair: 'HYPE/USDC', walletId: 'wallet-1' }
    expect(HyperliquidSpotCancelOrderCommandOptionsSchema.safeParse(base).success).toBe(false)
    expect(
      HyperliquidSpotCancelOrderCommandOptionsSchema.safeParse({
        ...base,
        orderId: 1,
        cloid: CLOID
      }).success
    ).toBe(false)
    expect(
      HyperliquidSpotCancelOrderCommandOptionsSchema.safeParse({ ...base, cloid: CLOID }).success
    ).toBe(true)
  })
})
