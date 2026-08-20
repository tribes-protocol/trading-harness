import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import BigNumber from 'bignumber.js'
import { describe, expect, test, vi } from 'vitest'

import { HyperliquidService } from '@/services/HyperliquidService'
import {
  computeTrailingStop,
  TrailingStopService
} from '@/services/TrailingStopService'
import type { TrailingStopMonitorDeps, TrailingStopState } from '@/types/TrailingStop'

const ADDRESS = '0xbb64c24a6b2ee1185621490d2a1ae06522f15f57'
const WALLET_ID = 'ysb4boflk6hqpicpbb8gjgtu'

interface FakeHyperliquid {
  positions: Array<{
    dex: string
    coin: string
    side: 'long' | 'short'
    size: string
    entryPx: string
  }>
  closeCalls: Array<{ coin: string; amount: string; side: string; reduceOnly: boolean; dex: string | null }>
  listPositionsCalls: number
}

function fakeHyperliquid(): FakeHyperliquid {
  return {
    positions: [],
    closeCalls: [],
    listPositionsCalls: 0
  }
}

async function freshService(
  fake: FakeHyperliquid,
  options?: { mark?: string; sleep?: (ms: number) => Promise<void> }
): Promise<{
  service: TrailingStopService
  stateDir: string
  hyperliquid: HyperliquidService
}> {
  const stateDir = await mkdtemp(join(tmpdir(), 'trailing-stop-'))
  const hyperliquid = {
    listPositions: vi.fn(async () => {
      fake.listPositionsCalls += 1
      return {
        address: ADDRESS,
        positions: fake.positions.map((p) => ({
          dex: p.dex,
          coin: p.coin,
          side: p.side,
          size: p.size,
          signedSize: p.side === 'long' ? p.size : `-${p.size}`,
          entryPx: p.entryPx,
          positionValue: '0',
          unrealizedPnl: '0',
          returnOnEquity: '0',
          liquidationPx: null,
          leverage: 15,
          leverageType: 'cross',
          marginUsed: '0',
          maxLeverage: 40
        })),
        twapOrders: []
      }
    }),
    tradePerp: vi.fn(async (params: { request: { coin: string; amount: BigNumber; side: string; reduceOnly: boolean; dex: string | null } }) => {
      fake.closeCalls.push({
        coin: params.request.coin,
        amount: params.request.amount.toFixed(),
        side: params.request.side,
        reduceOnly: params.request.reduceOnly,
        dex: params.request.dex
      })
      // Simulate a full close: remove the position.
      const coin = params.request.coin.toUpperCase()
      fake.positions = fake.positions.filter((p) => p.coin.toUpperCase() !== coin)
      return {
        status: 'ok',
        response: {
          type: 'order',
          data: { statuses: [{ filled: { totalSz: '1', avgPx: '100', oid: 12345 } }] }
        }
      }
    })
  } as unknown as HyperliquidService

  const infoClient = {
    metaAndAssetCtxs: vi.fn(async () => {
      const mark = options?.mark ?? '70000'
      return [
        { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 40, marginTableId: 1 }], marginTables: [], collateralToken: 0 },
        [{ prevDayPx: '69000', dayNtlVlm: '0', markPx: mark, midPx: mark, funding: '0', openInterest: '0', premium: null, oraclePx: mark }]
      ]
    })
  } as unknown as Parameters<ConstructorParameters<typeof TrailingStopService>[0]>['infoClient']

  const service = new TrailingStopService({
    stateDir,
    hyperliquid,
    infoClient,
    spawnMonitor: () => null,
    now: () => 1_000_000,
    sleep: options?.sleep ?? (async () => undefined)
  })
  return { service, stateDir, hyperliquid }
}

