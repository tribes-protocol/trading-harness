import type { TaCandle } from '@/types/Ta'
import { isNullish } from '@/utils/Lang'

// Pure, sync indicator math over ascending candle series. Standard textbook
// formulas: Wilder RSI/ATR, EMA seeded with SMA, session-cumulative VWAP.

type TaMacdLines = {
  readonly macd: (number | null)[]
  readonly signal: (number | null)[]
  readonly hist: (number | null)[]
}

type TaBollingerLines = {
  readonly mid: (number | null)[]
  readonly upper: (number | null)[]
  readonly lower: (number | null)[]
}

type TaStochLines = {
  readonly k: (number | null)[]
  readonly d: (number | null)[]
}

type TaLevelRow = {
  readonly price: number
  readonly touches: number
}

type TaSwingLevels = {
  readonly support: TaLevelRow[]
  readonly resistance: TaLevelRow[]
}

type TaBacktestStats = {
  readonly trades: number
  readonly win_rate_pct: number | null
  readonly total_return_pct: number
  readonly buy_hold_return_pct: number
  readonly max_drawdown_pct: number
}

// A candle is a swing high/low when it is the strict extreme of the window
// spanning this many candles on each side.
const SWING_FRINGE = 2
// Swing levels within this percent of a cluster's mean count as one level.
const LEVEL_CLUSTER_TOLERANCE_PCT = 0.5

function nullSeries(length: number): (number | null)[] {
  return new Array<number | null>(length).fill(null)
}

export function sma(values: number[], length: number): (number | null)[] {
  const out = nullSeries(values.length)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0
    if (i >= length) {
      sum -= values[i - length] ?? 0
    }
    if (i >= length - 1) {
      out[i] = sum / length
    }
  }
  return out
}

// EMA seeded with the SMA of the first `length` values.
export function ema(values: number[], length: number): (number | null)[] {
  const out = nullSeries(values.length)
  if (values.length < length) {
    return out
  }
  let seed = 0
  for (let i = 0; i < length; i++) {
    seed += values[i] ?? 0
  }
  let previous = seed / length
  out[length - 1] = previous
  const smoothing = 2 / (length + 1)
  for (let i = length; i < values.length; i++) {
    previous = (values[i] ?? 0) * smoothing + previous * (1 - smoothing)
    out[i] = previous
  }
  return out
}

// Wilder RSI: initial averages are simple means of the first `length` changes,
// then Wilder smoothing avg = (prev * (length - 1) + current) / length.
export function rsi(values: number[], length: number): (number | null)[] {
  const out = nullSeries(values.length)
  if (values.length <= length) {
    return out
  }
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= length; i++) {
    const change = (values[i] ?? 0) - (values[i - 1] ?? 0)
    avgGain += Math.max(change, 0)
    avgLoss += Math.max(-change, 0)
  }
  avgGain /= length
  avgLoss /= length
  out[length] = rsiFromAverages(avgGain, avgLoss)
  for (let i = length + 1; i < values.length; i++) {
    const change = (values[i] ?? 0) - (values[i - 1] ?? 0)
    avgGain = (avgGain * (length - 1) + Math.max(change, 0)) / length
    avgLoss = (avgLoss * (length - 1) + Math.max(-change, 0)) / length
    out[i] = rsiFromAverages(avgGain, avgLoss)
  }
  return out
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) {
    return 100
  }
  return 100 - 100 / (1 + avgGain / avgLoss)
}

// MACD line = EMA(fast) - EMA(slow); signal = EMA(signalLength) of the MACD
// line, itself seeded with an SMA; hist = macd - signal.
export function macd(
  values: number[],
  fastLength: number,
  slowLength: number,
  signalLength: number
): TaMacdLines {
  const fastSeries = ema(values, fastLength)
  const slowSeries = ema(values, slowLength)
  const macdLine = nullSeries(values.length)
  for (let i = 0; i < values.length; i++) {
    const fastValue = fastSeries[i]
    const slowValue = slowSeries[i]
    if (!isNullish(fastValue) && !isNullish(slowValue)) {
      macdLine[i] = fastValue - slowValue
    }
  }
  const signalLine = nullSeries(values.length)
  const firstIndex = macdLine.findIndex((value) => !isNullish(value))
  if (firstIndex >= 0) {
    const compact = macdLine.slice(firstIndex).map((value) => value ?? 0)
    const compactSignal = ema(compact, signalLength)
    for (let i = 0; i < compactSignal.length; i++) {
      signalLine[firstIndex + i] = compactSignal[i] ?? null
    }
  }
  const hist = nullSeries(values.length)
  for (let i = 0; i < values.length; i++) {
    const macdValue = macdLine[i]
    const signalValue = signalLine[i]
    if (!isNullish(macdValue) && !isNullish(signalValue)) {
      hist[i] = macdValue - signalValue
    }
  }
  return { macd: macdLine, signal: signalLine, hist }
}

