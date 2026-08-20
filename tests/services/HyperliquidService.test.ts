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

describe('HyperliquidService candles', () => {
  function createCandleService(infoClient: Pick<InfoClient, 'candleSnapshot'>) {
    const params: HyperliquidServiceParams = {
      transaction: {} as HyperliquidServiceParams['transaction'],
      infoClient: infoClient as InfoClient
    }
    return new HyperliquidService(params)
  }

  const ROWS = [
    {
      t: 1786000000000,
      T: 1786000005999,
      s: 'BTC',
      i: '1m',
      o: '69000.5',
      c: '69100.25',
      h: '69150.75',
      l: '68950.0',
      v: '12.5',
      n: 33
    },
    {
      t: 1786000006000,
      T: 1786000011999,
      s: 'BTC',
      i: '1m',
      o: '69100.25',
      c: '69120.0',
      h: '69130.5',
      l: '69090.1',
      v: '8.25',
      n: 21
    }
  ]

  test('maps SDK rows to the shared candle contract on main', async () => {
    const candleSnapshot = vi.fn().mockResolvedValue(ROWS)
    const service = createCandleService({ candleSnapshot })

    const result = await service.getCandles({ coin: 'BTC', interval: '1m', dex: null })

    expect(candleSnapshot).toHaveBeenCalledTimes(1)
    const calledParams = candleSnapshot.mock.calls[0][0]
    expect(calledParams.coin).toBe('BTC')
    expect(calledParams.interval).toBe('1m')
    expect(typeof calledParams.startTime).toBe('number')
    expect(result).toEqual({
      source: 'hyperliquid',
      interval: '1m',
      coin: 'BTC',
      candles: [
        { t: 1786000000000, o: 69000.5, h: 69150.75, l: 68950.0, c: 69100.25, v: 12.5 },
        { t: 1786000006000, o: 69100.25, h: 69130.5, l: 69090.1, c: 69120.0, v: 8.25 }
      ]
    })
  })

  test('prefixes the coin with the dex for HIP-3 candles', async () => {
    const candleSnapshot = vi.fn().mockResolvedValue(ROWS)
    const service = createCandleService({ candleSnapshot })

    const result = await service.getCandles({ coin: 'SKHX', interval: '5m', dex: 'xyz' })

    expect(candleSnapshot).toHaveBeenCalledWith({
      coin: 'xyz:SKHX',
      interval: '5m',
      startTime: expect.any(Number)
    })
    expect(result.coin).toBe('xyz:SKHX')
    expect(result.interval).toBe('5m')
    expect(result.candles).toHaveLength(2)
  })

  test('forwards an explicit startTime window', async () => {
    const candleSnapshot = vi.fn().mockResolvedValue(ROWS)
    const service = createCandleService({ candleSnapshot })

    await service.getCandles({
      coin: 'ETH',
      interval: '5m',
      startTime: 1786000000000,
      endTime: 1786000012000,
      dex: null
    })

    expect(candleSnapshot).toHaveBeenCalledWith({
      coin: 'ETH',
      interval: '5m',
      startTime: 1786000000000,
      endTime: 1786000012000
    })
  })
})

describe('HyperliquidService entry-trigger gate enforcement', () => {
  async function gateService(): Promise<{ entryGate: import('@/services/EntryGateService').EntryGateService; stateDir: string }> {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { EntryGateService } = await import('@/services/EntryGateService')
    const stateDir = await mkdtemp(join(tmpdir(), 'entry-gate-hl-'))
    const entryGate = new EntryGateService({ stateDir })
    await entryGate.load()
    return { entryGate, stateDir }
  }

  test('refuses a position-increasing order pre-broadcast when the coin gate is not fired', async () => {
    const { entryGate } = await gateService()
    const metaAndAssetCtxs = vi.fn().mockResolvedValue([MAIN_META, [MAIN_CONTEXT]])
    const service = createService({ metaAndAssetCtxs, perpDexs: vi.fn() }) as unknown as {
      tradePerp: (params: unknown) => Promise<unknown>
    }
    // Rebuild with the gate wired in (createService does not inject one).
    const params: HyperliquidServiceParams = {
      transaction: {} as HyperliquidServiceParams['transaction'],
      infoClient: { metaAndAssetCtxs, perpDexs: vi.fn() } as unknown as InfoClient,
      entryGate
    }
    const gated = new HyperliquidService(params)

    await expect(
      gated.tradePerp({
        request: {
          from: '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57',
          coin: 'BTC',
          amount: new (await import('bignumber.js')).default(0.001),
          side: 'long',
          type: 'market',
          reduceOnly: false,
          walletId: 'w'
        },
        walletId: 'w'
      } as never)
    ).rejects.toThrow('entry trigger gate')
    expect(metaAndAssetCtxs).toHaveBeenCalled()
  })

  test('never blocks a reduce-only close (exits pass the gate)', async () => {
    const { entryGate } = await gateService()
    const metaAndAssetCtxs = vi.fn().mockResolvedValue([MAIN_META, [MAIN_CONTEXT]])
    const params: HyperliquidServiceParams = {
      transaction: {} as HyperliquidServiceParams['transaction'],
      infoClient: { metaAndAssetCtxs, perpDexs: vi.fn() } as unknown as InfoClient,
      entryGate
    }
    const gated = new HyperliquidService(params)

    // The close proceeds past the gate; it fails downstream at the exchange
    // layer (no wallet wired in the test), NOT with the gate refusal.
    const error = await gated
      .tradePerp({
        request: {
          from: '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57',
          coin: 'BTC',
          amount: new (await import('bignumber.js')).default(0.001),
          side: 'short',
          type: 'market',
          reduceOnly: true,
          walletId: 'w'
        },
        walletId: 'w'
      } as never)
      .then(() => null)
      .catch((e: unknown) => e)
    expect(error).not.toBeNull()
    expect(String(error)).not.toContain('entry trigger gate')
  })

  test('allows an opening order once the gate is trigger_fired within TTL', async () => {
    const { entryGate } = await gateService()
    await entryGate.fireTrigger('main', 'BTC', 60_000)
    const metaAndAssetCtxs = vi.fn().mockResolvedValue([MAIN_META, [MAIN_CONTEXT]])
    const params: HyperliquidServiceParams = {
      transaction: {} as HyperliquidServiceParams['transaction'],
      infoClient: { metaAndAssetCtxs, perpDexs: vi.fn() } as unknown as InfoClient,
      entryGate
    }
    const gated = new HyperliquidService(params)

    const error = await gated
      .tradePerp({
        request: {
          from: '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57',
          coin: 'BTC',
          amount: new (await import('bignumber.js')).default(0.001),
          side: 'long',
          type: 'market',
          reduceOnly: false,
          walletId: 'w'
        },
        walletId: 'w'
      } as never)
      .then(() => null)
      .catch((e: unknown) => e)
    expect(String(error)).not.toContain('entry trigger gate')
  })
})