describe('computeTrailingStop (pure trail math)', () => {
  test('long: stop = peak × (1 − pct)', () => {
    const stop = computeTrailingStop('long', new BigNumber(70000), { kind: 'pct', value: 0.25 })
    expect(stop.toNumber()).toBeCloseTo(70000 * 0.9975, 4)
  })

  test('short: stop = trough × (1 + pct)', () => {
    const stop = computeTrailingStop('short', new BigNumber(68000), { kind: 'pct', value: 0.25 })
    expect(stop.toNumber()).toBeCloseTo(68000 * 1.0025, 4)
  })

  test('px trail: long subtracts, short adds the absolute distance', () => {
    expect(computeTrailingStop('long', new BigNumber(70000), { kind: 'px', value: 120 }).toNumber()).toBe(69880)
    expect(computeTrailingStop('short', new BigNumber(68000), { kind: 'px', value: 120 }).toNumber()).toBe(68120)
  })
})

describe('TrailingStopService arm (no-lose guard + seeding)', () => {
  test('refuses to arm when the initial stop already crosses the current mark (long)', async () => {
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.02166', entryPx: '69178' }]
    const { service } = await freshService(fake, { mark: '69000' }) // mark below initial stop
    await expect(
      service.arm({
        coin: 'BTC',
        dex: 'main',
        from: ADDRESS,
        side: 'long',
        trail: { kind: 'pct', value: 0.25 },
        walletId: WALLET_ID
      })
    ).rejects.toThrow('no-lose arm guard')
  })

  test('refuses to arm when the initial stop already crosses the current mark (short)', async () => {
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'short', size: '0.02166', entryPx: '69178' }]
    const { service } = await freshService(fake, { mark: '71000' }) // mark above initial stop
    await expect(
      service.arm({
        coin: 'BTC',
        dex: 'main',
        from: ADDRESS,
        side: 'short',
        trail: { kind: 'pct', value: 0.25 },
        walletId: WALLET_ID
      })
    ).rejects.toThrow('no-lose arm guard')
  })

  test('arms a live long and records size/entry/stop', async () => {
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.02166', entryPx: '69178' }]
    const { service } = await freshService(fake, { mark: '70000' })
    const result = await service.arm({
      coin: 'BTC',
      dex: 'main',
      from: ADDRESS,
      side: 'long',
      trail: { kind: 'pct', value: 0.25 },
      walletId: WALLET_ID
    })
    expect(result.armed).toBe(true)
    expect(result.state.side).toBe('long')
    expect(result.state.sizeAtArm).toBe('0.02166')
    // Seeded peak = max(entry 69178, mark 70000) = 70000 → stop = 70000 × 0.9975
    expect(new BigNumber(result.state.stopPx).toNumber()).toBeCloseTo(70000 * 0.9975, 4)
  })
})

