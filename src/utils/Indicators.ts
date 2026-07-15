import type { UnifiedCandle } from '@/types/Candles'
import type { IndicatorSource } from '@/types/Indicators'

// Latest-value indicator math over UnifiedCandle[] (plain floats — indicators are
// inherently approximate, so BigNumber precision is unnecessary here). Wilder
// smoothing for RSI/ATR/ADX; standard EMA (SMA-seeded) for EMA/MACD.

export function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function priceOf(candle: UnifiedCandle, source: IndicatorSource): number {
  switch (source) {
    case 'close':
      return candle.close
    case 'open':
      return candle.open
    case 'high':
      return candle.high
    case 'low':
      return candle.low
    case 'hl2':
      return (candle.high + candle.low) / 2
    case 'hlc3':
      return (candle.high + candle.low + candle.close) / 3
    case 'ohlc4':
      return (candle.open + candle.high + candle.low + candle.close) / 4
  }
}

export function toPrices(candles: readonly UnifiedCandle[], source: IndicatorSource): number[] {
  return candles.map((candle) => priceOf(candle, source))
}

function sum(values: readonly number[]): number {
  let total = 0
  for (const value of values) {
    total += value
  }
  return total
}

export function sma(prices: readonly number[], period: number): number | null {
  if (prices.length < period) {
    return null
  }
  return sum(prices.slice(prices.length - period)) / period
}

