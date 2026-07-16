import { isNullish } from '@/utils/Lang'

// Pure indicator math over normalized candles (ascending time order). This is
// the computation layer behind `tribes-cli technicals` — deterministic, no I/O.
// Conventions: Wilder smoothing for RSI/ATR; EMA seeded with the SMA of the
// first period; population standard deviation for Bollinger bands. Every
// function returns null when the series is too short instead of guessing.

export type NormalizedCandle = {
  readonly time: number // unix seconds
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume: number | null
}

export function sma(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) {
    return null
  }
  const window = values.slice(-period)
  return window.reduce((sum, v) => sum + v, 0) / period
}

export function ema(values: readonly number[], period: number): number | null {
  if (period <= 0 || values.length < period) {
    return null
  }
  const k = 2 / (period + 1)
  let current = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period
  for (const value of values.slice(period)) {
    current = value * k + current * (1 - k)
  }
  return current
}

// Wilder RSI: seed averages over the first `period` changes, then smooth.
export function rsi(closes: readonly number[], period: number): number | null {
  if (period <= 0 || closes.length < period + 1) {
    return null
  }
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i += 1) {
    const change = ensureAt(closes, i) - ensureAt(closes, i - 1)
    if (change > 0) {
      avgGain += change
    } else {
      avgLoss -= change
    }
  }
  avgGain /= period
  avgLoss /= period
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = ensureAt(closes, i) - ensureAt(closes, i - 1)
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period
  }
  if (avgLoss === 0) {
    return avgGain === 0 ? 50 : 100
  }
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export type MacdResult = {
  readonly macd: number
  readonly signal: number
  readonly histogram: number
}

export function macd(
  closes: readonly number[],
  fast: number,
  slow: number,
  signalPeriod: number
): MacdResult | null {
  if (closes.length < slow + signalPeriod) {
    return null
  }
  // Build the full MACD-line series so the signal EMA has real history.
  const macdSeries: number[] = []
  for (let end = slow; end <= closes.length; end += 1) {
    const window = closes.slice(0, end)
    const fastEma = ema(window, fast)
    const slowEma = ema(window, slow)
    if (isNullish(fastEma) || isNullish(slowEma)) {
      return null
    }
    macdSeries.push(fastEma - slowEma)
  }
  const signal = ema(macdSeries, signalPeriod)
  const lastMacd = macdSeries[macdSeries.length - 1]
  if (isNullish(signal) || isNullish(lastMacd)) {
    return null
  }
  return { macd: lastMacd, signal, histogram: lastMacd - signal }
}

export type BollingerResult = {
  readonly upper: number
  readonly middle: number
  readonly lower: number
  readonly percentB: number | null
}

export function bollinger(
  closes: readonly number[],
  period: number,
  width: number
): BollingerResult | null {
  const middle = sma(closes, period)
  if (isNullish(middle) || closes.length < period) {
    return null
  }
  const window = closes.slice(-period)
  const variance = window.reduce((sum, v) => sum + (v - middle) ** 2, 0) / period
  const stdev = Math.sqrt(variance)
  const upper = middle + width * stdev
  const lower = middle - width * stdev
  const lastClose = ensureAt(closes, closes.length - 1)
  const percentB = upper === lower ? null : (lastClose - lower) / (upper - lower)
  return { upper, middle, lower, percentB }
}

// Wilder ATR over true ranges.
export function atr(candles: readonly NormalizedCandle[], period: number): number | null {
  if (period <= 0 || candles.length < period + 1) {
    return null
  }
  const trueRanges: number[] = []
  for (let i = 1; i < candles.length; i += 1) {
    const current = ensureAt(candles, i)
    const previous = ensureAt(candles, i - 1)
    trueRanges.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    )
  }
  let value = trueRanges.slice(0, period).reduce((sum, v) => sum + v, 0) / period
  for (const tr of trueRanges.slice(period)) {
    value = (value * (period - 1) + tr) / period
  }
  return value
}

export function rateOfChange(closes: readonly number[], period: number): number | null {
  if (period <= 0 || closes.length < period + 1) {
    return null
  }
  const past = ensureAt(closes, closes.length - 1 - period)
  if (past === 0) {
    return null
  }
  return (ensureAt(closes, closes.length - 1) / past - 1) * 100
}

export type SwingLevels = {
  readonly swingHigh: number
  readonly swingLow: number
}

export function swingLevels(
  candles: readonly NormalizedCandle[],
  lookback: number
): SwingLevels | null {
  if (candles.length === 0) {
    return null
  }
  const window = candles.slice(-lookback)
  return {
    swingHigh: Math.max(...window.map((c) => c.high)),
    swingLow: Math.min(...window.map((c) => c.low))
  }
}

function ensureAt<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (isNullish(value)) {
    throw new Error(`indicator series index ${index} out of range`)
  }
  return value
}
