import { describe, expect, it } from 'vitest'

import type { NormalizedCandle } from '@/utils/Indicators'
import { atr, bollinger, ema, macd, rateOfChange, rsi, sma, swingLevels } from '@/utils/Indicators'

function candle(high: number, low: number, close: number, time = 0): NormalizedCandle {
  return { time, open: close, high, low, close, volume: null }
}

describe('sma / ema', () => {
  it('computes simple averages and returns null when short', () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3)
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4) // last 3
    expect(sma([1, 2], 3)).toBeNull()
  })

  it('seeds ema with the sma of the first period', () => {
    // period 3, k = 0.5: seed = (1+2+3)/3 = 2; then 4: 4*0.5+2*0.5 = 3; then 5: 5*0.5+3*0.5 = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toBe(4)
    expect(ema([1, 2], 3)).toBeNull()
  })
})

describe('rsi (Wilder)', () => {
  it('matches a hand-computed period-2 sequence', () => {
    // closes 1,2,3,2,3 -> changes +1,+1,-1,+1
    // seed: avgGain=1, avgLoss=0; after -1: g=(1+0)/2=.5 l=(0+1)/2=.5 -> RSI 50
    // after +1: g=(.5+1)/2=.75 l=.25 -> RS=3 -> RSI 75
    expect(rsi([1, 2, 3, 2, 3], 2)).toBeCloseTo(75, 10)
  })

  it('saturates at 100 for pure gains and 0 for pure losses', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3)).toBe(100)
    expect(rsi([6, 5, 4, 3, 2, 1], 3)).toBe(0)
  })

  it('returns 50 for a flat series and null when short', () => {
    expect(rsi([5, 5, 5, 5, 5], 3)).toBe(50)
    expect(rsi([1, 2, 3], 14)).toBeNull()
  })
})

describe('macd / bollinger', () => {
  it('is zero everywhere on a constant series', () => {
    const flat = Array.from({ length: 60 }, () => 100)
    const result = macd(flat, 12, 26, 9)
    expect(result?.macd).toBeCloseTo(0, 10)
    expect(result?.signal).toBeCloseTo(0, 10)
    expect(result?.histogram).toBeCloseTo(0, 10)

    const bands = bollinger(flat, 20, 2)
    expect(bands?.upper).toBe(100)
    expect(bands?.lower).toBe(100)
    expect(bands?.percentB).toBeNull() // zero-width bands guard
  })

  it('produces positive macd histogram after an uptrend impulse', () => {
    const series = [...Array.from({ length: 40 }, () => 100), ...[101, 103, 106, 110, 115]]
    const result = macd(series, 12, 26, 9)
    expect(result).not.toBeNull()
    expect(result && result.histogram > 0).toBe(true)
  })

  it('returns null when the series is too short', () => {
    expect(macd([1, 2, 3], 12, 26, 9)).toBeNull()
    expect(bollinger([1, 2, 3], 20, 2)).toBeNull()
  })
})

describe('atr (Wilder)', () => {
  it('matches a hand-computed period-2 sequence', () => {
    // candles: (H,L,C): (10,8,9), (11,9,10), (12,10,11), (13,11,12)
    // TRs from candle 2: max(2,|11-9|,|9-9|)=2; max(2,2,1... ) compute:
    //  c2: H-L=2, |H-pC|=|11-9|=2, |L-pC|=0 -> 2
    //  c3: 2, |12-10|=2, 0 -> 2
    //  c4: 2, 2, 0 -> 2
    // seed avg(2,2)=2; wilder: (2*1+2)/2=2 -> ATR 2
    const candles = [candle(10, 8, 9), candle(11, 9, 10), candle(12, 10, 11), candle(13, 11, 12)]
    expect(atr(candles, 2)).toBe(2)
    expect(atr(candles.slice(0, 2), 2)).toBeNull()
  })
})

describe('rateOfChange / swingLevels', () => {
  it('computes percent change over the period', () => {
    expect(rateOfChange([100, 105, 110], 2)).toBeCloseTo(10, 10)
    expect(rateOfChange([100], 2)).toBeNull()
    expect(rateOfChange([0, 5, 10], 2)).toBeNull() // divide-by-zero guard
  })

  it('finds swing extremes over the lookback window', () => {
    const candles = [candle(10, 5, 7), candle(20, 8, 15), candle(12, 3, 9)]
    expect(swingLevels(candles, 2)).toEqual({ swingHigh: 20, swingLow: 3 })
    expect(swingLevels([], 20)).toBeNull()
  })
})