// Full EMA series (SMA-seeded); series[j] aligns to price index (period - 1 + j).
export function emaSeries(prices: readonly number[], period: number): number[] {
  if (prices.length < period) {
    return []
  }
  let prev = sum(prices.slice(0, period)) / period
  const out: number[] = [prev]
  const k = 2 / (period + 1)
  for (let index = period; index < prices.length; index += 1) {
    const price = prices[index]
    if (price === undefined) {
      break
    }
    prev = price * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

export function ema(prices: readonly number[], period: number): number | null {
  const series = emaSeries(prices, period)
  return series.length > 0 ? (series[series.length - 1] ?? null) : null
}

export function rsi(prices: readonly number[], period: number): number | null {
  if (prices.length < period + 1) {
    return null
  }
  let avgGain = 0
  let avgLoss = 0
  for (let index = 1; index <= period; index += 1) {
    const current = prices[index]
    const previous = prices[index - 1]
    if (current === undefined || previous === undefined) {
      return null
    }
    const diff = current - previous
    avgGain += Math.max(diff, 0)
    avgLoss += Math.max(-diff, 0)
  }
  avgGain /= period
  avgLoss /= period
  for (let index = period + 1; index < prices.length; index += 1) {
    const current = prices[index]
    const previous = prices[index - 1]
    if (current === undefined || previous === undefined) {
      break
    }
    const diff = current - previous
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period
  }
  if (avgLoss === 0 && avgGain === 0) {
    return 50
  }
  if (avgLoss === 0) {
    return 100
  }
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

export function macd(
  prices: readonly number[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number
): { macd: number; signal: number; histogram: number } | null {
  if (prices.length < slowPeriod + signalPeriod) {
    return null
  }
  const fastEma = emaSeries(prices, fastPeriod)
  const slowEma = emaSeries(prices, slowPeriod)
  const macdLine: number[] = []
  for (let candleIndex = slowPeriod - 1; candleIndex < prices.length; candleIndex += 1) {
    const fast = fastEma[candleIndex - (fastPeriod - 1)]
    const slow = slowEma[candleIndex - (slowPeriod - 1)]
    if (fast === undefined || slow === undefined) {
      continue
    }
    macdLine.push(fast - slow)
  }
  const signalLine = emaSeries(macdLine, signalPeriod)
  const macdValue = macdLine[macdLine.length - 1]
  const signalValue = signalLine[signalLine.length - 1]
  if (macdValue === undefined || signalValue === undefined) {
    return null
  }
  return { macd: macdValue, signal: signalValue, histogram: macdValue - signalValue }
}

export function bollinger(
  prices: readonly number[],
  period: number,
  multiplier: number
): { basis: number; upper: number; lower: number } | null {
  if (prices.length < period) {
    return null
  }
  const window = prices.slice(prices.length - period)
  const basis = sum(window) / period
  const variance = sum(window.map((price) => (price - basis) ** 2)) / period
  const deviation = Math.sqrt(variance)
  return {
    basis,
    upper: basis + deviation * multiplier,
    lower: basis - deviation * multiplier
  }
}

function trueRanges(candles: readonly UnifiedCandle[]): number[] {
  const out: number[] = []
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]
    const previous = candles[index - 1]
    if (current === undefined || previous === undefined) {
      continue
    }
    out.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    )
  }
  return out
}

export function atr(candles: readonly UnifiedCandle[], period: number): number | null {
  const trs = trueRanges(candles)
  if (trs.length < period) {
    return null
  }
  let value = sum(trs.slice(0, period)) / period
  for (let index = period; index < trs.length; index += 1) {
    const tr = trs[index]
    if (tr === undefined) {
      break
    }
    value = (value * (period - 1) + tr) / period
  }
  return value
}

export function adx(
  candles: readonly UnifiedCandle[],
  period: number
): { adx: number; plusDi: number; minusDi: number } | null {
  if (candles.length < 2 * period) {
    return null
  }
  const trs: number[] = []
  const plusDms: number[] = []
  const minusDms: number[] = []
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]
    const previous = candles[index - 1]
    if (current === undefined || previous === undefined) {
      continue
    }
    const upMove = current.high - previous.high
    const downMove = previous.low - current.low
    plusDms.push(upMove > downMove && upMove > 0 ? upMove : 0)
    minusDms.push(downMove > upMove && downMove > 0 ? downMove : 0)
    trs.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    )
  }

  let smoothedTr = sum(trs.slice(0, period))
  let smoothedPlus = sum(plusDms.slice(0, period))
  let smoothedMinus = sum(minusDms.slice(0, period))
  const dxValues: number[] = []
  let lastPlusDi = 0
  let lastMinusDi = 0

  for (let index = period - 1; index < trs.length; index += 1) {
    if (index > period - 1) {
      const tr = trs[index]
      const plus = plusDms[index]
      const minus = minusDms[index]
      if (tr === undefined || plus === undefined || minus === undefined) {
        break
      }
      smoothedTr = smoothedTr - smoothedTr / period + tr
      smoothedPlus = smoothedPlus - smoothedPlus / period + plus
      smoothedMinus = smoothedMinus - smoothedMinus / period + minus
    }
    const plusDi = smoothedTr === 0 ? 0 : (smoothedPlus / smoothedTr) * 100
    const minusDi = smoothedTr === 0 ? 0 : (smoothedMinus / smoothedTr) * 100
    lastPlusDi = plusDi
    lastMinusDi = minusDi
    const denominator = plusDi + minusDi
    dxValues.push(denominator === 0 ? 0 : (Math.abs(plusDi - minusDi) / denominator) * 100)
  }

  if (dxValues.length < period) {
    return null
  }
  let adxValue = sum(dxValues.slice(0, period)) / period
  for (let index = period; index < dxValues.length; index += 1) {
    const dx = dxValues[index]
    if (dx === undefined) {
      break
    }
    adxValue = (adxValue * (period - 1) + dx) / period
  }
  return { adx: adxValue, plusDi: lastPlusDi, minusDi: lastMinusDi }
}

export function obv(candles: readonly UnifiedCandle[]): number | null {
  const first = candles[0]
  if (first === undefined) {
    return null
  }
  let value = first.volume
  for (let index = 1; index < candles.length; index += 1) {
    const current = candles[index]
    const previous = candles[index - 1]
    if (current === undefined || previous === undefined) {
      continue
    }
    if (current.close > previous.close) {
      value += current.volume
    } else if (current.close < previous.close) {
      value -= current.volume
    }
  }
  return value
}

export function roc(prices: readonly number[], period: number): number | null {
  if (prices.length < period + 1) {
    return null
  }
  const current = prices[prices.length - 1]
  const previous = prices[prices.length - 1 - period]
  if (current === undefined || previous === undefined || previous === 0) {
    return null
  }
  return ((current - previous) / previous) * 100
}

export function momentum(prices: readonly number[], period: number): number | null {
  if (prices.length < period + 1) {
    return null
  }
  const current = prices[prices.length - 1]
  const previous = prices[prices.length - 1 - period]
  if (current === undefined || previous === undefined) {
    return null
  }
  return current - previous
}
