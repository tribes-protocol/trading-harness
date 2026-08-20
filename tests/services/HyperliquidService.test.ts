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
  function createBookService(infoClient: Pick<InfoClient, 'l2Book' | 'metaAndAssetCtxs'>) {
    const params: HyperliquidServiceParams = {
      transaction: {} as HyperliquidServiceParams['transaction'],
      infoClient: infoClient as InfoClient
    }
    return new HyperliquidService(params)
  }

  const BOOK_META = {
    universe: [
      { name: 'BTC', szDecimals: 5, maxLeverage: 40, marginTableId: 1 },
      { name: 'kPEPE', szDecimals: 0, maxLeverage: 10, marginTableId: 1 },
      { name: 'TSLA', szDecimals: 2, maxLeverage: 20, marginTableId: 1 }
    ],
    marginTables: [],
    collateralToken: 0
  }

  function bookMetaAndAssetCtxs(): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue([BOOK_META, []])
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
    const service = createBookService({ l2Book, metaAndAssetCtxs: bookMetaAndAssetCtxs() })

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
    const service = createBookService({ l2Book, metaAndAssetCtxs: bookMetaAndAssetCtxs() })

    const result = await service.getOrderBook({ coin: 'TSLA', depth: 10, dex: 'xyz' })

    expect(l2Book).toHaveBeenCalledWith({ coin: 'xyz:TSLA' })
    expect(result.coin).toBe('xyz:TSLA')
    expect(result.bids).toHaveLength(3)
    expect(result.asks).toHaveLength(3)
  })

  test('resolves a mixed-case venue symbol to its exact case (kPEPE not KPEPE)', async () => {
    const l2Book = vi.fn().mockResolvedValue({ ...BOOK, coin: 'kPEPE' })
    const service = createBookService({ l2Book, metaAndAssetCtxs: bookMetaAndAssetCtxs() })

    const result = await service.getOrderBook({ coin: 'KPEPE', depth: 2, dex: null })

    // l2Book is case-sensitive; the venue-exact kPEPE must be passed, not KPEPE.
    expect(l2Book).toHaveBeenCalledWith({ coin: 'kPEPE' })
    expect(result.coin).toBe('kPEPE')
  })

  test('passes a dex-prefixed coin through unchanged when the meta has no exact match', async () => {
    const l2Book = vi.fn().mockResolvedValue({ ...BOOK, coin: 'xyz:KORU' })
    const service = createBookService({ l2Book, metaAndAssetCtxs: bookMetaAndAssetCtxs() })

    const result = await service.getOrderBook({ coin: 'KORU', depth: 2, dex: 'xyz' })

    // KORU is not in BOOK_META; the raw prefixed coin passes through unchanged.
    expect(l2Book).toHaveBeenCalledWith({ coin: 'xyz:KORU' })
    expect(result.coin).toBe('xyz:KORU')
  })

  test('throws for an unknown market', async () => {
    const l2Book = vi.fn().mockResolvedValue(null)
    const service = createBookService({ l2Book, metaAndAssetCtxs: bookMetaAndAssetCtxs() })

    await expect(service.getOrderBook({ coin: 'NOPE', depth: 10, dex: null })).rejects.toThrow(
      'unknown perp coin NOPE on dex main'
    )
  })
})