// Bollinger bands over the SMA with population standard deviation.
export function bollinger(values: number[], length: number, mult: number): TaBollingerLines {
  const mid = sma(values, length)
  const upper = nullSeries(values.length)
  const lower = nullSeries(values.length)
  for (let i = length - 1; i < values.length; i++) {
    const mean = mid[i]
    if (isNullish(mean)) {
      continue
    }
    let sumSquares = 0
    for (let j = i - length + 1; j <= i; j++) {
      const diff = (values[j] ?? 0) - mean
      sumSquares += diff * diff
    }
    const sd = Math.sqrt(sumSquares / length)
    upper[i] = mean + mult * sd
    lower[i] = mean - mult * sd
  }
  return { mid, upper, lower }
}

// Wilder ATR: TR = max(h-l, |h-prevC|, |l-prevC|); the first ATR is a simple
// mean of the first `length` TRs, then Wilder smoothing.
export function atr(candles: TaCandle[], length: number): (number | null)[] {
  const out = nullSeries(candles.length)
  if (candles.length < length) {
    return out
  }
  const trueRanges = candles.map((candle, i) => {
    const previous = candles[i - 1]
    if (isNullish(previous)) {
      return candle.h - candle.l
    }
    return Math.max(
      candle.h - candle.l,
      Math.abs(candle.h - previous.c),
      Math.abs(candle.l - previous.c)
    )
  })
  let value = 0
  for (let i = 0; i < length; i++) {
    value += trueRanges[i] ?? 0
  }
  value /= length
  out[length - 1] = value
  for (let i = length; i < candles.length; i++) {
    value = (value * (length - 1) + (trueRanges[i] ?? 0)) / length
    out[i] = value
  }
  return out
}

// Session-cumulative VWAP from the start of the series, typical price
// (h+l+c)/3 weighted by volume. Null until any volume has been seen.
export function vwap(candles: TaCandle[]): (number | null)[] {
  let cumulativePriceVolume = 0
  let cumulativeVolume = 0
  return candles.map((candle) => {
    const volume = candle.v ?? 0
    cumulativePriceVolume += ((candle.h + candle.l + candle.c) / 3) * volume
    cumulativeVolume += volume
    return cumulativeVolume > 0 ? cumulativePriceVolume / cumulativeVolume : null
  })
}

// Stochastic oscillator: %K over kLength, %D = SMA(dLength) of %K.
export function stochastic(candles: TaCandle[], kLength: number, dLength: number): TaStochLines {
  const k = nullSeries(candles.length)
  for (let i = kLength - 1; i < candles.length; i++) {
    let highest = -Infinity
    let lowest = Infinity
    for (let j = i - kLength + 1; j <= i; j++) {
      const candle = candles[j]
      if (isNullish(candle)) {
        continue
      }
      highest = Math.max(highest, candle.h)
      lowest = Math.min(lowest, candle.l)
    }
    const range = highest - lowest
    const close = candles[i]?.c ?? 0
    k[i] = range > 0 ? ((close - lowest) / range) * 100 : null
  }
  const d = nullSeries(candles.length)
  for (let i = dLength - 1; i < candles.length; i++) {
    const window = k.slice(i - dLength + 1, i + 1)
    if (window.some((value) => isNullish(value))) {
      continue
    }
    d[i] = window.reduce((sum: number, value) => sum + (value ?? 0), 0) / dLength
  }
  return { k, d }
}

// Support/resistance from swing lows/highs: strict extremes over a ±SWING_FRINGE
// window, clustered by proximity, ranked by touch count.
export function swingLevels(candles: TaCandle[], topN: number): TaSwingLevels {
  const swingHighs: number[] = []
  const swingLows: number[] = []
  for (let i = SWING_FRINGE; i < candles.length - SWING_FRINGE; i++) {
    const candle = candles[i]
    if (isNullish(candle)) {
      continue
    }
    let isHigh = true
    let isLow = true
    for (let j = i - SWING_FRINGE; j <= i + SWING_FRINGE; j++) {
      if (j === i) {
        continue
      }
      const other = candles[j]
      if (isNullish(other)) {
        continue
      }
      if (other.h >= candle.h) {
        isHigh = false
      }
      if (other.l <= candle.l) {
        isLow = false
      }
    }
    if (isHigh) {
      swingHighs.push(candle.h)
    }
    if (isLow) {
      swingLows.push(candle.l)
    }
  }
  return {
    support: clusterLevels(swingLows, topN),
    resistance: clusterLevels(swingHighs, topN)
  }
}

