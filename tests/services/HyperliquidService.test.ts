import type { InfoClient } from '@nktkas/hyperliquid'
import { describe, expect, test, vi } from 'vitest'

import { HyperliquidService } from '@/services/HyperliquidService'
import {
  HyperliquidListAssetsCommandOptionsSchema,
  type HyperliquidServiceParams
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