describe('HyperliquidService candles', () => {
  function createCandleService(
    infoClient: Pick<InfoClient, 'candleSnapshot' | 'metaAndAssetCtxs'>
  ) {
    const params: HyperliquidServiceParams = {
      transaction: {} as HyperliquidServiceParams['transaction'],
      infoClient: infoClient as InfoClient
    }
    return new HyperliquidService(params)
  }

  const CANDLE_META = {
    universe: [
      { name: 'BTC', szDecimals: 5, maxLeverage: 40, marginTableId: 1 },
      { name: 'kPEPE', szDecimals: 0, maxLeverage: 10, marginTableId: 1 },
      { name: 'ETH', szDecimals: 1, maxLeverage: 25, marginTableId: 1 },
      { name: 'SKHX', szDecimals: 2, maxLeverage: 10, marginTableId: 1 }
    ],
    marginTables: [],
    collateralToken: 0
  }

  function candleMetaAndAssetCtxs(meta = CANDLE_META): ReturnType<typeof vi.fn> {
    return vi.fn().mockResolvedValue([meta, []])
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
      l: '69050.0',
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
    const service = createCandleService({
      candleSnapshot,
      metaAndAssetCtxs: candleMetaAndAssetCtxs()
    })

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
        { t: 1786000000000, o: 69000.5, h: 69150.75, l: 69050.0, c: 69100.25, v: 12.5 },
        { t: 1786000006000, o: 69100.25, h: 69130.5, l: 69090.1, c: 69120.0, v: 8.25 }
      ]
    })
  })

  test('prefixes the coin with the dex for HIP-3 candles', async () => {
    const candleSnapshot = vi.fn().mockResolvedValue(ROWS)
    const meta = {
      universe: [{ name: 'SKHX', szDecimals: 2, maxLeverage: 10, marginTableId: 1 }],
      marginTables: [],
      collateralToken: 0
    }
    const service = createCandleService({
      candleSnapshot,
      metaAndAssetCtxs: candleMetaAndAssetCtxs(meta)
    })

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
    const service = createCandleService({
      candleSnapshot,
      metaAndAssetCtxs: candleMetaAndAssetCtxs()
    })

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

  test('resolves a mixed-case venue symbol to its exact case (kPEPE not KPEPE)', async () => {
    const candleSnapshot = vi.fn().mockResolvedValue(ROWS)
    const service = createCandleService({
      candleSnapshot,
      metaAndAssetCtxs: candleMetaAndAssetCtxs()
    })

    // The CLI/schema uppercases the input to KPEPE; the service must round-trip
    // it to the venue-exact kPEPE so candleSnapshot (case-sensitive) succeeds.
    const result = await service.getCandles({ coin: 'KPEPE', interval: '1m', dex: null })

    expect(candleSnapshot).toHaveBeenCalledWith({
      coin: 'kPEPE',
      interval: '1m',
      startTime: expect.any(Number)
    })
    expect(result.coin).toBe('kPEPE')
  })

  test('fails fast for an unknown coin instead of an opaque 500', async () => {
    const candleSnapshot = vi.fn()
    const service = createCandleService({
      candleSnapshot,
      metaAndAssetCtxs: candleMetaAndAssetCtxs()
    })

    await expect(service.getCandles({ coin: 'NOPE', interval: '1m', dex: null })).rejects.toThrow(
      'unknown perp coin NOPE on dex main'
    )
    expect(candleSnapshot).not.toHaveBeenCalled()
  })

  // ORACLE regression (Dex's intel loop): xyz fresh-list coins (xyz:KORU /
  // xyz:PURRDAT) worked pre-fix and list-assets still shows them, but the
  // venue-exact resolution threw 'unknown perp coin xyz:KORU on dex xyz'
  // because the xyz meta universe may not return the exact bare symbol. A
  // dex-prefixed coin with no meta match must pass through UNCHANGED (pre-fix
  // behavior); only a bare coin with no match fails fast.
  test('passes a dex-prefixed coin through unchanged when the xyz meta has no exact match', async () => {
    const candleSnapshot = vi.fn().mockResolvedValue(ROWS)
    const service = createCandleService({
      candleSnapshot,
      metaAndAssetCtxs: candleMetaAndAssetCtxs()
    })

    const result = await service.getCandles({ coin: 'KORU', interval: '5m', dex: 'xyz' })

    expect(candleSnapshot).toHaveBeenCalledWith({
      coin: 'xyz:KORU',
      interval: '5m',
      startTime: expect.any(Number)
    })
    expect(result.coin).toBe('xyz:KORU')
  })

  test('still resolves a matched dex-prefixed coin to the venue-exact name', async () => {
    const candleSnapshot = vi.fn().mockResolvedValue(ROWS)
    const service = createCandleService({
      candleSnapshot,
      metaAndAssetCtxs: candleMetaAndAssetCtxs()
    })

    const result = await service.getCandles({ coin: 'SKHX', interval: '5m', dex: 'xyz' })

    // SKHX is in the xyz meta universe (CANDLE_META), so it resolves to the
    // venue-exact name — still prefixed with the dex.
    expect(candleSnapshot).toHaveBeenCalledWith({
      coin: 'xyz:SKHX',
      interval: '5m',
      startTime: expect.any(Number)
    })
    expect(result.coin).toBe('xyz:SKHX')
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

describe('HyperliquidService sizing-lock enforcement', () => {
  async function gateGatedService(): Promise<{ gated: HyperliquidService }> {
    const { mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { SizingLockService } = await import('@/services/SizingLockService')
    const { EntryGateService } = await import('@/services/EntryGateService')
    const stateDir = await mkdtemp(join(tmpdir(), 'sizing-lock-hl-'))
    const sizingLock = new SizingLockService({ stateDir })
    await sizingLock.load()
    const entryGate = new EntryGateService({ stateDir })
    await entryGate.load()
    const metaAndAssetCtxs = vi.fn().mockResolvedValue([MAIN_META, [MAIN_CONTEXT]])
    const params: HyperliquidServiceParams = {
      transaction: {} as HyperliquidServiceParams['transaction'],
      infoClient: { metaAndAssetCtxs, perpDexs: vi.fn() } as unknown as InfoClient,
      entryGate,
      sizingLock
    }
    return { gated: new HyperliquidService(params), entryGate, sizingLock }
  }

  test('refuses an off-lock entry size pre-broadcast (no operative manifest = refuse)', async () => {
    const { gated, entryGate } = await gateGatedService()
    // Gate must be fired so the SIZING check is what refuses (gate-first ordering).
    await entryGate.fireTrigger('main', 'BTC', 60_000)
    await expect(
      gated.tradePerp({
        request: {
          from: '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57',
          coin: 'BTC',
          amount: new (await import('bignumber.js')).default(0.02166),
          side: 'long',
          type: 'market',
          reduceOnly: false,
          walletId: 'w'
        },
        walletId: 'w'
      } as never)
    ).rejects.toThrow('sizing lock')
  })

  test('never blocks a reduce-only close (sizing lock applies to entries only)', async () => {
    const { gated } = await gateGatedService()
    const error = await gated
      .tradePerp({
        request: {
          from: '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57',
          coin: 'BTC',
          amount: new (await import('bignumber.js')).default(0.02166),
          side: 'short',
          type: 'market',
          reduceOnly: true,
          walletId: 'w'
        },
        walletId: 'w'
      } as never)
      .then(() => null)
      .catch((e: unknown) => e)
    expect(String(error)).not.toContain('sizing lock')
  })
})

describe('HyperliquidService account-read rate-limit resilience', () => {
  // The SDK surfaces an HTTP 429 as an HttpRequestError whose message is
  // '429 Too Many Requests'. classifyProviderAbort treats it as RECOVERABLE, so
  // the account-read wrapper backs off and retries instead of erroring out.
  function http429(message = '429 Too Many Requests'): Error {
    const err = new Error(message)
    err.name = 'HttpRequestError'
    return err
  }

  function balancesService(infoClient: Pick<InfoClient, 'clearinghouseState' | 'spotClearinghouseState'>) {
    const params: HyperliquidServiceParams = {
      transaction: {} as HyperliquidServiceParams['transaction'],
      infoClient: infoClient as InfoClient
    }
    return new HyperliquidService(params)
  }

  const PERP_STATE = {
    marginSummary: { accountValue: '10000', totalNtlPos: '5000', totalRawUsd: '10000', totalMarginUsed: '100' },
    crossMarginSummary: { accountValue: '10000', totalNtlPos: '5000', totalRawUsd: '10000', totalMarginUsed: '100' },
    withdrawable: '9000',
    assetPositions: [],
    crossMaintenanceMarginUsed: '0',
    maintenanceMarginUsage: '0'
  }
  const SPOT_STATE = { balances: [] }

  test('429 then 200: clearinghouseState backs off and succeeds after a rate-limit burst', async () => {
    const clearinghouseState = vi
      .fn()
      .mockRejectedValueOnce(http429())
      .mockResolvedValueOnce(PERP_STATE)
    const spotClearinghouseState = vi.fn().mockResolvedValue(SPOT_STATE)
    const service = balancesService({ clearinghouseState, spotClearinghouseState })

    const result = await service.listBalances({
      address: '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57',
      dex: null
    })

    expect(clearinghouseState).toHaveBeenCalledTimes(2) // 1st 429, 2nd success
    expect(result.perp.accountValue).toBe('10000')
    expect(result.spot).toEqual([])
  })
})