function clusterLevels(levels: number[], topN: number): TaLevelRow[] {
  const sorted = [...levels].sort((a, b) => a - b)
  const clusters: { sum: number; count: number }[] = []
  for (const level of sorted) {
    const current = clusters[clusters.length - 1]
    if (!isNullish(current)) {
      const mean = current.sum / current.count
      if (level - mean <= mean * (LEVEL_CLUSTER_TOLERANCE_PCT / 100)) {
        current.sum += level
        current.count += 1
        continue
      }
    }
    clusters.push({ sum: level, count: 1 })
  }
  return clusters
    .map((cluster) => ({ price: cluster.sum / cluster.count, touches: cluster.count }))
    .sort((a, b) => b.touches - a.touches || b.price - a.price)
    .slice(0, topN)
}

// Long-only bar-close: enter when the fast SMA crosses above the slow SMA,
// exit when it crosses back below.
export function backtestMaCross(
  closes: number[],
  fastLength: number,
  slowLength: number
): TaBacktestStats {
  const fast = sma(closes, fastLength)
  const slow = sma(closes, slowLength)
  const crossed = (i: number, direction: 1 | -1): boolean => {
    const fastValue = fast[i]
    const slowValue = slow[i]
    const previousFast = fast[i - 1]
    const previousSlow = slow[i - 1]
    if (
      isNullish(fastValue) ||
      isNullish(slowValue) ||
      isNullish(previousFast) ||
      isNullish(previousSlow)
    ) {
      return false
    }
    return direction === 1
      ? previousFast <= previousSlow && fastValue > slowValue
      : previousFast >= previousSlow && fastValue < slowValue
  }
  return runLongOnlyBacktest(
    closes,
    (i) => crossed(i, 1),
    (i) => crossed(i, -1)
  )
}

// Long-only bar-close mean reversion: enter when RSI drops below `low`, exit
// when RSI rises above `high`.
export function backtestRsiRevert(
  closes: number[],
  length: number,
  low: number,
  high: number
): TaBacktestStats {
  const series = rsi(closes, length)
  return runLongOnlyBacktest(
    closes,
    (i) => {
      const value = series[i]
      return !isNullish(value) && value < low
    },
    (i) => {
      const value = series[i]
      return !isNullish(value) && value > high
    }
  )
}

// Marks equity at every bar close; an open position at the end of the series
// is force-closed at the last close. max_drawdown_pct is a positive magnitude.
function runLongOnlyBacktest(
  closes: number[],
  shouldEnter: (i: number) => boolean,
  shouldExit: (i: number) => boolean
): TaBacktestStats {
  let inPosition = false
  let entryPrice = 0
  let equity = 1
  let peak = 1
  let maxDrawdownPct = 0
  let trades = 0
  let wins = 0
  let totalReturn = 1
  let previousClose = closes[0] ?? 0
  for (let i = 0; i < closes.length; i++) {
    const close = closes[i] ?? 0
    if (inPosition && i > 0 && previousClose > 0) {
      equity *= close / previousClose
    }
    if (inPosition && shouldExit(i)) {
      trades += 1
      totalReturn *= close / entryPrice
      if (close > entryPrice) {
        wins += 1
      }
      inPosition = false
    } else if (!inPosition && shouldEnter(i)) {
      inPosition = true
      entryPrice = close
    }
    peak = Math.max(peak, equity)
    maxDrawdownPct = Math.max(maxDrawdownPct, (1 - equity / peak) * 100)
    previousClose = close
  }
  if (inPosition && entryPrice > 0) {
    const lastClose = closes[closes.length - 1] ?? 0
    trades += 1
    totalReturn *= lastClose / entryPrice
    if (lastClose > entryPrice) {
      wins += 1
    }
  }
  const firstClose = closes[0] ?? 0
  const lastClose = closes[closes.length - 1] ?? 0
  return {
    trades,
    win_rate_pct: trades > 0 ? (wins / trades) * 100 : null,
    total_return_pct: (totalReturn - 1) * 100,
    buy_hold_return_pct: firstClose > 0 ? (lastClose / firstClose - 1) * 100 : 0,
    max_drawdown_pct: maxDrawdownPct
  }
}