describe('TrailingStopService monitor loop (runMonitor)', () => {
  async function armedState(service: TrailingStopService, side: 'long' | 'short', entry: string, peak: string): Promise<TrailingStopState> {
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side, size: '0.02166', entryPx: entry }]
    const { service: svc } = await freshService(fake, { mark: peak })
    const result = await svc.arm({
      coin: 'BTC',
      dex: 'main',
      from: ADDRESS,
      side,
      trail: { kind: 'pct', value: 0.25 },
      walletId: WALLET_ID
    })
    return result.state
  }

  test('stop only tightens as a long rallies then pulls back', async () => {
    const fake = fakeHyperliquid()
    const { service } = await freshService(fake, { mark: '70000' })
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.02166', entryPx: '69178' }]
    const armed = await service.arm({
      coin: 'BTC',
      dex: 'main',
      from: ADDRESS,
      side: 'long',
      trail: { kind: 'pct', value: 0.25 },
      walletId: WALLET_ID
    })
    // Rallies: 70100 → 70300 → 70500 → pullback to 70400 (still ABOVE the
    // tightened stop, so no trigger). Capture the stop each tick and assert it
    // only ever tightens (moves up for a long).
    const marks = ['70100', '70300', '70500', '70400']
    const stopsSeen: number[] = []
    const deps: TrailingStopMonitorDeps = {
      getMark: vi.fn(async () => {
        const m = marks.shift()
        if (m === undefined) return null
        const current = (await service.list()).stops[0]
        if (current !== undefined) stopsSeen.push(Number(current.stopPx))
        return { mark: m, source: 'stream' }
      }),
      isCancelled: vi.fn(async () => marks.length === 0),
      exit: vi.fn(async () => ({ ok: true, message: 'no exit expected in this test' })),
      now: () => 1_000_000
    }
    const result = await service.runMonitor(armed.state.id, deps)
    expect(result.status).toBe('cancelled')
    const final = (await service.list()).stops[0]
    expect(final?.status).toBe('cancelled')
    expect(final?.exitFill).toBeNull()
    // Stop must be monotonically tightening (each >= the previous).
    for (let i = 1; i < stopsSeen.length; i += 1) {
      expect(stopsSeen[i]).toBeGreaterThanOrEqual(stopsSeen[i - 1] ?? 0)
    }
    expect(stopsSeen.length).toBeGreaterThanOrEqual(4)
  })

  test('trigger on a long when mark falls to the trailed stop → reduce-only exit', async () => {
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.02166', entryPx: '69178' }]
    const { service, hyperliquid } = await freshService(fake, { mark: '70000' })
    const armed = await service.arm({
      coin: 'BTC',
      dex: 'main',
      from: ADDRESS,
      side: 'long',
      trail: { kind: 'pct', value: 0.25 },
      walletId: WALLET_ID
    })
    const deps: TrailingStopMonitorDeps = {
      getMark: vi.fn(async () => ({ mark: '69800', source: 'poll' })), // below 70000×0.9975=69825
      isCancelled: vi.fn(async () => false),
      exit: vi.fn(async (s) => service.exitStop(s)),
      now: () => 1_000_000
    }
    const result = await service.runMonitor(armed.state.id, deps)
    expect(result.ok).toBe(true)
    expect(result.status).toBe('exited')
    // Exit clamped to the live position size, side opposite, reduce-only.
    expect(fake.closeCalls).toHaveLength(1)
    expect(fake.closeCalls[0]?.coin).toBe('BTC')
    expect(fake.closeCalls[0]?.amount).toBe('0.02166')
    expect(fake.closeCalls[0]?.side).toBe('short')
    expect(fake.closeCalls[0]?.reduceOnly).toBe(true)
  })

  test('exit-size clamp: never closes more than the current position, never flips', async () => {
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.02166', entryPx: '69178' }]
    const { service, hyperliquid } = await freshService(fake, { mark: '70000' })
    const armed = await service.arm({
      coin: 'BTC',
      dex: 'main',
      from: ADDRESS,
      side: 'long',
      trail: { kind: 'pct', value: 0.25 },
      walletId: WALLET_ID
    })
    // Position already reduced to 0.01 by another policy before the trigger.
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.01', entryPx: '69178' }]
    const deps: TrailingStopMonitorDeps = {
      getMark: vi.fn(async () => ({ mark: '69800', source: 'poll' })),
      isCancelled: vi.fn(async () => false),
      exit: vi.fn(async (s) => service.exitStop(s)),
      now: () => 1_000_000
    }
    await service.runMonitor(armed.state.id, deps)
    expect(fake.closeCalls).toHaveLength(1)
    expect(fake.closeCalls[0]?.amount).toBe('0.01') // live size, not the arm size
    expect(fake.closeCalls[0]?.reduceOnly).toBe(true)
  })

  test('already-closed position → no second exit (record and stop)', async () => {
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.02166', entryPx: '69178' }]
    const { service, hyperliquid } = await freshService(fake, { mark: '70000' })
    const armed = await service.arm({
      coin: 'BTC',
      dex: 'main',
      from: ADDRESS,
      side: 'long',
      trail: { kind: 'pct', value: 0.25 },
      walletId: WALLET_ID
    })
    // Position closed by other policy before trigger.
    fake.positions = []
    const deps: TrailingStopMonitorDeps = {
      getMark: vi.fn(async () => ({ mark: '69800', source: 'poll' })),
      isCancelled: vi.fn(async () => false),
      exit: vi.fn(async (s) => service.exitStop(s)),
      now: () => 1_000_000
    }
    const result = await service.runMonitor(armed.state.id, deps)
    expect(result.ok).toBe(true)
    expect(fake.closeCalls).toHaveLength(0) // no second exit
    const final = (await service.list()).stops[0]
    expect(final?.status).toBe('exited')
    expect(final?.exitFill?.message).toContain('already closed')
  })

  test('cancel-during-arm stops the loop without exiting', async () => {
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.02166', entryPx: '69178' }]
    const { service, hyperliquid } = await freshService(fake, { mark: '70000' })
    const armed = await service.arm({
      coin: 'BTC',
      dex: 'main',
      from: ADDRESS,
      side: 'long',
      trail: { kind: 'pct', value: 0.25 },
      walletId: WALLET_ID
    })
    const deps: TrailingStopMonitorDeps = {
      getMark: vi.fn(async () => ({ mark: '70100', source: 'stream' })),
      isCancelled: vi.fn(async () => true), // cancel signal on first tick
      exit: vi.fn(async () => ({ ok: true, message: 'should not exit' })),
      now: () => 1_000_000
    }
    const result = await service.runMonitor(armed.state.id, deps)
    expect(result.status).toBe('cancelled')
    expect(fake.closeCalls).toHaveLength(0)
    expect((await service.list()).stops[0]?.status).toBe('cancelled')
  })

  test('stream→poll fallback triggers via the poll path', async () => {
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.02166', entryPx: '69178' }]
    const { service, hyperliquid } = await freshService(fake, { mark: '70000' })
    const armed = await service.arm({
      coin: 'BTC',
      dex: 'main',
      from: ADDRESS,
      side: 'long',
      trail: { kind: 'pct', value: 0.25 },
      walletId: WALLET_ID
    })
    // First tick via stream, then the stream stalls and the poll path fires.
    let ticks = 0
    const deps: TrailingStopMonitorDeps = {
      getMark: vi.fn(async () => {
        ticks += 1
        if (ticks === 1) return { mark: '70100', source: 'stream' }
        return { mark: '69800', source: 'poll' } // below the trailed stop
      }),
      isCancelled: vi.fn(async () => false),
      exit: vi.fn(async (s) => service.exitStop(s)),
      now: () => 1_000_000
    }
    const result = await service.runMonitor(armed.state.id, deps)
    expect(result.status).toBe('exited')
    expect(fake.closeCalls).toHaveLength(1)
  })

  test('poll path paces at POLL_MS when the stream stalls (cadence guard)', async () => {
    const sleep = vi.fn(async () => undefined)
    const fake = fakeHyperliquid()
    fake.positions = [{ dex: 'main', coin: 'BTC', side: 'long', size: '0.02166', entryPx: '69178' }]
    const { service } = await freshService(fake, { mark: '70000', sleep })
    const armed = await service.arm({
      coin: 'BTC',
      dex: 'main',
      from: ADDRESS,
      side: 'long',
      trail: { kind: 'pct', value: 0.25 },
      walletId: WALLET_ID
    })
    // Drive POLL-mode ticks (source 'poll') so the cadence guard runs: after
    // each poll tick the loop must sleep POLL_MS. Cancel after the 2nd tick so
    // the test terminates.
    let ticks = 0
    const deps: TrailingStopMonitorDeps = {
      getMark: vi.fn(async () => {
        ticks += 1
        return { mark: '70100', source: 'poll' }
      }),
      isCancelled: vi.fn(async () => ticks >= 2),
      exit: vi.fn(async () => ({ ok: true, message: 'exit', orderId: null })),
      now: () => 1_000_000
    }
    await service.runMonitor(armed.state.id, deps)
    // The poll branch sleeps POLL_MS between iterations (cadence guard). The
    // test's sleep is injected, so assert it was called with the poll cadence.
    expect(sleep).toHaveBeenCalled()
    const firstArg = vi.mocked(sleep).mock.calls[0]?.[0]
    expect(firstArg).toBe(10000)
  })
})