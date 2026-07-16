import type { CoinGeckoService } from '@/services/CoinGeckoService'
import type { MarketstackService } from '@/services/MarketstackService'
import type { TokenDataService } from '@/services/TokenDataService'
import type { ChainId } from '@/types/ChainId'
import type { CoinGeckoOhlcDays } from '@/types/CoinGecko'
import type { TechnicalsResult } from '@/types/Technicals'
import { TechnicalsResultSchema } from '@/types/Technicals'
import type { BirdeyeOhlcvInterval } from '@/types/TokenData'
import type { NormalizedCandle } from '@/utils/Indicators'
import { atr, bollinger, ema, macd, rateOfChange, rsi, sma, swingLevels } from '@/utils/Indicators'
import { compactMap, isNullish } from '@/utils/Lang'

// Indicator computation over any of the harness's candle sources: CoinGecko
// (coins by id), Marketstack (equities by ticker, daily EOD), Birdeye
// (on-chain tokens by address). Candles are normalized to ascending time
// before computing — Marketstack returns newest-first and Birdeye order is
// provider-defined, so ordering here is load-bearing.

const MIN_CANDLES = 30

type TechnicalsServiceParams = {
  readonly coinGecko: CoinGeckoService
  readonly marketstack: MarketstackService
  readonly tokenData: TokenDataService
}

export class TechnicalsService {
  private readonly coinGecko: CoinGeckoService
  private readonly marketstack: MarketstackService
  private readonly tokenData: TokenDataService

  constructor(params: TechnicalsServiceParams) {
    this.coinGecko = params.coinGecko
    this.marketstack = params.marketstack
    this.tokenData = params.tokenData
  }

  async computeForCoin(params: {
    readonly id: string
    readonly days: CoinGeckoOhlcDays
    readonly vs: string
  }): Promise<TechnicalsResult> {
    const series = await this.coinGecko.getOhlc({ id: params.id, days: params.days, vs: params.vs })
    const candles = normalize(
      series.candles.map((c) => ({
        time: Math.floor(c.time_ms / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: null
      }))
    )
    return buildResult({
      instrument: params.id,
      candleSource: 'coingecko',
      interval: `auto (${params.days}d window)`,
      candles
    })
  }

  async computeForSymbol(params: {
    readonly symbol: string
    readonly limit: number
  }): Promise<TechnicalsResult> {
    const series = await this.marketstack.getEodBars({
      symbols: params.symbol,
      dateFrom: null,
      dateTo: null,
      limit: params.limit,
      latest: false
    })
    const candles = normalize(
      compactMap(
        series.bars.map((bar) => {
          if (
            isNullish(bar.open) ||
            isNullish(bar.high) ||
            isNullish(bar.low) ||
            isNullish(bar.close)
          ) {
            return null
          }
          return {
            time: Math.floor(Date.parse(bar.date) / 1000),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume ?? null
          }
        })
      )
    )
    return buildResult({
      instrument: params.symbol.toUpperCase(),
      candleSource: 'marketstack',
      interval: '1D (EOD)',
      candles
    })
  }

  async computeForToken(params: {
    readonly address: string
    readonly chainId: ChainId
    readonly interval: BirdeyeOhlcvInterval
    readonly limit: number
  }): Promise<TechnicalsResult> {
    const series = await this.tokenData.getOhlcv({
      address: params.address,
      chainId: params.chainId,
      interval: params.interval,
      limit: params.limit,
      timeFrom: null,
      timeTo: null
    })
    const candles = normalize(
      series.candles.map((c) => ({
        time: c.time_s,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume ?? null
      }))
    )
    return buildResult({
      instrument: `${params.address} (${String(params.chainId)})`,
      candleSource: 'birdeye',
      interval: params.interval,
      candles
    })
  }
}

function normalize(candles: NormalizedCandle[]): NormalizedCandle[] {
  return [...candles].sort((a, b) => a.time - b.time)
}

function buildResult(params: {
  readonly instrument: string
  readonly candleSource: 'coingecko' | 'marketstack' | 'birdeye'
  readonly interval: string
  readonly candles: NormalizedCandle[]
}): TechnicalsResult {
  const { candles } = params
  if (candles.length < MIN_CANDLES) {
    throw new Error(
      `only ${candles.length} usable candles for ${params.instrument}; ` +
        `need at least ${MIN_CANDLES} for a meaningful indicator pack`
    )
  }
  const closes = candles.map((c) => c.close)
  const first = candles[0]
  const last = candles[candles.length - 1]
  if (isNullish(first) || isNullish(last)) {
    throw new Error('empty candle series after normalization')
  }

  const rsi14 = rsi(closes, 14)
  const macdResult = macd(closes, 12, 26, 9)
  const bands = bollinger(closes, 20, 2)
  const atr14 = atr(candles, 14)
  const sma50 = sma(closes, 50)
  const sma200 = sma(closes, 200)
  const swings = swingLevels(candles, 20)

  const trendParts: string[] = []
  if (!isNullish(sma50)) {
    trendParts.push(`${last.close >= sma50 ? 'above' : 'below'} sma50`)
  }
  if (!isNullish(sma200)) {
    trendParts.push(`${last.close >= sma200 ? 'above' : 'below'} sma200`)
  }
  const momentumParts: string[] = []
  if (!isNullish(rsi14)) {
    const zone = rsi14 >= 70 ? 'overbought' : rsi14 <= 30 ? 'oversold' : 'neutral'
    momentumParts.push(`rsi ${round2(rsi14)} (${zone})`)
  }
  if (!isNullish(macdResult)) {
    momentumParts.push(`macd histogram ${macdResult.histogram >= 0 ? 'positive' : 'negative'}`)
  }
  const atrPct = isNullish(atr14) || last.close === 0 ? null : (atr14 / last.close) * 100

  return TechnicalsResultSchema.parse({
    source: 'technicals',
    instrument: params.instrument,
    candle_source: params.candleSource,
    interval: params.interval,
    candles_used: candles.length,
    first_candle_time: new Date(first.time * 1000).toISOString(),
    last_candle_time: new Date(last.time * 1000).toISOString(),
    last_close: last.close,
    indicators: {
      sma20: sma(closes, 20),
      sma50,
      sma200,
      ema12: ema(closes, 12),
      ema26: ema(closes, 26),
      rsi14,
      macd: macdResult?.macd ?? null,
      macd_signal: macdResult?.signal ?? null,
      macd_histogram: macdResult?.histogram ?? null,
      bollinger_upper: bands?.upper ?? null,
      bollinger_middle: bands?.middle ?? null,
      bollinger_lower: bands?.lower ?? null,
      bollinger_percent_b: bands?.percentB ?? null,
      atr14,
      atr14_pct_of_price: isNullish(atrPct) ? null : round2(atrPct),
      roc10_pct: rateOfChange(closes, 10)
    },
    swing_high_20: swings?.swingHigh ?? null,
    swing_low_20: swings?.swingLow ?? null,
    read: {
      trend: trendParts.join(', ') || 'insufficient history for trend read',
      momentum: momentumParts.join(', ') || 'insufficient history for momentum read',
      volatility: isNullish(atrPct)
        ? 'insufficient history for atr'
        : `atr14 ${round2(atrPct)}% of price`
    }
  })
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
