import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TaService } from '@/services/TaService'
import type { TaCandle } from '@/types/Ta'
import { ensureJsonTreeString } from '@/utils/Lang'

let fixtureDir = ''

function risingCandles(count: number): TaCandle[] {
  return Array.from({ length: count }, (_unused, i) => {
    const close = 10 + i * 0.5
    return {
      t: 1700000000000 + i * 60000,
      o: close - 0.5,
      h: close + 1,
      l: close - 1,
      c: close,
      v: 100
    }
  })
}

function candlesFromCloses(closes: number[]): TaCandle[] {
  return closes.map((close, i) => ({
    t: 1700000000000 + i * 60000,
    o: close,
    h: close + 1,
    l: close - 1,
    c: close,
    v: 100
  }))
}

async function writeCandlesFile(name: string, payload: unknown): Promise<string> {
  const path = join(fixtureDir, name)
  await writeFile(path, ensureJsonTreeString(payload), 'utf8')
  return path
}

describe('TaService', () => {
  beforeEach(async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), 'ta-service-'))
  })

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true })
  })

  it('computes only the requested indicators with the length override', async () => {
    const path = await writeCandlesFile('rising.json', {
      source: 'birdeye',
      candles: risingCandles(30)
    })

    const result = await new TaService().indicators({
      candlesFile: path,
      set: ['sma', 'rsi'],
      length: 3
    })

    expect(result.source).toBe('birdeye')
    expect(result.candles).toBe(30)
    expect(result.last_close).toBe(24.5)
    // 30 candles cannot seed the ema50 leg, so the trend collapses to flat
    expect(result.trend).toBe('flat')
    expect(result.indicators.sma?.length).toBe(3)
    expect(result.indicators.sma?.latest).toBeCloseTo(24, 10)
    expect(result.indicators.sma?.previous).toBeCloseTo(23.5, 10)
    expect(result.indicators.sma?.series).toHaveLength(10)
    // monotonic rise -> Wilder RSI pins at 100
    expect(result.indicators.rsi?.latest).toBe(100)
    expect(result.indicators.ema).toBeUndefined()
    expect(result.indicators.macd).toBeUndefined()
    expect(result.indicators.vwap).toBeUndefined()
  })

  it('reports an up trend once ema20 clears ema50 on a long rising series', async () => {
    const path = await writeCandlesFile('rising-long.json', {
      source: 'coingecko',
      candles: risingCandles(60)
    })

    const result = await new TaService().indicators({
      candlesFile: path,
      set: ['ema'],
      length: null
    })

    expect(result.trend).toBe('up')
    expect(result.indicators.ema?.length).toBe(20)
  })

  it('finds clustered support/resistance and the 52-period range', async () => {
    const closes = [
      10, 12, 15, 18, 20, 18, 15, 12, 10, 12, 15, 18, 20.05, 18, 15, 12, 10.02, 12, 15
    ]
    const path = await writeCandlesFile('zigzag.json', {
      source: 'nansen',
      candles: candlesFromCloses(closes)
    })

    const result = await new TaService().levels({ candlesFile: path })

    expect(result.source).toBe('nansen')
    expect(result.candles).toBe(19)
    expect(result.last_close).toBe(15)
    expect(result.resistance[0]?.touches).toBe(2)
    expect(result.resistance[0]?.price).toBeCloseTo(21.025, 10)
    expect(result.support[0]?.touches).toBe(2)
    expect(result.support[0]?.price).toBeCloseTo(9.01, 10)
    expect(result.high_52).toBeCloseTo(21.05, 10)
    expect(result.low_52).toBe(9)
  })

  it('backtests ma-cross with golden values on a hand-computed series', async () => {
    const path = await writeCandlesFile('cross.json', {
      source: 'marketstack',
      candles: candlesFromCloses([10, 9, 8, 9, 12, 13, 12, 9, 8])
    })

    const result = await new TaService().backtest({
      candlesFile: path,
      strategy: 'ma-cross',
      fast: 2,
      slow: 3,
      rsiLow: 30,
      rsiHigh: 70
    })

    expect(result.source).toBe('marketstack')
    expect(result.strategy).toBe('ma-cross')
    expect(result.candles).toBe(9)
    expect(result.trades).toBe(1)
    expect(result.win_rate_pct).toBe(0)
    expect(result.total_return_pct).toBeCloseTo(-25, 10)
    expect(result.buy_hold_return_pct).toBeCloseTo(-20, 10)
    expect(result.max_drawdown_pct).toBeCloseTo(30.769231, 5)
  })

  it('backtests rsi-revert with no trades when the series is shorter than the RSI warm-up', async () => {
    const path = await writeCandlesFile('short.json', {
      source: 'birdeye',
      candles: candlesFromCloses([10, 9, 8, 7, 8, 9, 10, 11])
    })

    const result = await new TaService().backtest({
      candlesFile: path,
      strategy: 'rsi-revert',
      fast: 20,
      slow: 50,
      rsiLow: 30,
      rsiHigh: 70
    })

    expect(result.strategy).toBe('rsi-revert')
    expect(result.trades).toBe(0)
    expect(result.win_rate_pct).toBeNull()
    expect(result.total_return_pct).toBe(0)
    expect(result.buy_hold_return_pct).toBeCloseTo(10, 10)
  })

  it('rejects a candles file with fewer than 2 candles', async () => {
    const path = await writeCandlesFile('single.json', {
      source: 'birdeye',
      candles: risingCandles(1)
    })

    await expect(new TaService().levels({ candlesFile: path })).rejects.toThrow('need at least 2')
  })

  it('rejects a missing candles file with a clear error', async () => {
    await expect(
      new TaService().indicators({
        candlesFile: join(fixtureDir, 'missing.json'),
        set: ['sma'],
        length: null
      })
    ).rejects.toThrow('Cannot read candles file')
  })

  it('rejects a file that is not candle-contract JSON', async () => {
    const path = join(fixtureDir, 'garbage.json')
    await writeFile(path, 'not json at all', 'utf8')

    await expect(new TaService().levels({ candlesFile: path })).rejects.toThrow('not valid JSON')
  })

  it('rejects ma-cross when fast is not smaller than slow', async () => {
    const path = await writeCandlesFile('cross-invalid.json', {
      source: 'birdeye',
      candles: candlesFromCloses([10, 11, 12, 13])
    })

    await expect(
      new TaService().backtest({
        candlesFile: path,
        strategy: 'ma-cross',
        fast: 50,
        slow: 20,
        rsiLow: 30,
        rsiHigh: 70
      })
    ).rejects.toThrow('--fast smaller than --slow')
  })

  it('sorts descending-time candles before computing', async () => {
    const ascending = candlesFromCloses([1, 2, 3, 4, 5])
    const path = await writeCandlesFile('reversed.json', {
      source: 'birdeye',
      candles: [...ascending].reverse()
    })

    const result = await new TaService().indicators({
      candlesFile: path,
      set: ['sma'],
      length: 3
    })

    expect(result.last_close).toBe(5)
    expect(result.indicators.sma?.latest).toBe(4)
  })
})
