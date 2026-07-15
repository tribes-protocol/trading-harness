import { CandlesService } from '@/services/CandlesService'
import type { CandlesServiceParams, UnifiedCandle } from '@/types/Candles'
import {
  type IndicatorName,
  IndicatorNameSchema,
  type IndicatorsRequest,
  type IndicatorsResult,
  type IndicatorValues
} from '@/types/Indicators'
import {
  adx,
  atr,
  bollinger,
  ema,
  macd,
  momentum,
  obv,
  roc,
  round,
  rsi,
  sma,
  toPrices
} from '@/utils/Indicators'
import { isNullish } from '@/utils/Lang'

const ALL_INDICATORS: IndicatorName[] = [
  'rsi',
  'macd',
  'sma',
  'ema',
  'bbands',
  'adx',
  'atr',
  'obv',
  'roc',
  'mom'
]

export class IndicatorsService {
  private readonly candles: CandlesService

  constructor(params: CandlesServiceParams) {
    this.candles = new CandlesService(params)
  }

  // Fetch OHLCV once (reusing the candles service), then compute the selected
  // indicators' latest values.
  async compute(request: IndicatorsRequest): Promise<IndicatorsResult> {
    const candles = await this.candles.getOhlcv(request)
    const prices = toPrices(candles, request.source)
    const selected = parseIndicators(request.indicators)
    const last = candles[candles.length - 1]
    return {
      asset: request.asset,
      kind: request.kind,
      timeframe: request.timeframe,
      source: request.source,
      candles: candles.length,
      as_of: isNullish(last) ? null : last.timestamp,
      price: isNullish(last) ? null : round(last.close, 6),
      indicators: computeIndicators(candles, prices, selected)
    }
  }
}

function parseIndicators(raw: string | null | undefined): Set<IndicatorName> {
  if (isNullish(raw) || raw.trim() === '') {
    return new Set(ALL_INDICATORS)
  }
  const selected = new Set<IndicatorName>()
  for (const token of raw.split(',')) {
    const parsed = IndicatorNameSchema.safeParse(token.trim().toLowerCase())
    if (parsed.success) {
      selected.add(parsed.data)
    }
  }
  return selected.size > 0 ? selected : new Set(ALL_INDICATORS)
}

function computeIndicators(
  candles: readonly UnifiedCandle[],
  prices: readonly number[],
  selected: Set<IndicatorName>
): IndicatorValues {
  const values: IndicatorValues = {}

  if (selected.has('rsi')) {
    const value = rsi(prices, 14)
    if (!isNullish(value)) {
      values.rsi14 = round(value, 2)
      values.rsiSignal = value >= 70 ? 'overbought' : value <= 30 ? 'oversold' : 'neutral'
    }
  }
  if (selected.has('macd')) {
    const value = macd(prices, 12, 26, 9)
    if (!isNullish(value)) {
      values.macd = {
        macd: round(value.macd, 4),
        signal: round(value.signal, 4),
        histogram: round(value.histogram, 4)
      }
    }
  }
  if (selected.has('sma')) {
    const s20 = sma(prices, 20)
    const s50 = sma(prices, 50)
    const s200 = sma(prices, 200)
    if (!isNullish(s20)) values.sma20 = round(s20, 4)
    if (!isNullish(s50)) values.sma50 = round(s50, 4)
    if (!isNullish(s200)) values.sma200 = round(s200, 4)
  }
  if (selected.has('ema')) {
    const e12 = ema(prices, 12)
    const e26 = ema(prices, 26)
    if (!isNullish(e12)) values.ema12 = round(e12, 4)
    if (!isNullish(e26)) values.ema26 = round(e26, 4)
  }
  if (selected.has('bbands')) {
    const value = bollinger(prices, 20, 2)
    if (!isNullish(value)) {
      values.bbands = {
        basis: round(value.basis, 4),
        upper: round(value.upper, 4),
        lower: round(value.lower, 4)
      }
    }
  }
  if (selected.has('adx')) {
    const value = adx(candles, 14)
    if (!isNullish(value)) {
      values.adx14 = {
        adx: round(value.adx, 2),
        plusDi: round(value.plusDi, 2),
        minusDi: round(value.minusDi, 2)
      }
    }
  }
  if (selected.has('atr')) {
    const value = atr(candles, 14)
    const last = candles[candles.length - 1]
    if (!isNullish(value)) {
      const pct = !isNullish(last) && last.close !== 0 ? round((value / last.close) * 100, 2) : 0
      values.atr14 = { value: round(value, 4), pct }
    }
  }
  if (selected.has('obv')) {
    const value = obv(candles)
    if (!isNullish(value)) values.obv = round(value, 2)
  }
  if (selected.has('roc')) {
    const value = roc(prices, 10)
    if (!isNullish(value)) values.roc10 = round(value, 4)
  }
  if (selected.has('mom')) {
    const value = momentum(prices, 10)
    if (!isNullish(value)) values.mom10 = round(value, 4)
  }

  return values
}
