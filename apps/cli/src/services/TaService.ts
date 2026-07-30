import { readFile } from 'node:fs/promises'

import type {
  TaBacktest,
  TaCandlesFile,
  TaIndicatorMap,
  TaIndicatorName,
  TaIndicators,
  TaLevels,
  TaStrategy,
  TaTrend
} from '@/types/Ta'
import {
  TaBacktestSchema,
  TaCandlesFileSchema,
  TaIndicatorsSchema,
  TaLevelsSchema
} from '@/types/Ta'
import { isNullish } from '@/utils/Lang'
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

type IndicatorsParams = {
  readonly candlesFile: string
  readonly set: TaIndicatorName[]
  readonly length: number | null
}

type LevelsParams = {
  readonly candlesFile: string
}

type BacktestParams = {
  readonly candlesFile: string
  readonly strategy: TaStrategy
  readonly fast: number
  readonly slow: number
  readonly rsiLow: number
  readonly rsiHigh: number
}

const MIN_CANDLES = 2
const SERIES_TAIL = 10
const DEFAULT_SMA_LENGTH = 20
const DEFAULT_EMA_LENGTH = 20
const DEFAULT_RSI_LENGTH = 14
const DEFAULT_ATR_LENGTH = 14
const DEFAULT_BB_LENGTH = 20
const BB_STDDEV_MULT = 2
const MACD_FAST_LENGTH = 12
const MACD_SLOW_LENGTH = 26
const MACD_SIGNAL_LENGTH = 9
const STOCH_K_LENGTH = 14
const STOCH_D_LENGTH = 3
const TREND_FAST_LENGTH = 20
const TREND_SLOW_LENGTH = 50
const TREND_FLAT_BAND_PCT = 0.1
const LEVELS_TOP_N = 3
const LEVELS_RANGE_PERIOD = 52
const BACKTEST_RSI_LENGTH = 14

export class TaService {
  async indicators(params: IndicatorsParams): Promise<TaIndicators> {
    const file = await this.loadCandles(params.candlesFile)
    const closes = file.candles.map((candle) => candle.c)
    const requested = new Set(params.set)
    const indicators: TaIndicatorMap = {}
    if (requested.has('sma')) {
      const length = params.length ?? DEFAULT_SMA_LENGTH
      indicators.sma = { length, ...this.shapeTail(sma(closes, length)) }
    }
    if (requested.has('ema')) {
      const length = params.length ?? DEFAULT_EMA_LENGTH
      indicators.ema = { length, ...this.shapeTail(ema(closes, length)) }
    }
    if (requested.has('rsi')) {
      const length = params.length ?? DEFAULT_RSI_LENGTH
      indicators.rsi = { length, ...this.shapeTail(rsi(closes, length)) }
    }
    if (requested.has('macd')) {
      const lines = macd(closes, MACD_FAST_LENGTH, MACD_SLOW_LENGTH, MACD_SIGNAL_LENGTH)
      const points = lines.macd.map((macdValue, i) => ({
        macd: macdValue,
        signal: lines.signal[i] ?? null,
        hist: lines.hist[i] ?? null
      }))
      indicators.macd = this.shapeTail(points)
    }
    if (requested.has('bb')) {
      const length = params.length ?? DEFAULT_BB_LENGTH
      const lines = bollinger(closes, length, BB_STDDEV_MULT)
      const points = lines.mid.map((mid, i) => ({
        mid,
        upper: lines.upper[i] ?? null,
        lower: lines.lower[i] ?? null
      }))
      indicators.bb = { length, ...this.shapeTail(points) }
    }
    if (requested.has('atr')) {
      const length = params.length ?? DEFAULT_ATR_LENGTH
      indicators.atr = { length, ...this.shapeTail(atr(file.candles, length)) }
    }
    if (requested.has('vwap')) {
      indicators.vwap = this.shapeTail(vwap(file.candles))
    }
    if (requested.has('stoch')) {
      const lines = stochastic(file.candles, STOCH_K_LENGTH, STOCH_D_LENGTH)
      const points = lines.k.map((k, i) => ({ k, d: lines.d[i] ?? null }))
      indicators.stoch = this.shapeTail(points)
    }
    return TaIndicatorsSchema.parse({
      source: file.source,
      candles: file.candles.length,
      last_close: closes[closes.length - 1],
      trend: this.computeTrend(closes),
      indicators
    })
  }

