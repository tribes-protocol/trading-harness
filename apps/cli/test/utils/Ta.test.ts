import { describe, expect, it } from 'vitest'

import type { TaCandle } from '@/types/Ta'
import {
  atr,
  backtestMaCross,
  backtestRsiRevert,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  stochastic,
  swingLevels,
  vwap
} from '@/utils/Ta'

function candle(h: number, l: number, c: number, v: number | null = null): TaCandle {
  return { t: 0, o: c, h, l, c, v }
}

function candlesFromCloses(closes: number[]): TaCandle[] {
  return closes.map((close) => candle(close + 1, close - 1, close))
}

describe('Ta utils', () => {
  it('sma averages a sliding window and is null before warm-up', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })

  it('ema seeds with the SMA then applies exponential smoothing', () => {
    // seed at index 2 = SMA(2,4,6) = 4; k = 0.5: 8*.5+4*.5 = 6; 4*.5+6*.5 = 5
    expect(ema([2, 4, 6, 8, 4], 3)).toEqual([null, null, 4, 6, 5])
  })

  it('rsi follows Wilder smoothing (hand-computed on a 6-close series)', () => {
    const series = rsi([10, 11, 12, 11, 12, 13], 3)
    expect(series.slice(0, 3)).toEqual([null, null, null])
    // avgGain 2/3, avgLoss 1/3 -> RS 2 -> RSI 66.667
    expect(series[3]).toBeCloseTo(66.666667, 5)
    // avgGain 7/9, avgLoss 2/9 -> RS 3.5 -> RSI 77.778
    expect(series[4]).toBeCloseTo(77.777778, 5)
    // avgGain 23/27, avgLoss 4/27 -> RS 5.75 -> RSI 85.185
    expect(series[5]).toBeCloseTo(85.185185, 5)
  })

  it('rsi is 100 when there are no losses', () => {
    const series = rsi([1, 2, 3, 4, 5], 3)
    expect(series[4]).toBe(100)
  })

  it('macd subtracts the slow EMA from the fast EMA and signals over the macd line', () => {
    // emaFast(2): [_,3,5,7,9]; emaSlow(3): [_,_,4,6,8] -> macd [_,_,1,1,1]
    // signal(2) seeded with SMA of first two macd values -> [_,_,_,1,1]
    const lines = macd([2, 4, 6, 8, 10], 2, 3, 2)
    expect(lines.macd).toEqual([null, null, 1, 1, 1])
    expect(lines.signal).toEqual([null, null, null, 1, 1])
    expect(lines.hist).toEqual([null, null, null, 0, 0])
  })

  it('bollinger uses population standard deviation around the SMA', () => {
    const lines = bollinger([2, 4, 6], 3, 2)
    expect(lines.mid).toEqual([null, null, 4])
    // popSD = sqrt(8/3) = 1.632993
    expect(lines.upper[2]).toBeCloseTo(7.265986, 5)
    expect(lines.lower[2]).toBeCloseTo(0.734014, 5)
  })

  it('atr seeds with the mean true range then applies Wilder smoothing', () => {
    const candles = [
      candle(12, 10, 11), // TR 2
      candle(13, 11, 12), // TR 2
      candle(14, 11, 13), // TR 3
      candle(15, 13, 14), // TR 2
      candle(14, 12, 13) // TR 2
    ]
    const series = atr(candles, 3)
    expect(series.slice(0, 2)).toEqual([null, null])
    expect(series[2]).toBeCloseTo(7 / 3, 10)
    expect(series[3]).toBeCloseTo(20 / 9, 10)
    expect(series[4]).toBeCloseTo(58 / 27, 10)
  })

  it('vwap accumulates typical price by volume from the start of the series', () => {
    const series = vwap([candle(12, 10, 11, 100), candle(14, 12, 13, 300)])
    expect(series[0]).toBe(11)
    // (11*100 + 13*300) / 400
    expect(series[1]).toBeCloseTo(12.5, 10)
  })

  it('vwap is null while no volume has been seen', () => {
    expect(vwap([candle(12, 10, 11), candle(14, 12, 13)])).toEqual([null, null])
  })

  it('stochastic computes %K over the lookback and %D as its SMA', () => {
    const candles = [candle(10, 8, 9), candle(11, 9, 10), candle(12, 10, 11), candle(12, 9, 10)]
    const lines = stochastic(candles, 3, 2)
    // window 0..2: HH 12, LL 8, close 11 -> 75
    expect(lines.k[2]).toBeCloseTo(75, 10)
    // window 1..3: HH 12, LL 9, close 10 -> 33.333
    expect(lines.k[3]).toBeCloseTo(33.333333, 5)
    expect(lines.d[3]).toBeCloseTo(54.166667, 5)
  })

  it('swingLevels clusters repeated swing highs/lows and counts touches', () => {
    const closes = [
      10, 12, 15, 18, 20, 18, 15, 12, 10, 12, 15, 18, 20.05, 18, 15, 12, 10.02, 12, 15
    ]
    const { support, resistance } = swingLevels(candlesFromCloses(closes), 3)
    expect(resistance).toHaveLength(1)
    expect(resistance[0]?.touches).toBe(2)
    expect(resistance[0]?.price).toBeCloseTo(21.025, 10)
    expect(support).toHaveLength(1)
    expect(support[0]?.touches).toBe(2)
    expect(support[0]?.price).toBeCloseTo(9.01, 10)
  })

  it('backtestMaCross enters on the golden cross and exits on the death cross', () => {
    // sma2/sma3 cross up at i=4 (enter at 12) and cross down at i=7 (exit at 9)
    const stats = backtestMaCross([10, 9, 8, 9, 12, 13, 12, 9, 8], 2, 3)
    expect(stats.trades).toBe(1)
    expect(stats.win_rate_pct).toBe(0)
    expect(stats.total_return_pct).toBeCloseTo(-25, 10)
    expect(stats.buy_hold_return_pct).toBeCloseTo(-20, 10)
    // equity peaks at 13/12, troughs at 9/12 -> 30.769% drawdown
    expect(stats.max_drawdown_pct).toBeCloseTo(30.769231, 5)
  })

  it('backtestRsiRevert buys oversold and sells overbought', () => {
    // RSI(3): [_,_,_,0,33.33,55.56,70.37,80.25] -> enter at close 7, exit at close 10
    const stats = backtestRsiRevert([10, 9, 8, 7, 8, 9, 10, 11], 3, 35, 70)
    expect(stats.trades).toBe(1)
    expect(stats.win_rate_pct).toBe(100)
    expect(stats.total_return_pct).toBeCloseTo(42.857143, 5)
    expect(stats.buy_hold_return_pct).toBeCloseTo(10, 10)
    expect(stats.max_drawdown_pct).toBe(0)
  })

  it('backtestRsiRevert reports no trades when RSI never crosses the entry threshold', () => {
    const stats = backtestRsiRevert([10, 11, 12, 11, 12, 13], 3, 40, 70)
    expect(stats.trades).toBe(0)
    expect(stats.win_rate_pct).toBeNull()
    expect(stats.total_return_pct).toBe(0)
    expect(stats.buy_hold_return_pct).toBeCloseTo(30, 10)
    expect(stats.max_drawdown_pct).toBe(0)
  })
})