  async levels(params: LevelsParams): Promise<TaLevels> {
    const file = await this.loadCandles(params.candlesFile)
    const clusters = swingLevels(file.candles, LEVELS_TOP_N)
    const rangeWindow = file.candles.slice(-LEVELS_RANGE_PERIOD)
    return TaLevelsSchema.parse({
      source: file.source,
      candles: file.candles.length,
      last_close: file.candles[file.candles.length - 1]?.c,
      support: clusters.support,
      resistance: clusters.resistance,
      high_52: Math.max(...rangeWindow.map((candle) => candle.h)),
      low_52: Math.min(...rangeWindow.map((candle) => candle.l))
    })
  }

  async backtest(params: BacktestParams): Promise<TaBacktest> {
    const file = await this.loadCandles(params.candlesFile)
    if (params.strategy === 'ma-cross' && params.fast >= params.slow) {
      throw new Error('ma-cross needs --fast smaller than --slow')
    }
    if (params.strategy === 'rsi-revert' && params.rsiLow >= params.rsiHigh) {
      throw new Error('rsi-revert needs --rsi-low smaller than --rsi-high')
    }
    const closes = file.candles.map((candle) => candle.c)
    const stats =
      params.strategy === 'ma-cross'
        ? backtestMaCross(closes, params.fast, params.slow)
        : backtestRsiRevert(closes, BACKTEST_RSI_LENGTH, params.rsiLow, params.rsiHigh)
    return TaBacktestSchema.parse({
      source: file.source,
      strategy: params.strategy,
      candles: file.candles.length,
      ...stats
    })
  }

  private async loadCandles(path: string): Promise<TaCandlesFile> {
    let rawText: string
    try {
      rawText = await readFile(path, 'utf8')
    } catch {
      throw new Error(
        `Cannot read candles file at ${path} — pass a file written by an ohlcv/candles command via --out`
      )
    }
    let rawJson: unknown
    try {
      rawJson = JSON.parse(rawText)
    } catch {
      throw new Error(`${path} is not valid JSON — expected {source, candles: [{t,o,h,l,c,v}]}`)
    }
    const file = TaCandlesFileSchema.parse(rawJson)
    if (file.candles.length < MIN_CANDLES) {
      throw new Error(
        `${path} has ${file.candles.length} candle(s) — need at least ${MIN_CANDLES} to compute anything`
      )
    }
    // All math assumes ascending time; the contract is ascending but sorting is
    // cheap insurance against a provider slice writing newest-first.
    return { source: file.source, candles: [...file.candles].sort((a, b) => a.t - b.t) }
  }

  private computeTrend(closes: number[]): TaTrend {
    const fastSeries = ema(closes, TREND_FAST_LENGTH)
    const slowSeries = ema(closes, TREND_SLOW_LENGTH)
    const fastLatest = fastSeries[fastSeries.length - 1]
    const slowLatest = slowSeries[slowSeries.length - 1]
    const lastClose = closes[closes.length - 1]
    if (isNullish(fastLatest) || isNullish(slowLatest) || isNullish(lastClose) || lastClose <= 0) {
      return 'flat'
    }
    const spreadPct = ((fastLatest - slowLatest) / lastClose) * 100
    if (spreadPct > TREND_FLAT_BAND_PCT) {
      return 'up'
    }
    if (spreadPct < -TREND_FLAT_BAND_PCT) {
      return 'down'
    }
    return 'flat'
  }

  private shapeTail<T>(series: T[]): {
    latest: T | undefined
    previous: T | undefined
    series: T[]
  } {
    return {
      latest: series[series.length - 1],
      previous: series[series.length - 2],
      series: series.slice(-SERIES_TAIL)
    }
  }
}
